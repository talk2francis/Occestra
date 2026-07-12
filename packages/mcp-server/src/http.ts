/**
 * The public HTTP surface. Stateless /mcp: a fresh McpServer and transport per request, so
 * two agents calling at once can never see each other's session.
 *
 * The paywall sits between "which tool did you ask for" and "run it": we read the tool name
 * off the JSON-RPC body, price it, and gate it BEFORE any model is touched.
 */
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Express, type Request, type Response } from "express";
import { rubricAsJson, rubricAsMarkdown } from "@occestra/tribunal";
import { HOUSE_STYLES } from "@occestra/providers";
import { PRICES, OkxGate, isFree, type PaymentGate } from "./gate.js";
import { VERSION, buildServer, type ServerContext } from "./server.js";

export interface AppContext extends ServerContext {
  gate: PaymentGate;
  sealerAddress?: string;
  live?: Record<string, boolean>;
}

/* -------------------------------------------------------------- rate limit */

const WINDOW_MS = 60_000;
const BURST = 60;

interface Bucket {
  count: number;
  resetAt: number;
}

export function rateLimiter(limit = BURST, windowMs = WINDOW_MS, now: () => number = Date.now) {
  const buckets = new Map<string, Bucket>();

  return (ip: string): boolean => {
    const bucket = buckets.get(ip);
    const time = now();

    if (!bucket || bucket.resetAt <= time) {
      buckets.set(ip, { count: 1, resetAt: time + windowMs });
      return true;
    }

    if (bucket.count >= limit) return false;

    bucket.count += 1;
    return true;
  };
}

/* ---------------------------------------------------------------- the app */

export function buildApp(ctx: AppContext): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));

  const allow = rateLimiter();

  app.use((req, res, next) => {
    const ip = req.ip ?? "unknown";
    if (!allow(ip)) {
      res.status(429).json({ error: "too many requests — 60 per minute per IP" });
      return;
    }
    next();
  });

  /* ---------------------------------------------------------------- health */

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "occestra",
      version: VERSION,
      oqsVersion: rubricAsJson().oqsVersion,
      paymentMode: ctx.gate.mode,
      live: ctx.live ?? {},
      coverageGaps: ctx.coverageGaps,
    });
  });

  /* -------------------------------------------------------------- manifest */

  app.get("/.well-known/occestra.json", (_req, res) => {
    res.json({
      name: "Occestra",
      tagline: "Every moment, made monumental.",
      version: VERSION,
      description:
        "The Occasion Studio. Give it any moment — a birthday next Saturday, a product launching Friday, a trip just taken — and it returns finished, grounded, quality-graded work with on-chain provenance.",
      transport: { type: "mcp", protocol: "streamable-http", endpoint: `${ctx.publicBaseUrl}/mcp` },
      payment: {
        standard: "x402",
        x402Version: 2,
        scheme: "exact",
        network: `eip155:${ctx.chainId}`,
        challengeHeader: "PAYMENT-REQUIRED",
        proofHeader: "PAYMENT-SIGNATURE",
        responseHeader: "PAYMENT-RESPONSE",
        asset: ctx.gate instanceof OkxGate ? undefined : undefined,
        currency: "USDT",
      },
      tools: Object.entries(PRICES).map(([name, priceUsdt]) => ({
        name,
        priceUsdt,
        free: priceUsdt === 0,
      })),
      quality: {
        standard: "Occestra Quality Standard",
        version: rubricAsJson().oqsVersion,
        published: `${ctx.publicBaseUrl}/standard`,
      },
      provenance: {
        chainId: ctx.chainId,
        registry: ctx.registry,
        sealer: ctx.sealerAddress,
        domain: { name: "Occestra", version: "1" },
      },
      styles: Object.values(HOUSE_STYLES).map((style) => ({
        id: style.id,
        name: style.name,
        version: style.version,
        palette: style.palette,
      })),
    });
  });

  /* --------------------------------------------------- the published rubric */

  app.get("/standard", (req, res) => {
    if (req.accepts(["json", "text"]) === "json") {
      res.json(rubricAsJson());
      return;
    }
    res.type("text/markdown").send(rubricAsMarkdown());
  });

  /* --------------------------------------------------------- public keepsake */

  app.get("/k/:id", (req, res) => {
    const pack = ctx.store.publicPack(req.params.id);
    if (!pack) {
      res.status(404).json({ error: "no keepsake with that id" });
      return;
    }
    res.json(pack);
  });

  /* --------------------------------------------------- signed artifact bytes */

  app.get("/a/*key", async (req, res) => {
    const key = decodeURIComponent(
      Array.isArray(req.params["key"]) ? req.params["key"].join("/") : String(req.params["key"] ?? ""),
    );
    const expires = Number(req.query["exp"]);
    const token = String(req.query["tok"] ?? "");

    if (!ctx.store.verifyToken(key, expires, token)) {
      res.status(403).json({ error: "this link is not valid, or it has expired" });
      return;
    }

    const object = await ctx.store.storage.get(key);
    if (!object) {
      res.status(404).json({ error: "not found" });
      return;
    }

    res.type(object.contentType).send(Buffer.from(object.bytes));
  });

  /* -------------------------------------------------------------------- mcp */

  app.post("/mcp", async (req: Request, res: Response) => {
    const body = req.body as { method?: string; params?: { name?: string } } | undefined;

    // The paywall: price the requested tool, gate it, and only then do any work.
    if (body?.method === "tools/call") {
      const tool = body.params?.name ?? "";
      const priceUsdt = PRICES[tool as keyof typeof PRICES];

      if (priceUsdt === undefined) {
        res.status(404).json({ error: `unknown tool: ${tool}` });
        return;
      }

      if (!isFree(tool)) {
        const verdict = await ctx.gate.check({ headers: req.headers }, tool, priceUsdt);

        if (!verdict.ok && verdict.status === 402) {
          ctx.store.recordOrder({
            id: `o_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            tool,
            priceUsdt,
            payerRef: "unpaid",
            status: "pending",
            createdAt: Date.now(),
          });

          res
            .status(402)
            .set("PAYMENT-REQUIRED", verdict.headerValue)
            .json(verdict.challenge);
          return;
        }

        if (!verdict.ok) {
          res.status(verdict.status).json({ error: verdict.reason });
          return;
        }

        ctx.store.recordOrder({
          id: `o_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          tool,
          priceUsdt,
          payerRef: verdict.payerRef,
          status: "paid",
          ...(verdict.txHash ? { txHash: verdict.txHash } : {}),
          createdAt: Date.now(),
        });

        res.set(
          "PAYMENT-RESPONSE",
          OkxGate.settlementHeader(verdict, String(priceUsdt)),
        );
      }
    }

    // Stateless: a fresh server + transport per request (gotcha #4).
    const server = buildServer(ctx);
    const transport = new StreamableHTTPServerTransport(
      {} as ConstructorParameters<typeof StreamableHTTPServerTransport>[0],
    );

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      // @ts-expect-error -- SDK Transport optional-property variance
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: error instanceof Error ? error.message : "internal error" },
          id: null,
        });
      }
    }
  });

  // Stateless means stateless: no SSE stream to GET, no session to DELETE.
  app.get("/mcp", (_req, res) => {
    res.status(405).json({ error: "Occestra's MCP endpoint is stateless: POST only." });
  });
  app.delete("/mcp", (_req, res) => {
    res.status(405).json({ error: "Occestra's MCP endpoint is stateless: POST only." });
  });

  return app;
}

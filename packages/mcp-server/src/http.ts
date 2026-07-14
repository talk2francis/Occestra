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
import { capabilities as a2aCapabilities } from "./a2a/capability.js";
import { callerIp as demoCallerIp, handleDemoRun } from "./demo.js";
import { handleDelete, handleUpload } from "./uploads.js";
import { VERSION, buildServer, packResult, type ServerContext } from "./server.js";

export interface AppContext extends ServerContext {
  gate: PaymentGate;
  sealerAddress?: string;
  live?: Record<string, boolean>;
  /** Shared secret for the internal Studio demo route; absent = route is off. */
  demoSecret?: string;
  demoDailyCap?: number;
  /** Free runs one caller may take per day. Default 2 — enough to try it, not to farm it. */
  demoPerIpCap?: number;
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
    const anchor = ctx.store.anchorQueueHealth();

    // A seal stuck in the queue is a promise made and not kept, and it must be loud.
    // Two anchor cycles (30min each) is generous; past that, something is wrong.
    //
    // But it does NOT flip `ok`. The watchdog restarts the service on !ok, and a
    // restart cannot un-stick a queue that is stuck for want of gas — it would just
    // bounce a perfectly healthy ASP every ten minutes, dropping paid requests
    // mid-flight. The service is fine; the queue is not. Those are different facts,
    // and the alerter reads them separately.
    const anchorStalled = anchor.queued > 0 && anchor.oldestAgeMinutes > 90;

    res.json({
      ok: true,
      service: "occestra",
      version: VERSION,
      oqsVersion: rubricAsJson().oqsVersion,
      paymentMode: ctx.gate.mode,
      live: ctx.live ?? {},
      coverageGaps: ctx.coverageGaps,
      anchorQueue: { ...anchor, stalled: anchorStalled },
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

  /* ------------------------------------------------------ a2a capabilities */

  // Public: what Occestra takes on as negotiated work, priced and specified.
  // The same declaration the negotiation skill enforces — no drift possible.
  app.get("/a2a/capabilities", (_req, res) => {
    res.json(a2aCapabilities());
  });

  /* ---------------------------------------------------------- live counters */

  app.get("/stats", (_req, res) => {
    res.json({ ...ctx.store.stats(), oqsVersion: rubricAsJson().oqsVersion, asOf: new Date().toISOString() });
  });

  /* -------------------------------------------- internal Studio demo (SSE) */

  app.get("/internal/demo/quota", (req, res) => {
    if (!ctx.demoSecret || req.get("x-oce-demo-secret") !== ctx.demoSecret) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const since = Date.now() - 24 * 60 * 60 * 1000;

    const cap = ctx.demoDailyCap ?? 8;
    const used = ctx.store.demoRunsSince(since);

    // Two limits guard the free Studio: a shared daily pool, and a per-caller share of
    // it. The button must reflect whichever bites FIRST — otherwise someone who has spent
    // their own runs sees an enabled button, clicks it, and gets a 429 for their trouble.
    const perIpCap = ctx.demoPerIpCap ?? 2;
    const perIpUsed = ctx.store.demoRunsByIpSince(demoCallerIp(req), since);

    const remaining = Math.min(Math.max(0, cap - used), Math.max(0, perIpCap - perIpUsed));

    res.json({ used, cap, perIpUsed, perIpCap, remaining });
  });

  // Real pipelines, real events, metered. Reached only via the Next server
  // with the shared secret — see demo.ts for the full contract.
  app.post("/internal/demo/run", (req, res) => {
    void handleDemoRun(
      {
        ...ctx,
        demoDailyCap: ctx.demoDailyCap ?? 8,
        demoPerIpCap: ctx.demoPerIpCap ?? 2,
        packForClient: (pack) => packResult(ctx, pack),
      },
      req,
      res,
    );
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

  /* ---------------------------------------------------------------- uploads */

  // Private by default. EXIF (and GPS) stripped on ingest. Never indexed, never public.
  app.post("/uploads", async (req, res) => {
    await handleUpload({ store: ctx.store }, req, res);
  });

  // Delete my project. It actually deletes: pack, artifacts, AND the uploads behind them.
  app.delete("/projects/:id", (req, res) => {
    handleDelete({ store: ctx.store }, req, res);
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

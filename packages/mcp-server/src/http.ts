/**
 * The public HTTP surface. Stateless /mcp: a fresh McpServer and transport per request, so
 * two agents calling at once can never see each other's session.
 *
 * The paywall sits between "which tool did you ask for" and "run it": we read the tool name
 * off the JSON-RPC body, price it, and gate it BEFORE any model is touched.
 */
import { createHash } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Express, type Request, type Response } from "express";
import { rubricAsJson, rubricAsMarkdown } from "@occestra/tribunal";
import { HOUSE_STYLES } from "@occestra/providers";
import { OkxGate, PACK_TOOLS, PRICES, isFree, paymentNonceOf, priceOf, type PackToolName, type PaymentGate } from "./gate.js";
import { capabilities as a2aCapabilities } from "./a2a/capability.js";
import { callerIp as demoCallerIp, handleDemoRecovery, handleDemoRun } from "./demo.js";
import { PolicyRefusal, screenToolInput, writeToast, type WriteToastInput } from "./pipelines.js";
import { handleDelete, handleUpload } from "./uploads.js";
import {
  VERSION,
  buildServer,
  packResult,
  packToolSchema,
  toJson,
  type ServerContext,
  type ToolResult,
} from "./server.js";
import type { JobQueue } from "./jobs.js";

export interface AppContext extends ServerContext {
  gate: PaymentGate;
  jobs?: JobQueue;
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

/* -------------------------------------------------------------- idempotency */

interface StoredResponse {
  payload: unknown;
  isError: boolean;
  paymentResponse?: string;
}

/**
 * The same answer, again, and NOT a second charge.
 *
 * Rebuilt from the payload rather than replayed as bytes, and deliberately so: the retry has
 * its own JSON-RPC id, and a client that gets back the id of a request it gave up on minutes
 * ago will drop the response on the floor. Same answer, addressed to the question actually
 * being asked.
 */
function replay(res: Response, id: unknown, stored: StoredResponse): void {
  // True the first time, still true now — it describes the settlement that really happened.
  if (stored.paymentResponse) res.set("PAYMENT-RESPONSE", stored.paymentResponse);
  res.set("Idempotency-Replayed", "true");

  res.status(200).json({
    jsonrpc: "2.0",
    id: id ?? null,
    result: {
      content: [
        {
          type: "text",
          text: stored.isError ? String(stored.payload) : toJson(stored.payload),
        },
      ],
      ...(stored.isError ? { isError: true } : {}),
    },
  });
}

/** The same paid plain-HTTP answer, without wrapping it in an MCP JSON-RPC envelope. */
function replayPlain(res: Response, stored: StoredResponse): void {
  if (stored.paymentResponse) res.set("PAYMENT-RESPONSE", stored.paymentResponse);
  res.set("Idempotency-Replayed", "true");
  res.status(200).json(stored.payload);
}

/* ----------------------------------------------------- plain x402 service */

const PLAIN_X402_TOOL = "oce_write_toast" as const;
const DEFAULT_PLAIN_TOAST_SUBJECT = "the people who made this moment possible";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * `task-402-pay` replays either a GET with no body or a POST carrying the service body. Accept
 * both. A few buyers wrap the body as `arguments`, `input`, `body` or `params`; unwrap those too.
 */
function plainToastInput(req: Request): WriteToastInput {
  const source = req.method === "GET" ? req.query : req.body;
  let body: JsonObject = isJsonObject(source) ? source : {};

  for (const key of ["arguments", "input", "body", "params"] as const) {
    if (isJsonObject(body[key])) {
      body = body[key];
      break;
    }
  }

  const text = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = body[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return undefined;
  };

  const rawLength = body["lengthSeconds"] ?? body["length_seconds"];
  const lengthSeconds =
    typeof rawLength === "number"
      ? rawLength
      : typeof rawLength === "string" && rawLength.trim()
        ? Number(rawLength)
        : undefined;

  const candidate = {
    subject: text("subject", "topic", "occasion", "for", "name") ?? DEFAULT_PLAIN_TOAST_SUBJECT,
    relationship: text("relationship"),
    tone: text("tone"),
    details: text("details", "message", "prompt", "description"),
    ...(Number.isFinite(lengthSeconds) ? { lengthSeconds } : {}),
  };

  // One schema still governs the MCP tool, the async job and this compatibility service.
  return packToolSchema(PLAIN_X402_TOOL).parse(candidate) as WriteToastInput;
}

/* ---------------------------------------------------------------- the app */

export function buildApp(ctx: AppContext): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));

  const allow = rateLimiter();

  app.use((req, res, next) => {
    // OUR OWN SERVER-SIDE RENDERS ARE NOT ABUSE, AND THIS LIMIT WAS TREATING THEM AS SUCH.
    //
    // The web app fetches packs from here over loopback while rendering a page. Every
    // visitor therefore arrives at this limiter as 127.0.0.1 — and the gallery fetches
    // SEVENTEEN packs to draw one page. Three gallery views in a minute is 51 requests
    // from "one IP"; a fourth tips past 60 and the ASP starts 429ing, at which point /k
    // pages 404 and the gallery empties — for everybody, at once.
    //
    // A loopback caller with no forwarded chain is our own renderer, not the public. The
    // limiter still guards every request that actually came in off the internet, because
    // Caddy stamps those with x-forwarded-for.
    const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim();
    const peer = req.ip ?? "unknown";
    const internal = !forwarded && (peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1");

    if (internal) {
      next();
      return;
    }

    if (!allow(forwarded ?? peer)) {
      res.status(429).json({ error: "too many requests — 60 per minute per IP" });
      return;
    }
    next();
  });

  /* ---------------------------------------------------------------- health */

  app.get("/health", (_req, res) => {
    const anchor = ctx.store.anchorQueueHealth();
    const jobs = ctx.store.jobQueueHealth();
    const owed = ctx.store.refundsOwed();

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
      jobs,
      // The number we would most like not to publish, published. Money taken for work that
      // was never delivered is a debt, and a debt nobody can see is not a debt, it is a loss
      // somebody else absorbed.
      refundsOwed: {
        count: owed.length,
        usdt: Number(owed.reduce((sum, refund) => sum + refund.amountUsdt, 0).toFixed(6)),
      },
    });
  });

  /* -------------------------------------------------------------- manifest */

  app.get("/.well-known/occestra.json", (_req, res) => {
    // Everything a buying agent needs to decide, in one document, with no round-trip: what we
    // sell, what it costs, what token in what network, how to run the long jobs, how not to be
    // charged twice, what the standard is, what we promise, and what we do when we break it.
    const terms = ctx.gate instanceof OkxGate ? ctx.gate.terms : undefined;
    const owed = ctx.store.refundsOwed();

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
        currency: "USDT",
        // THE ASSET, ACTUALLY STATED. This field used to read
        // `ctx.gate instanceof OkxGate ? undefined : undefined` — both branches undefined —
        // so the one thing a buyer needs before they can sign anything was never advertised,
        // and they had to provoke a 402 to find out what token we take.
        ...(terms
          ? {
              asset: terms.asset,
              assetName: terms.assetName,
              assetVersion: terms.assetVersion,
              decimals: terms.decimals,
              payTo: terms.payTo,
              maxTimeoutSeconds: terms.maxTimeoutSeconds,
              settlement: "EIP-3009 transferWithAuthorization, redeemed by us — you pay USDT, we pay the gas",
            }
          : { mode: ctx.gate.mode, note: "Not in okx payment mode: every tool is currently free." }),
      },
      tools: [
        ...Object.entries(PRICES).map(([name, priceUsdt]) => ({
          name,
          priceUsdt,
          free: priceUsdt === 0,
        })),
        {
          name: "oce_create_pack_job",
          priceUsdt: "the price of the tool it runs",
          free: false,
          runs: PACK_TOOLS,
        },
      ],
      async: {
        create: "oce_create_pack_job",
        poll: "oce_job_status",
        collect: "oce_job_result",
        cancel: "oce_cancel_job",
        statusUrl: `${ctx.publicBaseUrl}/j/{jobId}`,
        note: "Long work (launch kits especially) should be run as a job. Polling and collecting are free.",
      },
      idempotency: {
        header: "Idempotency-Key",
        default: "the x402 payment nonce, when no header is sent",
        replayHeader: "Idempotency-Replayed",
        note: "A retry of an identical paid request returns the original response and is never charged twice.",
      },
      // What we do when we take money and deliver nothing. Published, including the number.
      refunds: {
        policy:
          "x402 settles before the work runs. Any paid call that delivers nothing books a refund against the payer's address, and it is returned on chain.",
        cancelledQueued: "refunded in full — nothing had been spent",
        cancelledRunning: "not refunded — the money is already with the providers doing the work",
        owedNow: owed.length,
        owedUsdt: Number(owed.reduce((sum, refund) => sum + refund.amountUsdt, 0).toFixed(6)),
      },
      quality: {
        standard: "Occestra Quality Standard",
        version: rubricAsJson().oqsVersion,
        published: `${ctx.publicBaseUrl}/standard`,
        // Grading is profile-based: an artifact is scored on the axes that mean something for
        // what it is, and the visual profile carries subject_fidelity (the map-incident axis).
        profiles: rubricAsJson().profiles.map((p) => ({ id: p.id, axes: p.axes.map((a) => a.id) })),
        checks: rubricAsJson().checks.map((check) => check.id),
        maxRepairs: rubricAsJson().maxRepairs,
        note: "Every artifact is graded before you get it, against the profile for its kind, and the report ships with it — pass or fail.",
      },
      provenance: {
        chainId: ctx.chainId,
        registry: ctx.registry,
        sealer: ctx.sealerAddress,
        domain: { name: "Occestra", version: "1" },
        verify: "oce_verify_keepsake — free, forever",
      },
      styles: Object.values(HOUSE_STYLES).map((style) => ({
        id: style.id,
        name: style.name,
        version: style.version,
        palette: style.palette,
        appliesTo: style.appliesTo.studios,
        bestFor: style.bestFor,
      })),
      limits: {
        rateLimit: "60 requests per minute per IP",
        uploads: "8 images per request, 10MB each, EXIF stripped on ingest",
        jobConcurrency: "the queue runs a bounded number of packs at once; the rest wait, they are not dropped",
      },
      a2a: `${ctx.publicBaseUrl}/a2a/capabilities`,
      docs: "https://occestra.xyz/docs",
      liveCounters: `${ctx.publicBaseUrl}/stats`,
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

  // Public, privacy-safe activity pulse for the landing marquee. No user title,
  // brief or artifact content is returned; private packs never enter the query.
  app.get("/recent-packs", (req, res) => {
    const requested = Number.parseInt(String(req.query.limit ?? "8"), 10);
    res.json({
      packs: ctx.store.recentPublicSealedPacks(Number.isFinite(requested) ? requested : 8),
      asOf: new Date().toISOString(),
    });
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

  app.get("/internal/demo/run/:id", (req, res) => {
    handleDemoRecovery(
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

  /* -------------------------------------------------------------- job status */

  // The same thing oce_job_status returns, over plain HTTP, for anything that would rather
  // poll a URL than speak MCP. Free, like the tool.
  app.get("/j/:id", (req, res) => {
    const job = ctx.store.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "no job with that id" });
      return;
    }

    res.json({
      jobId: job.id,
      tool: job.tool,
      state: job.state,
      attempts: job.attempts,
      elapsedSeconds: Math.round(((job.finishedAt ?? Date.now()) - job.createdAt) / 1000),
      progress: job.progress,
      // The brief itself is never echoed back here: a job id is not an authorization to read
      // somebody's occasion.
      ...(job.packId ? { keepsakeId: job.packId, keepsake: `${ctx.publicBaseUrl}/k/${job.packId}` } : {}),
      ...(job.error ? { error: job.error } : {}),
    });
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

  /** The fee registered for the plain-HTTP toast service on the shared /mcp URL. */
  const plainX402Fee = (): number => {
    const configured = Number(process.env["OCE_X402_PROBE_FEE"] ?? 0.02);
    return Number.isFinite(configured) && configured > 0 ? configured : 0.02;
  };

  /** The x402 challenge shared by the GET/no-body and POST/business-body buyer paths. */
  const emitX402Probe = (res: Response): boolean => {
    if (!(ctx.gate instanceof OkxGate)) return false;
    const challenge = ctx.gate.challenge(PLAIN_X402_TOOL, plainX402Fee());
    res
      .status(402)
      .set("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(challenge)).toString("base64"))
      .type("application/json")
      .json(challenge);
    return true;
  };

  /**
   * Complete the registered x402 service over ordinary HTTP JSON.
   *
   * This is deliberately NOT sent through StreamableHTTPServerTransport. `task-402-pay` is an
   * HTTP buyer, not an MCP session: it signs the challenge and replays the original GET, or POSTs
   * a business body, with `Accept: application/json`. Sending that replay to the MCP transport is
   * what produced the review-blocking 406 and, worse, meant a valid authorization was never
   * settled. Proper JSON-RPC MCP calls still take the transport path below.
   */
  const handlePlainX402 = async (req: Request, res: Response): Promise<void> => {
    if (!(ctx.gate instanceof OkxGate)) {
      res.status(405).json({ error: "The plain x402 service is available in production payment mode only." });
      return;
    }

    let input: WriteToastInput;
    try {
      input = plainToastInput(req);
      screenToolInput(input);
    } catch (error) {
      if (error instanceof PolicyRefusal) {
        res.status(403).json({ error: error.politeMessage, charged: false });
        return;
      }
      res.status(400).json({
        error: "The toast request body is not valid.",
        detail: error instanceof Error ? error.message : String(error),
        charged: false,
      });
      return;
    }

    const fee = plainX402Fee();
    const idempotencyKey = req.get("idempotency-key")?.trim() || paymentNonceOf(req.headers);

    if (idempotencyKey) {
      const requestHash = createHash("sha256")
        .update(JSON.stringify({ service: PLAIN_X402_TOOL, input }))
        .digest("hex");
      const claim = ctx.store.claimIdempotencyKey(idempotencyKey, requestHash, PLAIN_X402_TOOL);

      if (claim.status === "replay") {
        replayPlain(res, claim.response as StoredResponse);
        return;
      }
      if (claim.status === "in_flight") {
        res.status(409).json({ error: "This paid request is still running — retry shortly.", charged: false });
        return;
      }
      if (claim.status === "conflict") {
        res.status(422).json({
          error: "This payment or Idempotency-Key belongs to a different request.",
          charged: false,
        });
        return;
      }
    }

    const verdict = await ctx.gate.check({ headers: req.headers }, PLAIN_X402_TOOL, fee);
    if (!verdict.ok) {
      if (idempotencyKey) ctx.store.releaseIdempotencyKey(idempotencyKey);
      if (verdict.status === 402) {
        res.status(402).set("PAYMENT-REQUIRED", verdict.headerValue).json(verdict.challenge);
        return;
      }
      res.status(verdict.status).json({ error: verdict.reason, charged: false });
      return;
    }

    const order = {
      id: `o_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: PLAIN_X402_TOOL,
      priceUsdt: fee,
      payerRef: verdict.payerRef,
    };
    ctx.store.recordOrder({
      ...order,
      status: "paid",
      ...(verdict.txHash ? { txHash: verdict.txHash } : {}),
      createdAt: Date.now(),
    });

    const paymentResponse = OkxGate.settlementHeader(verdict, String(fee));
    res.set("PAYMENT-RESPONSE", paymentResponse);
    const requestCtx: ServerContext = { ...ctx, order };

    try {
      const pack = await writeToast(requestCtx, input);
      const payload = {
        ok: true,
        service: PLAIN_X402_TOOL,
        priceUsdt: fee,
        deliverable: packResult(requestCtx, pack),
      };

      if (idempotencyKey) {
        ctx.store.completeIdempotencyKey(idempotencyKey, {
          payload,
          isError: false,
          paymentResponse,
        } satisfies StoredResponse);
      }

      res.status(200).type("application/json").json(payload);
    } catch (error) {
      if (idempotencyKey) ctx.store.releaseIdempotencyKey(idempotencyKey);
      ctx.store.oweRefund({
        orderId: order.id,
        payerRef: order.payerRef,
        amountUsdt: order.priceUsdt,
        tool: order.tool,
        reason: "the plain x402 toast service failed after settlement",
      });
      res.status(500).json({
        error: "The paid toast could not be delivered. A refund has been recorded.",
        charged: true,
        refundOwed: fee,
      });
    }
  };

  app.post("/mcp", async (req: Request, res: Response) => {
    const body = req.body as
      | { jsonrpc?: string; method?: string; params?: { name?: string; arguments?: unknown } }
      | undefined;

    // `task-402-pay` speaks plain HTTP, not MCP. Its signed replay must never reach the MCP
    // transport (which requires text/event-stream). JSON-RPC calls remain genuine MCP traffic.
    const isMcpRequest = body?.jsonrpc === "2.0" && typeof body.method === "string";
    if (!isMcpRequest && ctx.gate instanceof OkxGate) {
      await handlePlainX402(req, res);
      return;
    }
    if (isMcpRequest) {
      const accept = req.get("accept") ?? "";
      if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
        // Reject the transport mismatch BEFORE looking at a payment proof. Otherwise a valid
        // authorization can settle and only then fail with the SDK's 406 — money moved, no work.
        res.status(406).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "MCP clients must accept both application/json and text/event-stream.",
          },
          id: (body as { id?: unknown } | undefined)?.id ?? null,
          charged: false,
        });
        return;
      }
    }

    // The context this ONE request runs under. If money moves, the order is attached to it,
    // so a tool that takes payment and then fails knows exactly what it owes and to whom.
    let requestCtx: ServerContext = ctx;
    let idempotencyKey: string | undefined;

    // The paywall: screen it, validate it, price it, gate it — and only then do any work.
    if (body?.method === "tools/call") {
      const tool = body.params?.name ?? "";
      const args = body.params?.arguments;
      const priceUsdt = priceOf(tool, args);

      if (priceUsdt === undefined) {
        res.status(404).json({ error: `unknown tool: ${tool}` });
        return;
      }

      // 1. WOULD WE EVEN TAKE THIS BRIEF? Asked at the door, before the till.
      //
      // The listing promises "the PolicyGate refuses those briefs before any money is spent",
      // and until now that was false twice over: three of the six paid pipelines never
      // screened at all, and the ones that did screened INSIDE the pipeline — which the gate
      // has already charged for by the time it runs. A refusal we charged for is not a
      // refusal, it is a fee. The screen lives at the door now, where no future tool can
      // forget to call it, because no tool calls it.
      try {
        screenToolInput(args);
      } catch (error) {
        if (error instanceof PolicyRefusal) {
          res.status(403).json({ error: error.politeMessage, charged: false });
          return;
        }
        throw error;
      }

      // 2. ARE THE ARGUMENTS VALID? A job carries another tool's arguments as an opaque
      //    object, so nothing would have checked them until the pipeline crashed on them —
      //    after settlement. A typo should cost a 400, not a charge and a refund.
      if (tool === "oce_create_pack_job") {
        const target = (args as { tool?: string })?.tool as PackToolName;
        const inner = (args as { arguments?: unknown })?.arguments ?? {};
        const parsed = packToolSchema(target).safeParse(inner);
        if (!parsed.success) {
          res.status(400).json({
            error: `these arguments are not valid for ${target}`,
            detail: parsed.error.issues.slice(0, 4).map((issue) => `${issue.path.join(".")}: ${issue.message}`),
            charged: false,
          });
          return;
        }
      }

      // 3. HAVE WE ALREADY DONE THIS? A dropped connection makes a client retry, and a retry
      //    must never be a second charge for a pack we already built. If the buyer sent no
      //    Idempotency-Key, we use the nonce inside their x402 payment — which is unique to
      //    the call and single-use by construction. So the identical request, replayed, is
      //    safe by default, with no change on the buyer's side at all.
      if (!isFree(tool)) {
        idempotencyKey =
          req.get("idempotency-key")?.trim() || paymentNonceOf(req.headers) || undefined;

        if (idempotencyKey) {
          const hash = createHash("sha256")
            .update(JSON.stringify({ tool, args }))
            .digest("hex");
          const claim = ctx.store.claimIdempotencyKey(idempotencyKey, hash, tool);

          if (claim.status === "replay") {
            replay(res, (body as { id?: unknown }).id, claim.response as StoredResponse);
            return;
          }
          if (claim.status === "in_flight") {
            res.status(409).json({
              error: "a request with this Idempotency-Key is still running — poll, do not retry",
              charged: false,
            });
            return;
          }
          if (claim.status === "conflict") {
            res.status(422).json({
              error: "this Idempotency-Key was used for a DIFFERENT request. Use a new key.",
              charged: false,
            });
            return;
          }
        }
      }

      // 4. THE MONEY.
      if (!isFree(tool)) {
        const verdict = await ctx.gate.check({ headers: req.headers }, tool, priceUsdt);

        if (!verdict.ok) {
          // Nothing was done, so the key must not stick — they are entitled to try again.
          if (idempotencyKey) ctx.store.releaseIdempotencyKey(idempotencyKey);

          if (verdict.status === 402) {
            ctx.store.recordOrder({
              id: `o_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              tool,
              priceUsdt,
              payerRef: "unpaid",
              status: "pending",
              createdAt: Date.now(),
            });

            res.status(402).set("PAYMENT-REQUIRED", verdict.headerValue).json(verdict.challenge);
            return;
          }

          res.status(verdict.status).json({ error: verdict.reason });
          return;
        }

        const order = {
          id: `o_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          tool,
          priceUsdt,
          payerRef: verdict.payerRef,
        };

        ctx.store.recordOrder({
          ...order,
          status: "paid",
          ...(verdict.txHash ? { txHash: verdict.txHash } : {}),
          createdAt: Date.now(),
        });

        res.set("PAYMENT-RESPONSE", OkxGate.settlementHeader(verdict, String(priceUsdt)));
        requestCtx = { ...ctx, order };
      }
    }

    // Remember what we answered, so a retry gets the same answer instead of a second bill.
    if (idempotencyKey) {
      const key = idempotencyKey;
      const paymentResponse = res.get("payment-response");

      requestCtx = {
        ...requestCtx,
        onResult: (result: ToolResult) => {
          ctx.store.completeIdempotencyKey(key, {
            ...result,
            ...(paymentResponse ? { paymentResponse } : {}),
          } satisfies StoredResponse);
        },
      };

      // A call that never reached a tool — a transport error, a crash — answered nothing, so
      // the key must not stick. The buyer is entitled to try again, and they have not been
      // given anything to be idempotent ABOUT.
      res.on("close", () => ctx.store.releaseIdempotencyKey(key));
    }

    // Stateless: a fresh server + transport per request (gotcha #4).
    const server = buildServer(requestCtx);
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
  app.get("/mcp", async (req, res) => {
    // `task-402-pay` first discovers with GET, then may replay that exact GET with X-PAYMENT.
    // An unsigned GET gets the challenge; a signed one settles and receives the JSON toast.
    if (ctx.gate instanceof OkxGate) {
      const hasPayment = Boolean(req.get("payment-signature") ?? req.get("x-payment"));
      if (!hasPayment && emitX402Probe(res)) return;
      await handlePlainX402(req, res);
      return;
    }
    res.status(405).json({ error: "Occestra's MCP endpoint is stateless: POST only." });
  });
  app.delete("/mcp", (_req, res) => {
    res.status(405).json({ error: "Occestra's MCP endpoint is stateless: POST only." });
  });

  return app;
}

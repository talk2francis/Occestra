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
import { handleGalleryPublish, handleGalleryWithdraw } from "./showcase.js";
import { PolicyRefusal, screenToolInput } from "./pipelines.js";
import { handleDelete, handleUpload } from "./uploads.js";
import {
  VERSION,
  buildServer,
  executePlainHttpTool,
  isPlainHttpTool,
  packResult,
  packToolSchema,
  plainHttpToolSchema,
  toJson,
  type PlainHttpToolName,
  type ServerContext,
  type ToolResult,
} from "./server.js";
import type { JobQueue } from "./jobs.js";
import type { JobRow } from "./store.js";

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
  /**
   * How long a paid response may take before it hands back a job handle instead of a pack.
   * Defaults to MARKETPLACE_BUDGET_MS; overridden in tests, and by OCE_MARKETPLACE_BUDGET_MS
   * if a future buyer's client turns out to be more or less patient than OKX's thirty seconds.
   */
  marketplaceBudgetMs?: number;
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

/* -------------------------------------------------- the thirty-second wall */

/**
 * THE MARKETPLACE HANGS UP AT THIRTY SECONDS.
 *
 * Measured, not guessed: `onchainos agent task-402-pay` replays the paid endpoint and cuts the
 * connection at exactly 30.0s — Caddy records it as `status 0, duration 30.0`. Occestra's pack
 * tools take 80–130s. So every marketplace-routed purchase of a pack was failing, and failing
 * in the worst possible way: our side kept working, settled the payment and finished the pack
 * into a socket nobody was holding. The buyer's client reported a transport error and got
 * nothing. That is the whole of the 2026-07-28 test failure, and it had nothing to do with
 * which endpoint was listed — `/mcp` and `/x402/<tool>` failed identically.
 *
 * So a paid response now lives inside a BUDGET, measured from the moment the request arrived.
 * Settlement spends part of it; whatever is left is how long we may wait for the pack. If the
 * pack lands inside the budget the buyer gets it in-band, exactly as before. If it does not,
 * they get 200 and a durable job handle — the work continues, it is already paid for, and
 * `oce_job_status` / `oce_job_result` are free. What they never get is a dead connection.
 *
 * The budget is deliberately under 30s rather than at it: the client's clock starts before
 * ours (TLS, request body) and ends after ours (response body), so the margin is real.
 */
const MARKETPLACE_BUDGET_MS = 25_000;

const isPackToolName = (tool: string): tool is PackToolName =>
  (PACK_TOOLS as readonly string[]).includes(tool);

const newJobId = (): string =>
  `job_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Wait for a job, but only for as long as we are allowed to.
 *
 * Returns the terminal row if it reached one in time, or undefined if the budget ran out while
 * it was still working — which is not a failure, just an answer we have to give differently.
 */
async function awaitJobWithin(
  ctx: AppContext,
  jobId: string,
  budgetMs: number,
): Promise<JobRow | undefined> {
  const deadline = Date.now() + budgetMs;

  for (;;) {
    const job = ctx.store.getJob(jobId);
    if (job && (job.state === "done" || job.state === "failed" || job.state === "cancelled")) {
      return job;
    }
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, deadline - Date.now())));
  }
}

/** What a buyer gets when the pack outlived the budget. A receipt, not an apology. */
function pendingPayload(ctx: AppContext, tool: string, fee: number, jobId: string): unknown {
  return {
    ok: true,
    service: tool,
    priceUsdt: fee,
    delivered: false,
    jobId,
    state: "running",
    note:
      "Your payment settled and the work is running. It outlived the response budget, so it is " +
      "being finished as a durable job rather than held on this connection. Nothing further is " +
      "owed and nothing is lost.",
    // CONCRETE URLS, NOT TOOL NAMES. This notice used to say "call oce_job_status", which only
    // exists over MCP JSON-RPC — so a plain HTTP buyer holding a paid, unfinished job followed
    // the instruction literally and hit a wall. Anything named here has to be fetchable as-is.
    poll: `GET ${ctx.publicBaseUrl}/j/${jobId} — free, returns state and progress.`,
    collect: `GET ${ctx.publicBaseUrl}/j/${jobId}/result — free, returns the pack once state is 'done'.`,
    retrieve:
      "Replaying this exact paid request also works: once the job finishes, the same payment " +
      "nonce returns the finished pack instead of this notice.",
    mcp: "Over MCP instead? The same two calls are oce_job_status and oce_job_result, both free.",
    statusUrl: `${ctx.publicBaseUrl}/j/${jobId}`,
    resultUrl: `${ctx.publicBaseUrl}/j/${jobId}/result`,
    publicPage: `${ctx.publicBaseUrl}/j/${jobId}`,
  };
}

/**
 * Turn a finished job into the deliverable the buyer paid for, or an honest failure.
 *
 * `undefined` means "no answer yet" — the caller keeps whatever it already had.
 */
function settledJobPayload(
  ctx: AppContext,
  tool: string,
  fee: number,
  job: JobRow,
): { payload: unknown; isError: boolean } | undefined {
  if (job.state === "done" && job.packId) {
    const pack = ctx.store.getPack(job.packId);
    if (pack) {
      return {
        payload: { ok: true, service: tool, priceUsdt: fee, delivered: true, jobId: job.id, deliverable: packResult(ctx, pack) },
        isError: false,
      };
    }
  }

  if (job.state === "failed" || job.state === "cancelled") {
    return {
      payload: {
        ok: false,
        service: tool,
        priceUsdt: fee,
        delivered: false,
        jobId: job.id,
        state: job.state,
        error: job.error ?? "the run produced no pack",
        refund: "Nothing was delivered, so the payment is booked as owed back to you at /stats.",
      },
      isError: true,
    };
  }

  return undefined;
}

/**
 * A replay of a paid request must answer with the BEST truth available now, not the truth that
 * was available when the connection dropped.
 *
 * This is what closes the marketplace loop. The buyer's first call returns a pending job handle
 * because the pack outlived the budget; their client then replays the same paid request — which
 * is exactly what `agent complete` does — and by then the job has usually finished. Handing back
 * the stale "still running" notice would strand them on a pack they own. So: if the cached
 * response was a pending handle and the job has since reached a terminal state, rebuild it into
 * the real deliverable and rewrite the cache, so every later replay is instant.
 */
function upgradeStoredResponse(ctx: AppContext, key: string, stored: StoredResponse): StoredResponse {
  const payload = stored.payload as
    | { delivered?: boolean; jobId?: string; service?: string; priceUsdt?: number }
    | undefined;

  if (!payload || payload.delivered !== false || !payload.jobId) return stored;

  const job = ctx.store.getJob(payload.jobId);
  if (!job) return stored;

  const settled = settledJobPayload(ctx, payload.service ?? job.tool, payload.priceUsdt ?? 0, job);
  if (!settled) return stored;

  const upgraded: StoredResponse = {
    ...settled,
    ...(stored.paymentResponse ? { paymentResponse: stored.paymentResponse } : {}),
  };

  ctx.store.completeIdempotencyKey(key, upgraded);
  return upgraded;
}

/* ----------------------------------------------------- plain x402 service */

const LEGACY_PLAIN_TOOL = "oce_write_toast" as const;
const DEFAULT_PLAIN_TOAST_SUBJECT = "the people who made this moment possible";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * `task-402-pay` replays either a GET with no body or a POST carrying the service body. Accept
 * both. A few buyers wrap the body as `arguments`, `input`, `body` or `params`; unwrap those too.
 */
function unwrappedPlainBody(req: Request): JsonObject {
  const source = req.method === "GET" ? req.query : req.body;
  let body: JsonObject = isJsonObject(source) ? source : {};

  // Buyer implementations do not all replay the business body in the same envelope. In
  // particular, task-402-pay may preserve a JSON-RPC tools/call wrapper, which nests the actual
  // toast input at params.arguments. Unwrap repeatedly (with a small fixed ceiling) so the paid
  // HTTP service remains transport-agnostic without accepting arbitrary recursive input.
  for (let depth = 0; depth < 4; depth += 1) {
    const nested = ["arguments", "input", "body", "params"]
      .map((key) => body[key])
      .find(isJsonObject);
    if (!nested) break;
    body = nested;
  }

  return body;
}

/** Resolve service identity before touching money. A bodyless shared /mcp stays legacy toast. */
function plainToolOf(req: Request, routeTool?: string): PlainHttpToolName | undefined {
  if (routeTool) return isPlainHttpTool(routeTool) ? routeTool : undefined;

  const body = isJsonObject(req.body) ? req.body : {};
  const params = isJsonObject(body["params"]) ? body["params"] : {};
  const candidates = [
    params["name"],
    req.query["tool"],
    req.query["service"],
    body["tool"],
    body["service"],
    body["serviceName"],
  ];
  for (const value of candidates) {
    if (typeof value === "string" && isPlainHttpTool(value)) return value;
  }
  return LEGACY_PLAIN_TOOL;
}

function defaultPlainInput(tool: PlainHttpToolName, now: number): JsonObject {
  const date = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  switch (tool) {
    case "oce_plan_occasion":
      return { occasion: "a meaningful gathering", city: "Abuja", date, headcount: 8, vibe: "warm and welcoming" };
    case "oce_design_invite":
      return { occasion: "a meaningful celebration", date };
    case "oce_write_toast":
      return { subject: DEFAULT_PLAIN_TOAST_SUBJECT };
    case "oce_moodboard":
      return { subject: "a warm, meaningful gathering" };
    case "oce_make_keepsake":
      return { title: "A moment worth remembering", description: "A keepsake with no invented personal details." };
    case "oce_launch_kit":
      return { productName: "A new project", description: "A thoughtful new product preparing to launch." };
    case "oce_critique":
      return { kind: "written artifact", brief: "Clear, specific, useful writing", text: "A draft submitted for quality review." };
    case "oce_verify_keepsake":
      return {};
  }
}

/**
 * Fields whose value the buyer must supply themselves, because inventing one produces a
 * confident answer to a question nobody asked.
 *
 * A buyer sent a brief for a lunch in Trieste using `location` rather than `city`. The city
 * default filled in "Abuja", and the pipeline produced an internally consistent, well-graded
 * plan for the wrong continent — venues, timezone and weather all faithfully wrong. Nothing
 * could catch it downstream, because nothing about the artifact disagreed with itself.
 *
 * So these are defaulted ONLY for a genuinely bodyless replay, where a default is the honest
 * way to answer a probe that asked nothing. The moment a buyer sends a body, a missing one of
 * these is their omission to fix: they get a 400 naming the field, before any money moves.
 */
const MATERIAL_FIELDS: Partial<Record<PlainHttpToolName, readonly string[]>> = {
  // A city, a date and a headcount are checkable claims about the world. Guess one and the
  // whole plan is confidently, consistently wrong.
  oce_plan_occasion: ["city", "date", "headcount"],
  oce_design_invite: ["date"],
};

// The remaining defaults are deliberately NOT listed. "A keepsake with no invented personal
// details", "A draft submitted for quality review" — those are neutral placeholders that
// assert nothing about anybody, which is the opposite failure mode and the right behaviour
// for a probe. They stay.

/**
 * Synonyms an agent buyer plausibly reaches for. Mapping the buyer's OWN value onto the field
 * it belongs in is not invention — it is reading what they wrote. Only unambiguous pairs.
 */
const FIELD_ALIASES: Readonly<Record<string, string>> = {
  location: "city",
  place: "city",
  town: "city",
  guestCount: "headcount",
  guest_count: "headcount",
  guests: "headcount",
  tone: "vibe",
  mood: "vibe",
  style: "styleId",
};

function applyAliases(body: JsonObject): JsonObject {
  const out: JsonObject = { ...body };
  for (const [alias, field] of Object.entries(FIELD_ALIASES)) {
    if (out[alias] !== undefined && out[field] === undefined) out[field] = out[alias];
  }
  return out;
}

/** Normalize buyer envelopes and apply honest, tool-specific defaults for bodyless replays. */
function plainToolInput(req: Request, tool: PlainHttpToolName, now: number): unknown {
  const raw = unwrappedPlainBody(req);
  const body = applyAliases(raw);

  // A bodyless replay asked nothing, so a default answers it honestly. A body that names some
  // fields but not others is a brief with a hole in it, and the hole is the buyer's to fill.
  const bodyless = Object.keys(raw).length === 0;
  let defaults = defaultPlainInput(tool, now);

  if (!bodyless) {
    const material = MATERIAL_FIELDS[tool] ?? [];
    defaults = Object.fromEntries(
      Object.entries(defaults).filter(([key]) => !material.includes(key)),
    );
  }

  if (tool !== "oce_write_toast") {
    return plainHttpToolSchema(tool).parse({ ...defaults, ...body });
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

  return plainHttpToolSchema(tool).parse({ ...defaults, ...candidate });
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
          ...(isPlainHttpTool(name) ? { plainHttp: `${ctx.publicBaseUrl}/x402/${name}` } : {}),
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

  // Owner-approved community work. Private source ids, management capabilities and source
  // metadata never enter this response.
  app.get("/gallery-submissions", (req, res) => {
    const requested = Number.parseInt(String(req.query.limit ?? "24"), 10);
    const submissions = ctx.store.gallerySubmissions(Number.isFinite(requested) ? requested : 24);
    res.json({
      submissions: submissions.map(({ sourcePackId: _sourcePackId, ...submission }) => submission),
      asOf: new Date().toISOString(),
    });
  });

  app.get("/gallery-activity", (_req, res) => {
    res.json({ ...ctx.store.galleryActivity(), asOf: new Date().toISOString() });
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

  app.post("/internal/demo/gallery", (req, res) => {
    void handleGalleryPublish(
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

  app.delete("/internal/demo/gallery/:id", (req, res) => {
    handleGalleryWithdraw(
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

  /**
   * Collect the finished pack over plain HTTP. Free, like oce_job_result.
   *
   * A buyer whose paid call converted to a durable job was being told to "call oce_job_result",
   * which only exists over MCP JSON-RPC — so an ordinary HTTP buyer holding a paid, unfinished
   * job had nowhere to go. `/j/:id` gave them a state but never the goods. This is the other
   * half, and the pending notice now names both URLs outright.
   */
  app.get("/j/:id/result", (req, res) => {
    const job = ctx.store.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "no job with that id" });
      return;
    }

    if (job.state !== "done" || !job.packId) {
      res.status(200).json({
        jobId: job.id,
        ready: false,
        state: job.state,
        ...(job.error ? { error: job.error } : {}),
        note:
          job.state === "failed" || job.state === "cancelled"
            ? "This job produced no pack, and never will. Any payment for it is booked as owed back to you."
            : "Not finished yet. Poll this URL, or the status URL, until state is 'done'.",
        status: `${ctx.publicBaseUrl}/j/${job.id}`,
      });
      return;
    }

    const pack = ctx.store.getPack(job.packId);
    if (!pack) {
      res.status(404).json({ jobId: job.id, ready: false, error: "the pack for this job is gone" });
      return;
    }

    res.json({ jobId: job.id, ready: true, ...packResult(ctx, pack) });
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

  /**
   * The fee a bare /mcp probe is quoted — and it MUST equal the fee registered on the
   * marketplace for the service listed at that URL, because the buyer's flow validates the
   * quote against the listing and sets its budget from it. A mismatch is not cosmetic: it
   * fails the purchase before any payment is attempted.
   *
   * /mcp is now the endpoint of exactly ONE service, Toast, after the other seven moved to
   * their own /x402/<tool> routes on 2026-07-28. So the honest quote is Toast's real price,
   * and defaulting to it means the probe tracks the listing instead of drifting from it —
   * the old hard-coded 0.02 was correct only while /mcp was a shared multi-service route.
   *
   * This is only right BECAUSE the others moved off /mcp first. If another service is ever
   * listed back onto this URL at a different price, a single flat challenge starts mis-pricing
   * one of them. Give new services their own route.
   */
  const plainX402Fee = (): number => {
    const configured = Number(process.env["OCE_X402_PROBE_FEE"] ?? PRICES[LEGACY_PLAIN_TOOL]);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : PRICES[LEGACY_PLAIN_TOOL];
  };

  const plainFee = (tool: PlainHttpToolName, legacySharedRoute: boolean): number =>
    legacySharedRoute && tool === LEGACY_PLAIN_TOOL ? plainX402Fee() : PRICES[tool];

  /** Emit a service-specific x402 challenge without invoking the MCP transport. */
  const emitX402Probe = (
    res: Response,
    tool: PlainHttpToolName = LEGACY_PLAIN_TOOL,
    legacySharedRoute = true,
  ): boolean => {
    if (!(ctx.gate instanceof OkxGate)) return false;
    const challenge = ctx.gate.challenge(tool, plainFee(tool, legacySharedRoute));
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
  const handlePlainX402 = async (
    req: Request,
    res: Response,
    tool: PlainHttpToolName,
    legacySharedRoute = false,
  ): Promise<void> => {
    if (!(ctx.gate instanceof OkxGate)) {
      res.status(405).json({ error: "The plain x402 service is available in production payment mode only." });
      return;
    }

    // The clock the buyer's client is running starts before this and ends after it. Everything
    // below — validation, settlement, the work itself — spends the same budget.
    const receivedAt = Date.now();

    let input: unknown;
    try {
      input = plainToolInput(req, tool, ctx.deps.clock.now());
      screenToolInput(input);
    } catch (error) {
      if (error instanceof PolicyRefusal) {
        res.status(403).json({ error: error.politeMessage, charged: false });
        return;
      }
      res.status(400).json({
        error: `The request body is not valid for ${tool}.`,
        detail: error instanceof Error ? error.message : String(error),
        charged: false,
      });
      return;
    }

    const fee = plainFee(tool, legacySharedRoute);
    const buyerKey = fee > 0 ? req.get("idempotency-key")?.trim() : undefined;
    const idempotencyKey = fee > 0 ? buyerKey || paymentNonceOf(req.headers) : undefined;
    // Only a key the buyer chose is bound to the exact request. A nonce-derived key is bound
    // to the payment, so a retry with a differently-serialized body still gets its answer.
    const bindRequest = Boolean(buyerKey);

    if (idempotencyKey) {
      const requestHash = createHash("sha256")
        .update(JSON.stringify({ service: tool, input }))
        .digest("hex");
      const claim = ctx.store.claimIdempotencyKey(idempotencyKey, requestHash, tool, {
        bindRequest,
      });

      if (claim.status === "replay") {
        replayPlain(res, upgradeStoredResponse(ctx, idempotencyKey, claim.response as StoredResponse));
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

    let requestCtx: ServerContext = ctx;
    let paymentResponse: string | undefined;
    let order: ServerContext["order"];

    if (fee > 0) {
      const verdict = await ctx.gate.check({ headers: req.headers }, tool, fee);
      if (!verdict.ok) {
        if (idempotencyKey) ctx.store.releaseIdempotencyKey(idempotencyKey);
        if (verdict.status === 402) {
          res.status(402).set("PAYMENT-REQUIRED", verdict.headerValue).json(verdict.challenge);
          return;
        }
        res.status(verdict.status).json({ error: verdict.reason, charged: false });
        return;
      }

      order = {
        id: `o_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tool,
        priceUsdt: fee,
        payerRef: verdict.payerRef,
      };
      ctx.store.recordOrder({
        ...order,
        status: "paid",
        ...(verdict.txHash ? { txHash: verdict.txHash } : {}),
        createdAt: Date.now(),
      });
      paymentResponse = OkxGate.settlementHeader(verdict, String(fee));
      res.set("PAYMENT-RESPONSE", paymentResponse);
      requestCtx = { ...ctx, order };
    }

    try {
      // A pack is minutes of work and the buyer's client hangs up at thirty seconds. Run it as
      // a durable job and wait only for what is left of the budget: in-band if it lands, a job
      // handle if it does not. Short services (critique, verification) stay synchronous —
      // they finish in seconds and the queue only knows how to run packs.
      const budget = ctx.marketplaceBudgetMs ?? MARKETPLACE_BUDGET_MS;

      if (isPackToolName(tool) && ctx.jobs) {
        // Whatever settlement left us. A slow settlement means we wait LESS, never that we
        // fall back to running the pack on this connection — that is the failure mode.
        const remaining = Math.max(0, budget - (Date.now() - receivedAt));
        const jobId = newJobId();

        ctx.store.createJob({
          id: jobId,
          tool,
          args: input as Record<string, unknown>,
          payerRef: order?.payerRef ?? "free",
          priceUsdt: order?.priceUsdt ?? 0,
          ...(order ? { orderId: order.id } : {}),
        });
        ctx.jobs.kick();

        const finished = remaining > 0 ? await awaitJobWithin(ctx, jobId, remaining) : undefined;
        const settled = finished ? settledJobPayload(ctx, tool, fee, finished) : undefined;

        // Whatever we hand back is what a replay of this payment must hand back too — including
        // the pending notice, which the replay path later upgrades once the job is done.
        const result = settled ?? { payload: pendingPayload(ctx, tool, fee, jobId), isError: false };

        if (idempotencyKey) {
          ctx.store.completeIdempotencyKey(idempotencyKey, {
            ...result,
            ...(paymentResponse ? { paymentResponse } : {}),
          } satisfies StoredResponse);
        }

        res.status(200).type("application/json").json(result.payload);
        return;
      }

      // THE SHORT SERVICES NEEDED THE BUDGET TOO.
      //
      // The budget above only guarded pack tools, because those are the minutes-long ones and
      // they have a job queue to hand off to. Critique normally answers in about fifteen
      // seconds, so it slipped under the wall unnoticed — until a denser artifact took past
      // thirty, the buyer's client hung up, and the order was recorded PAID with nothing
      // delivered. Exactly the failure the pack budget exists to prevent, on the one paid path
      // it did not cover.
      //
      // There is no job to hand back here, so the receipt IS the payment nonce: the work runs
      // on to completion and writes its result into the idempotency cache, and replaying the
      // same paid request collects it. Nothing is charged twice and nothing is lost.
      const work = executePlainHttpTool(requestCtx, tool, input).then(
        (deliverable) => {
          const done = { ok: true, service: tool, priceUsdt: fee, delivered: true, deliverable };
          if (idempotencyKey) {
            ctx.store.completeIdempotencyKey(idempotencyKey, {
              payload: done,
              isError: false,
              ...(paymentResponse ? { paymentResponse } : {}),
            } satisfies StoredResponse);
          }
          return done;
        },
        (error: unknown) => {
          // The response may already have gone; this still has to settle the books.
          if (idempotencyKey) ctx.store.releaseIdempotencyKey(idempotencyKey);
          if (order) {
            ctx.store.oweRefund({
              orderId: order.id,
              payerRef: order.payerRef,
              amountUsdt: order.priceUsdt,
              tool: order.tool,
              reason: `the plain x402 ${tool} service failed after settlement`,
            });
          }
          throw error;
        },
      );

      const budgetLeft = Math.max(
        0,
        (ctx.marketplaceBudgetMs ?? MARKETPLACE_BUDGET_MS) - (Date.now() - receivedAt),
      );

      let timer: NodeJS.Timeout | undefined;
      const overran = Symbol("overran");
      const raced = await Promise.race([
        work,
        new Promise<typeof overran>((resolve) => {
          timer = setTimeout(() => resolve(overran), budgetLeft);
          timer.unref?.();
        }),
      ]);
      if (timer) clearTimeout(timer);

      if (raced === overran) {
        // Deliberately NOT cached: the real result is still coming and must be what a replay
        // returns. Until then a replay honestly reports the work as still running.
        res.status(200).type("application/json").json({
          ok: true,
          service: tool,
          priceUsdt: fee,
          delivered: false,
          note:
            "Your payment settled and the work is still running. It outlived the response " +
            "budget, so it is being finished rather than held on this connection. Nothing " +
            "further is owed and nothing is lost.",
          collect:
            "Replay this exact paid request — same payment nonce, same body — and it returns " +
            "the finished result. Until it is ready the replay says so; it is never a second charge.",
        });
        return;
      }

      res.status(200).type("application/json").json(raced);
    } catch (error) {
      ctx.deps.log?.(`plain x402 ${tool} failed after settlement`, error);
      if (idempotencyKey) ctx.store.releaseIdempotencyKey(idempotencyKey);
      if (order) {
        ctx.store.oweRefund({
          orderId: order.id,
          payerRef: order.payerRef,
          amountUsdt: order.priceUsdt,
          tool: order.tool,
          reason: `the plain x402 ${tool} service failed after settlement`,
        });
      }
      res.status(500).json({
        error: order
          ? `The paid ${tool} call could not be delivered. A refund has been recorded.`
          : `${tool} could not be delivered.`,
        charged: Boolean(order),
        ...(order ? { refundOwed: fee } : {}),
      });
    }
  };

  app.post("/mcp", async (req: Request, res: Response) => {
    const body = req.body as
      | { jsonrpc?: string; method?: string; params?: { name?: string; arguments?: unknown } }
      | undefined;

    // `task-402-pay` speaks plain HTTP, not MCP. Some versions preserve a JSON-RPC tools/call
    // envelope while still negotiating ordinary application/json. Classify by BOTH message and
    // transport: only a client accepting text/event-stream is an MCP session. Every JSON-only
    // tools/call replay must reach the named direct pipeline; silently substituting the toast
    // tool records a hollow sale and is worse than an explicit failure.
    const isMcpRequest = body?.jsonrpc === "2.0" && typeof body.method === "string";
    const acceptsEventStream = (req.get("accept") ?? "").includes("text/event-stream");
    const plainRpcTool =
      isMcpRequest &&
      body?.method === "tools/call" &&
      typeof body.params?.name === "string" &&
      isPlainHttpTool(body.params.name) &&
      !acceptsEventStream
        ? body.params.name
        : undefined;
    if ((!isMcpRequest || plainRpcTool) && ctx.gate instanceof OkxGate) {
      const tool = plainRpcTool ?? plainToolOf(req) ?? LEGACY_PLAIN_TOOL;
      await handlePlainX402(req, res, tool, tool === LEGACY_PLAIN_TOOL);
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
        const buyerKey = req.get("idempotency-key")?.trim();
        idempotencyKey = buyerKey || paymentNonceOf(req.headers) || undefined;

        if (idempotencyKey) {
          const hash = createHash("sha256")
            .update(JSON.stringify({ tool, args }))
            .digest("hex");
          const claim = ctx.store.claimIdempotencyKey(idempotencyKey, hash, tool, {
            bindRequest: Boolean(buyerKey),
          });

          if (claim.status === "replay") {
            replay(
              res,
              (body as { id?: unknown }).id,
              upgradeStoredResponse(ctx, idempotencyKey, claim.response as StoredResponse),
            );
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

  // One plain URL per service lets a bodyless buyer preserve service identity. The shared
  // /mcp GET remains the legacy marketplace toast probe; it cannot infer another service from
  // an empty request, so callers/listings for other services should use these explicit routes.
  app.all("/x402/:tool", async (req, res) => {
    const tool = plainToolOf(req, req.params.tool);
    if (!tool) {
      res.status(404).json({ error: `unknown plain x402 service: ${req.params.tool}`, charged: false });
      return;
    }
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ error: "Plain x402 services accept GET or POST." });
      return;
    }
    await handlePlainX402(req, res, tool, false);
  });

  // Stateless means stateless: no SSE stream to GET, no session to DELETE.
  app.get("/mcp", async (req, res) => {
    // `task-402-pay` first discovers with GET, then may replay that exact GET with X-PAYMENT.
    // An unsigned GET gets the challenge; a signed one settles and receives the JSON toast.
    if (ctx.gate instanceof OkxGate) {
      const hasPayment = Boolean(req.get("payment-signature") ?? req.get("x-payment"));
      const tool = plainToolOf(req) ?? LEGACY_PLAIN_TOOL;
      if (!hasPayment && emitX402Probe(res, tool, tool === LEGACY_PLAIN_TOOL)) return;
      await handlePlainX402(req, res, tool, tool === LEGACY_PLAIN_TOOL);
      return;
    }
    res.status(405).json({ error: "Occestra's MCP endpoint is stateless: POST only." });
  });
  app.delete("/mcp", (_req, res) => {
    res.status(405).json({ error: "Occestra's MCP endpoint is stateless: POST only." });
  });

  return app;
}

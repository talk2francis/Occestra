/**
 * The Studio demo path: runs the REAL pipelines with the REAL providers and
 * streams what actually happens as server-sent events. Nothing here fabricates
 * an event — every message fires from a genuine port call (venue search,
 * forecast fetch, image render, Tribunal grade, repair, seal).
 *
 * Access is internal-only: the Next.js server proxies to this with a shared
 * secret; the browser never reaches it directly. Runs are metered per day
 * (they spend our model budget and seal on-chain) and recorded as orders with
 * status "demo" so they can never be mistaken for paid volume.
 */
import type { Request, Response } from "express";
import { z } from "zod";
import type { EngineDeps, Pack } from "@occestra/studio-core";
import { buildGrader, type GraderEvent } from "./grader.js";
import { PolicyRefusal, runPipeline, type PipelineContext } from "./pipelines.js";
import type { Store } from "./store.js";

export type DemoEvent =
  | { type: "run_started"; tool: string; studio: string }
  | { type: "sourcing"; what: "venues" | "weather" | "site"; detail: string }
  | { type: "sourced"; what: "venues" | "weather" | "site"; detail: string }
  | { type: "writing"; detail: string }
  | { type: "rendering"; detail: string }
  | { type: "rendered"; detail: string }
  | GraderEvent
  | { type: "sealing" }
  | { type: "run_complete"; pack: unknown }
  | { type: "run_failed"; message: string; reason: "policy" | "error" };

import { HouseStyleIdSchema } from "@occestra/studio-core";
const StyleId = HouseStyleIdSchema;

const DemoBody = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("oce_plan_occasion"),
    arguments: z.object({
      occasion: z.string().min(3).max(300),
      city: z.string().min(2).max(80),
      date: z.string().min(8).max(20),
      headcount: z.number().int().min(1).max(500),
      vibe: z.string().min(2).max(300),
      budgetUsd: z.number().positive().max(100_000).optional(),
      styleId: StyleId.optional(),
    }),
  }),
  z.object({
    tool: z.literal("oce_make_keepsake"),
    arguments: z.object({
      title: z.string().min(2).max(200),
      description: z.string().max(4000).optional(),
      momentDate: z.string().max(40).optional(),
      tone: z.string().max(200).optional(),
      styleId: StyleId.optional(),
    }),
  }),
  z.object({
    tool: z.literal("oce_launch_kit"),
    arguments: z.object({
      productName: z.string().min(2).max(120),
      url: z.string().url().max(300).optional(),
      description: z.string().max(2000).optional(),
      audience: z.string().max(300).optional(),
      styleId: StyleId.optional(),
    }),
  }),
]);

/** Which studio a tool belongs to — for the event feed, which speaks in studios. */
export function studioOf(tool: string): string {
  if (tool === "oce_plan_occasion" || tool === "oce_design_invite" || tool === "oce_write_toast") {
    return "celebrate";
  }
  if (tool === "oce_make_keepsake") return "remember";
  return "launch";
}

/** The studio role, as a person rather than an enum. */
const ROLE_NAMES: Record<string, string> = {
  planner: "The Planner",
  researcher: "The Researcher",
  art_director: "The Art Director",
  writer: "The Writer",
  critic: "The Critic",
  archivist: "The Archivist",
};

/** Wrap the world-facing ports so real calls surface as real events. */
export function instrumentDeps(deps: EngineDeps, emit: (event: DemoEvent) => void): EngineDeps {
  const announced = new Set<string>();

  return {
    ...deps,
    text: {
      complete: async (request) => {
        // Every model beat used to surface as the SAME sentence — "drafting with the model
        // router" — over and over, which told a watching buyer nothing about what was being
        // made for them. Now each beat says who is working and what they are making, and a
        // beat only announces itself ONCE (a writer that repairs its own copy calls the
        // model several times for one artifact; that is one event, not four).
        const who = ROLE_NAMES[request.role] ?? "The Studio";
        const label = request.producing ? `${who} · ${request.producing}` : who;

        if (!announced.has(label)) {
          announced.add(label);
          emit({ type: "writing", detail: label });
        }
        return deps.text.complete(request);
      },
    },
    image: {
      generate: async (request) => {
        emit({ type: "rendering", detail: `rendering ${request.size ?? "an image"} in the House Style` });
        const result = await deps.image.generate(request);
        emit({ type: "rendered", detail: "image landed, re-encoded through sharp" });
        return result;
      },
    },
    ...(deps.places
      ? {
          places: {
            search: async (query) => {
              emit({ type: "sourcing", what: "venues", detail: `searching OpenStreetMap: “${query.query}”` });
              const places = await deps.places!.search(query);
              emit({ type: "sourced", what: "venues", detail: `${places.length} real candidates found` });
              return places;
            },
          },
        }
      : {}),
    ...(deps.weather
      ? {
          weather: {
            forecast: async (lat, lng, dateISO) => {
              emit({ type: "sourcing", what: "weather", detail: `fetching the real forecast for ${dateISO}` });
              const forecast = await deps.weather!.forecast(lat, lng, dateISO);
              emit({ type: "sourced", what: "weather", detail: forecast.summary });
              return forecast;
            },
          },
        }
      : {}),
    ...(deps.site
      ? {
          site: {
            inspect: async (url: string) => {
              emit({ type: "sourcing", what: "site", detail: `reading ${url} in a headless browser` });
              const inspection = await deps.site!.inspect(url);
              emit({ type: "sourced", what: "site", detail: "brand genome extracted from the rendered page" });
              return inspection;
            },
          } as NonNullable<EngineDeps["site"]>,
        }
      : {}),
  };
}

export interface DemoContext extends PipelineContext {
  store: Store;
  demoSecret?: string;
  demoDailyCap: number;
  /** Free runs one caller may take per day, inside the shared daily cap. */
  demoPerIpCap: number;
  linkChecker?: (url: string) => Promise<boolean>;
  /** Serialise a finished pack for the browser (signed artifact urls etc.). */
  packForClient: (pack: Pack) => unknown;
}

/**
 * Who is asking.
 *
 * We sit behind Caddy, so `req.ip` is the proxy unless the app trusts the forwarded
 * header — take the FIRST entry of x-forwarded-for (the client; later entries are the
 * proxies it passed through). This is a fairness control, not a security boundary: a
 * determined caller can rotate addresses, and the shared daily cap is what stops them.
 */
export function callerIp(req: Request): string {
  const forwarded = req.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || req.ip || "unknown";
}

export async function handleDemoRun(ctx: DemoContext, req: Request, res: Response): Promise<void> {
  if (!ctx.demoSecret || req.get("x-oce-demo-secret") !== ctx.demoSecret) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const parsed = DemoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid demo request", detail: parsed.error.issues[0]?.message });
    return;
  }

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const used = ctx.store.demoRunsSince(since);
  if (used >= ctx.demoDailyCap) {
    res.status(429).json({ error: "demo allowance exhausted for today", used, cap: ctx.demoDailyCap });
    return;
  }

  // The daily cap is a SHARED pool. Without a per-caller cap on top of it, one visitor —
  // or one script — drains the whole day's free allowance in a minute, every real model
  // call is paid for out of our pocket, and every later visitor finds a dead button. The
  // owner has already had his own Studio button killed this way once, by our own seeding.
  const ip = callerIp(req);
  const mine = ctx.store.demoRunsByIpSince(ip, since);
  if (mine >= ctx.demoPerIpCap) {
    res.status(429).json({
      error: "you have used your free Studio runs for today",
      used: mine,
      cap: ctx.demoPerIpCap,
    });
    return;
  }
  ctx.store.recordDemoHit(ip);

  ctx.store.recordOrder({
    id: `o_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tool: parsed.data.tool,
    priceUsdt: 0,
    payerRef: "demo",
    status: "demo",
    createdAt: Date.now(),
  });

  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();

  let closed = false;
  res.on("close", () => {
    closed = true;
  });

  // Kept so an operator can read back what happened without paying to re-run it.
  const log: { at: number; body: unknown }[] = [];

  const emit = (event: DemoEvent): void => {
    log.push({ at: Date.now(), body: event });
    if (closed) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    if (!closed) res.write(": keep-alive\n\n");
  }, 15_000);

  const instrumented = instrumentDeps(ctx.deps, emit);
  const runCtx: PipelineContext = {
    ...ctx,
    deps: instrumented,
    grader: buildGrader({
      deps: instrumented,
      ...(ctx.linkChecker ? { linkChecker: ctx.linkChecker } : {}),
      onEvent: emit,
    }),
  };

  const { tool, arguments: args } = parsed.data;

  emit({ type: "run_started", tool, studio: studioOf(tool) });

  try {
    // One dispatch table, shared with the paid path and the job queue. Three copies of this
    // if/else was three chances to add a tool to only two of them.
    const pack: Pack = await runPipeline(runCtx, tool, args);

    if (ctx.sealer && pack.seal) emit({ type: "sealing" });
    emit({ type: "run_complete", pack: ctx.packForClient(pack) });
    ctx.store.saveEvents(pack.id, log);
  } catch (error) {
    const policy = error instanceof PolicyRefusal;
    const message = policy
      ? (error as PolicyRefusal).politeMessage
      : "the run failed — nothing was charged, and nothing pretended to succeed";
    emit({ type: "run_failed", message, reason: policy ? "policy" : "error" });
  } finally {
    clearInterval(heartbeat);
    if (!closed) res.end();
  }
}

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
import {
  PolicyRefusal,
  launchKit,
  makeKeepsake,
  planOccasion,
  type PipelineContext,
} from "./pipelines.js";
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
  | { type: "run_failed"; message: string };

const StyleId = z.enum(["amethyst_editorial", "gilded_noir", "sunprint", "atlas_ink"]);

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

/** Wrap the world-facing ports so real calls surface as real events. */
function instrumentDeps(deps: EngineDeps, emit: (event: DemoEvent) => void): EngineDeps {
  let lastWriting = 0;

  return {
    ...deps,
    text: {
      complete: async (request) => {
        // The writers make many model calls; one event per beat is plenty.
        const now = Date.now();
        if (now - lastWriting > 1500) {
          lastWriting = now;
          emit({ type: "writing", detail: "drafting with the model router" });
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
  linkChecker?: (url: string) => Promise<boolean>;
  /** Serialise a finished pack for the browser (signed artifact urls etc.). */
  packForClient: (pack: Pack) => unknown;
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

  const emit = (event: DemoEvent): void => {
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
  const studio =
    tool === "oce_plan_occasion" ? "celebrate" : tool === "oce_make_keepsake" ? "remember" : "launch";

  emit({ type: "run_started", tool, studio });

  try {
    let pack: Pack;
    if (tool === "oce_plan_occasion") pack = await planOccasion(runCtx, args);
    else if (tool === "oce_make_keepsake") pack = await makeKeepsake(runCtx, args);
    else pack = await launchKit(runCtx, args);

    if (ctx.sealer && pack.seal) emit({ type: "sealing" });
    emit({ type: "run_complete", pack: ctx.packForClient(pack) });
  } catch (error) {
    const message =
      error instanceof PolicyRefusal
        ? error.politeMessage
        : "the run failed — nothing was charged, and nothing pretended to succeed";
    emit({ type: "run_failed", message });
  } finally {
    clearInterval(heartbeat);
    if (!closed) res.end();
  }
}

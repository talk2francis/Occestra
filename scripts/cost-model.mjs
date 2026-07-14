/**
 * What each tool actually costs us to run.
 *
 * The trick that makes this free: the SHAPE of a run is deterministic — how many images
 * it makes, at what size, at what tier, and how many model calls it takes. So we run
 * every tool against the FAKE providers (zero spend, instant) and count, then price the
 * counts with the provider's REAL rates. The only number that needs a live run is the
 * per-token text spend, which we take from measured smokes.
 *
 *   node scripts/cost-model.mjs
 *
 * Output feeds docs/pricing-rationale.md. Re-run it whenever the pipelines change shape.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDeps, imageCostUsd } from "@occestra/providers";
import { buildGrader } from "@occestra/mcp-server/dist/grader.js";
import {
  designInvite,
  launchKit,
  makeKeepsake,
  moodboard,
  planOccasion,
  writeToast,
} from "@occestra/mcp-server/dist/pipelines.js";
import { Store } from "@occestra/mcp-server/dist/store.js";

/**
 * Measured on the live rail, 2026-07-14: one text-only artifact (a toast) end to end —
 * writer + Tribunal critic, on claude-sonnet-4-6 — came to $0.0033. Text cost scales with
 * the number of model beats a pipeline runs, so we price each beat at that rate.
 */
const USD_PER_TEXT_CALL = 0.0033;

const BRIEFS = {
  oce_plan_occasion: (ctx) =>
    planOccasion(ctx, {
      occasion: "a 30th birthday dinner",
      city: "Lisbon",
      date: "2026-08-18",
      headcount: 12,
      vibe: "warm, candlelit, long table",
    }),
  oce_design_invite: (ctx) =>
    designInvite(ctx, { occasion: "a 30th birthday dinner", city: "Lisbon" }),
  oce_make_keepsake: (ctx) =>
    makeKeepsake(ctx, { title: "The summer we drove to the coast", tone: "quiet, unsentimental" }),
  oce_write_toast: (ctx) =>
    writeToast(ctx, { occasion: "a colleague's last day", speaker: "her teammate", tone: "warm, dry" }),
  oce_moodboard: (ctx) => moodboard(ctx, { subject: "a winter wedding in a stone barn" }),
  oce_launch_kit: (ctx) =>
    launchKit(ctx, {
      productName: "Tidepool",
      description: "A calm inbox for people who work in focus blocks.",
      audience: "indie makers",
    }),
};

/** Count what a run asks the world for, without letting it ask the world for anything. */
function instrument(deps) {
  const images = [];
  let textCalls = 0;

  return {
    counts: { images, get textCalls() { return textCalls; } },
    deps: {
      ...deps,
      text: {
        complete: async (request) => {
          textCalls += 1;
          return deps.text.complete(request);
        },
      },
      image: {
        generate: async (request) => {
          images.push({ size: request.size, quality: request.quality ?? "high" });
          return deps.image.generate(request);
        },
      },
    },
  };
}

const rows = [];

for (const [tool, run] of Object.entries(BRIEFS)) {
  const dir = mkdtempSync(join(tmpdir(), "oce-cost-"));
  const store = new Store({ dataDir: dir, baseUrl: "http://localhost:0" });

  // Fake every provider: free, instant, and the run's SHAPE is identical to the real one.
  const built = buildDeps({ OCE_FAKE_PROVIDERS: "1" }, { storage: store.storage });
  const { counts, deps } = instrument(built.deps);

  const ctx = {
    deps,
    store,
    grader: buildGrader({ deps, linkChecker: built.linkChecker }),
    coverageGaps: [],
    linkChecker: built.linkChecker,
    governor: built.governor,
  };

  try {
    await run(ctx);

    const imageUsd = counts.images.reduce((sum, i) => sum + imageCostUsd(i.size, i.quality), 0);
    const textUsd = counts.textCalls * USD_PER_TEXT_CALL;

    // What the SAME run would have cost before the tiers: every image at the provider's
    // default, which is its most expensive tier.
    const beforeUsd = counts.images.reduce((sum, i) => sum + imageCostUsd(i.size, "high"), 0);

    rows.push({
      tool,
      images: counts.images.length,
      tiers: counts.images.map((i) => `${i.quality[0]}`).join("") || "—",
      textCalls: counts.textCalls,
      imageUsd,
      textUsd,
      totalUsd: imageUsd + textUsd,
      imageUsdBefore: beforeUsd,
    });
  } catch (error) {
    rows.push({ tool, error: error instanceof Error ? error.message : String(error) });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(
  `\n  ${pad("tool", 20)} ${pad("imgs", 5)} ${pad("text", 5)} ${pad("image $", 9)} ${pad("text $", 9)} ${pad("TOTAL $", 9)} was $`,
);
console.log("  " + "─".repeat(76));

for (const r of rows) {
  if (r.error) {
    console.log(`  ${pad(r.tool, 20)} failed: ${r.error.slice(0, 40)}`);
    continue;
  }
  console.log(
    `  ${pad(r.tool, 20)} ${pad(r.images, 5)} ${pad(r.textCalls, 5)} ` +
      `${pad(r.imageUsd.toFixed(4), 9)} ${pad(r.textUsd.toFixed(4), 9)} ` +
      `${pad(r.totalUsd.toFixed(4), 9)} ${(r.imageUsdBefore + r.textUsd).toFixed(4)}`,
  );
}

const now = rows.reduce((s, r) => s + (r.totalUsd ?? 0), 0);
const before = rows.reduce((s, r) => s + (r.imageUsdBefore ?? 0) + (r.textUsd ?? 0), 0);
console.log("  " + "─".repeat(76));
console.log(`  one of each: $${now.toFixed(4)}  (was $${before.toFixed(4)} — ${(100 * (1 - now / before)).toFixed(0)}% cheaper)\n`);

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
 * Measured on the live rail with `node scripts/cost-live.mjs`, 2026-07-14.
 *
 * TWO RATES, NOT ONE, AND THE SECOND ONE USED TO BE ZERO. The critic does not go through the
 * text port — it reaches the vision adapter directly — so nothing that watched the text port
 * ever saw it. The cost governor had this exact blind spot, and so did this model: it counted
 * "beats" (generator calls) and priced them at a single blended rate, while every critique —
 * ONE PER ARTIFACT, plus one more per repair pass — cost nothing at all as far as it knew.
 *
 * A plan produces five artifacts. That is five critiques the old model could not see, on a
 * tool it believed cost $0.0066 and which actually costs $0.1253. It was wrong by NINETEEN
 * TIMES, in the direction that loses money.
 *
 * A critic call is also the more expensive of the two: the whole artifact goes in, the anchored
 * rubric goes in, and ~1100 tokens come back.
 */
const USD_PER_WRITER_CALL = 0.0118;
const USD_PER_CRITIC_CALL = 0.0168;

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
  let writerCalls = 0;
  let criticCalls = 0;

  return {
    counts: {
      images,
      get writerCalls() { return writerCalls; },
      get criticCalls() { return criticCalls; },
    },
    deps: {
      ...deps,
      text: {
        complete: async (request) => {
          writerCalls += 1;
          return deps.text.complete(request);
        },
      },
      // The one that was invisible. Every artifact is graded, and every repair is graded again.
      critique: {
        judge: async (request) => {
          criticCalls += 1;
          return deps.critique.judge(request);
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
    const writerUsd = counts.writerCalls * USD_PER_WRITER_CALL;
    const criticUsd = counts.criticCalls * USD_PER_CRITIC_CALL;
    const textUsd = writerUsd + criticUsd;

    // What the SAME run would have cost before the tiers: every image at the provider's
    // default, which is its most expensive tier.
    const beforeUsd = counts.images.reduce((sum, i) => sum + imageCostUsd(i.size, "high"), 0);

    rows.push({
      tool,
      images: counts.images.length,
      tiers: counts.images.map((i) => `${i.quality[0]}`).join("") || "—",
      writerCalls: counts.writerCalls,
      criticCalls: counts.criticCalls,
      imageUsd,
      writerUsd,
      criticUsd,
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

/** What we charge today. A cost table that does not show the price is half a table. */
const PRICES = {
  oce_plan_occasion: 0.3,
  oce_design_invite: 0.75,
  oce_make_keepsake: 0.75,
  oce_write_toast: 0.1,
  oce_moodboard: 0.3,
  oce_launch_kit: 1.5,
};

const pad = (s, n) => String(s).padEnd(n);
console.log(
  `\n  ${pad("tool", 20)} ${pad("img", 4)} ${pad("wri", 4)} ${pad("cri", 4)} ` +
    `${pad("image $", 9)} ${pad("writer $", 9)} ${pad("critic $", 9)} ${pad("COST", 9)} ${pad("price", 8)} margin`,
);
console.log("  " + "─".repeat(104));

for (const r of rows) {
  if (r.error) {
    console.log(`  ${pad(r.tool, 20)} failed: ${r.error.slice(0, 40)}`);
    continue;
  }

  const price = PRICES[r.tool] ?? 0;
  const margin = price - r.totalUsd;

  console.log(
    `  ${pad(r.tool, 20)} ${pad(r.images, 4)} ${pad(r.writerCalls, 4)} ${pad(r.criticCalls, 4)} ` +
      `${pad(r.imageUsd.toFixed(4), 9)} ${pad(r.writerUsd.toFixed(4), 9)} ${pad(r.criticUsd.toFixed(4), 9)} ` +
      `${pad(r.totalUsd.toFixed(4), 9)} ${pad(price.toFixed(2), 8)} ` +
      `${margin < 0 ? "🔴 " : "   "}${margin >= 0 ? "+" : "−"}${Math.abs(margin).toFixed(4)}`,
  );
}

const cost = rows.reduce((s, r) => s + (r.totalUsd ?? 0), 0);
const revenue = rows.reduce((s, r) => s + (PRICES[r.tool] ?? 0), 0);
const losing = rows.filter((r) => (PRICES[r.tool] ?? 0) < (r.totalUsd ?? 0));

console.log("  " + "─".repeat(104));
console.log(`  one of each: costs $${cost.toFixed(4)}, sells for $${revenue.toFixed(4)} — margin $${(revenue - cost).toFixed(4)}`);
console.log(`  BELOW COST: ${losing.length} of ${rows.length} tools — ${losing.map((r) => r.tool).join(", ") || "none"}\n`);

/* --------------------------------------------- what would we have to charge? */

// A 60% gross margin on the measured cost, rounded UP to something a person would print on a
// price list. Nobody prices at $0.3133.
const round = (n) => {
  const steps = [0.01, 0.02, 0.03, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
  const want = n / 0.4; // cost is 40% of price => 60% gross margin
  return steps.find((step) => step >= want) ?? Math.ceil(want * 2) / 2;
};

console.log(`  For a 60% gross margin, the prices would have to be:\n`);
for (const r of rows) {
  if (r.error) continue;
  const suggested = round(r.totalUsd);
  const gm = 100 * (1 - r.totalUsd / suggested);
  console.log(
    `  ${pad(r.tool, 20)} cost $${r.totalUsd.toFixed(4)}  ->  $${suggested.toFixed(2)}  (${gm.toFixed(0)}% margin, was $${(PRICES[r.tool] ?? 0).toFixed(2)})`,
  );
}
console.log("");

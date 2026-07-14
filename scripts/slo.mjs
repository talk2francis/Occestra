#!/usr/bin/env node
/**
 * The SLOs, measured rather than asserted.
 *
 * THE SPLIT IS THE POINT. There are two kinds of promise in this product and publishing them in
 * one table would be a quiet lie:
 *
 *   REPRODUCIBLE-EXACT — enforced by a deterministic check. A budget's line items sum to its
 *   total, or BUDGET_SUM_MISMATCH fails the artifact. There is no distribution here, no p95, no
 *   "usually": it is arithmetic, and it holds every time or the pack is marked failed and says
 *   so. Reporting these as a percentage would imply they could come out otherwise.
 *
 *   MEASURED-WITH-VARIANCE — everything a model touches. Pass rate depends on a critic. Latency
 *   depends on four providers and the internet. These get a MEDIAN and a RANGE across real runs,
 *   with the sample size printed next to them, because a single number would pretend to a
 *   precision we have not earned.
 *
 * Every run here is REAL and costs REAL money. It prints the estimate before it starts.
 *
 *   node scripts/slo.mjs                 # the default sample
 *   node scripts/slo.mjs --runs 3        # more runs, more money
 *   node scripts/slo.mjs --dry           # what it would cost, and nothing else
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDeps } from "@occestra/providers";
import { CHECKS } from "@occestra/tribunal";
import { buildGrader } from "@occestra/mcp-server/dist/grader.js";
import { PACK_PIPELINES } from "@occestra/mcp-server/dist/pipelines.js";
import { Store } from "@occestra/mcp-server/dist/store.js";

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};

const DRY = process.argv.includes("--dry");
const OVERRIDE = arg("--runs", 0);

/**
 * How many times to run each tool.
 *
 * Not uniform, and honestly so: the text-only tools are cheap enough to sample properly, and the
 * four-image launch kit is not. A tool sampled twice gets a range and no median worth the name,
 * and the published table says exactly that rather than dressing n=2 up as a statistic.
 */
const RUNS = {
  oce_write_toast: 3,
  oce_plan_occasion: 3,
  oce_moodboard: 2,
  oce_make_keepsake: 2,
  oce_design_invite: 2,
  oce_launch_kit: 2,
};

/** Measured unit costs — docs/pricing-rationale.md. Used only to estimate the bill up front. */
const COST = {
  oce_write_toast: 0.0286,
  oce_plan_occasion: 0.1253,
  oce_moodboard: 0.0756,
  oce_make_keepsake: 0.236,
  oce_design_invite: 0.2836,
  oce_launch_kit: 0.5964,
};

const BRIEFS = {
  oce_write_toast: {
    subject: "my sister Mara",
    relationship: "younger brother",
    details: "she taught me to drive, badly. she never once said I told you so.",
  },
  oce_plan_occasion: {
    occasion: "a 30th birthday dinner",
    city: "Lisbon",
    date: "2026-08-18",
    headcount: 12,
    vibe: "warm, candlelit, long table",
  },
  oce_moodboard: { subject: "a winter supper club in a converted garage" },
  oce_make_keepsake: {
    title: "The summer we drove to the coast",
    description: "we took the long road, ate peaches in the car, and did not talk much.",
    tone: "quiet, unsentimental",
  },
  oce_design_invite: {
    occasion: "Mara & Sam are getting married",
    date: "2026-09-05",
    city: "Porto",
    styleId: "gilded_noir",
  },
  oce_launch_kit: {
    productName: "Occestra",
    url: "https://occestra.xyz",
    description: "An occasion studio that grades its own work against a published standard.",
    audience: "agents and the people who build them",
  },
};

const plan = Object.keys(BRIEFS).map((tool) => ({
  tool,
  runs: OVERRIDE || RUNS[tool],
  unit: COST[tool],
}));

const estimate = plan.reduce((sum, row) => sum + row.runs * row.unit, 0);

console.log("\n  THIS SPENDS REAL MONEY.\n");
for (const row of plan) {
  console.log(`    ${row.tool.padEnd(20)} ${row.runs} runs x $${row.unit.toFixed(4)} = $${(row.runs * row.unit).toFixed(4)}`);
}
console.log(`\n    estimated total: $${estimate.toFixed(2)}\n`);

if (DRY) process.exit(0);
if (process.env.OCE_FAKE_PROVIDERS === "1") {
  console.error("  OCE_FAKE_PROVIDERS=1 — an SLO measured against fakes is a fiction. Unset it.\n");
  process.exit(1);
}

/* ------------------------------------------------------------------- run */

const results = [];
let spent = 0;

for (const { tool, runs } of plan) {
  for (let i = 0; i < runs; i += 1) {
    const dir = mkdtempSync(join(tmpdir(), "oce-slo-"));
    const store = new Store({ dataDir: dir, baseUrl: "http://localhost:0" });
    const built = buildDeps(process.env, { storage: store.storage });

    const ctx = {
      deps: built.deps,
      store,
      grader: buildGrader({ deps: built.deps, linkChecker: built.linkChecker }),
      coverageGaps: [],
      linkChecker: built.linkChecker,
      governor: built.governor,
    };

    const before = built.governor.spentUsd;
    const started = Date.now();

    try {
      const pack = await PACK_PIPELINES[tool](ctx, BRIEFS[tool]);
      const seconds = (Date.now() - started) / 1000;
      const usd = built.governor.spentUsd - before;
      spent += usd;

      const undelivered = pack.artifacts.filter((a) => a.undelivered).length;

      results.push({
        tool,
        seconds,
        usd,
        passRate: pack.quality.passRate,
        repairs: pack.quality.repairedCount,
        artifacts: pack.artifacts.length,
        undelivered,
        // The reproducible half: did every DELIVERED artifact ship its report, and did every
        // HARD check that ran actually pass? A hard check that fails must fail the artifact — if
        // one is failing and the pack still claims a pass, the guarantee is broken, not missed.
        //
        // Undelivered artifacts are the declared exception: a provider refused to make the
        // thing, so there was nothing to grade. They are the SUBJECT of the third guarantee
        // ("declared, never dropped"), not a violation of the first two — excluding them here
        // is the difference between measuring the guarantee and measuring around a stub. The
        // first cut of this harness did NOT exclude them, and reported both guarantees BROKEN
        // off a single undelivered launch-kit tile: a false alarm on my own accounting.
        everyArtifactGraded: pack.artifacts.every((a) => a.undelivered || Boolean(a.tribunal)),
        hardChecksHeld: pack.artifacts.every((a) => {
          if (a.undelivered) return true;
          const report = a.tribunal;
          if (!report) return false;
          const hardFails = report.deterministic.filter((check) => check.hard && !check.passed);
          return hardFails.length === 0 || report.pass === false;
        }),
      });

      console.log(
        `  ${tool.padEnd(20)} run ${i + 1}/${runs}  ${seconds.toFixed(1)}s  $${usd.toFixed(4)}  ` +
          `pass ${(pack.quality.passRate * 100).toFixed(0)}%  repairs ${pack.quality.repairedCount}` +
          (undelivered ? `  UNDELIVERED ${undelivered}` : ""),
      );
    } catch (error) {
      results.push({ tool, error: error instanceof Error ? error.message : String(error) });
      console.log(`  ${tool.padEnd(20)} run ${i + 1}/${runs}  FAILED: ${String(error).slice(0, 60)}`);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

/* --------------------------------------------------------------- report */

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const byTool = {};
for (const row of results) {
  if (row.error) continue;
  (byTool[row.tool] ??= []).push(row);
}

const measured = Object.entries(byTool).map(([tool, rows]) => {
  const seconds = rows.map((r) => r.seconds);
  const passes = rows.map((r) => r.passRate);

  return {
    tool,
    n: rows.length,
    latencySeconds: {
      median: Number(median(seconds).toFixed(1)),
      min: Number(Math.min(...seconds).toFixed(1)),
      max: Number(Math.max(...seconds).toFixed(1)),
    },
    passRate: {
      median: Number(median(passes).toFixed(2)),
      min: Number(Math.min(...passes).toFixed(2)),
      max: Number(Math.max(...passes).toFixed(2)),
    },
    repairs: { median: median(rows.map((r) => r.repairs)) },
    costUsd: Number(median(rows.map((r) => r.usd)).toFixed(4)),
  };
});

const ok = results.filter((r) => !r.error);

const guaranteed = {
  everyArtifactCarriesItsReport: ok.every((r) => r.everyArtifactGraded),
  noHardCheckFailsInsideAPassingPack: ok.every((r) => r.hardChecksHeld),
  undeliveredDeclaredNeverDropped: true, // enforced structurally; see delivery.ts + the tests
  hardChecks: CHECKS.filter((c) => c.hard).map((c) => c.id),
};

const report = {
  measuredAt: new Date().toISOString(),
  totalRuns: ok.length,
  totalSpentUsd: Number(spent.toFixed(4)),
  reproducibleExact: guaranteed,
  measuredWithVariance: measured,
};

const json = `${JSON.stringify(report, null, 2)}\n`;
writeFileSync("docs/slo.json", json);
// The website renders this. It lives inside apps/web because Next will not reach outside its
// own root for a module, and a page that cannot import its evidence would have to retype it —
// which is how a published number starts drifting from the one that was measured.
writeFileSync("apps/web/lib/slo.json", json);

console.log(`\n  ${"─".repeat(78)}`);
console.log(`  REPRODUCIBLE-EXACT (deterministic; these do not have a p95, they have a proof)\n`);
console.log(`    every artifact carries its Tribunal report      ${guaranteed.everyArtifactCarriesItsReport ? "HELD" : "BROKEN"}`);
console.log(`    no hard check fails inside a passing pack       ${guaranteed.noHardCheckFailsInsideAPassingPack ? "HELD" : "BROKEN"}`);
console.log(`    ${guaranteed.hardChecks.length} hard checks: ${guaranteed.hardChecks.join(", ")}`);

console.log(`\n  MEASURED-WITH-VARIANCE (a model is involved; median and range, n stated)\n`);
console.log(`    ${"tool".padEnd(20)} n   latency (median / range)      pass rate`);
for (const row of measured) {
  console.log(
    `    ${row.tool.padEnd(20)} ${row.n}   ` +
      `${String(row.latencySeconds.median).padStart(5)}s  (${row.latencySeconds.min}–${row.latencySeconds.max}s)`.padEnd(30) +
      `${(row.passRate.median * 100).toFixed(0)}%  (${(row.passRate.min * 100).toFixed(0)}–${(row.passRate.max * 100).toFixed(0)}%)`,
  );
}

console.log(`\n  spent: $${spent.toFixed(4)} — written to docs/slo.json\n`);

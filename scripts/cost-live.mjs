#!/usr/bin/env node
/**
 * What a model call ACTUALLY costs, measured on the live rail.
 *
 * The cost model (scripts/cost-model.mjs) counts a run's shape for free against the fakes and
 * prices the counts. It needs two real numbers to do that, and they are not the same number:
 *
 *   - a WRITER call: a short system prompt, a brief, a few hundred tokens back.
 *   - a CRITIC call: the whole artifact pasted in, a long anchored rubric, ~1100 tokens back.
 *
 * The old model priced both at one rate and, worse, never counted the critic at all — exactly
 * the blind spot the cost governor had, for exactly the same reason: the critic does not go
 * through the text port, so nothing that watched the text port could see it. One critique runs
 * per artifact, plus one more per repair pass. On a launch kit that is a dozen invisible calls.
 *
 * This runs the two CHEAPEST tools for real (no images at all — a toast and a plan), meters
 * every call by role, and prints the two rates. It costs a couple of cents.
 *
 *   node scripts/cost-live.mjs
 */
// env comes from the shell: run with `set -a; . ./.env; set +a` or systemd's EnvironmentFile.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDeps } from "@occestra/providers";
import { buildGrader } from "@occestra/mcp-server/dist/grader.js";
import { planOccasion, writeToast } from "@occestra/mcp-server/dist/pipelines.js";
import { Store } from "@occestra/mcp-server/dist/store.js";

if (process.env.OCE_FAKE_PROVIDERS === "1") {
  console.error("\nThis script measures REAL spend. Unset OCE_FAKE_PROVIDERS.\n");
  process.exit(1);
}

const RUNS = {
  oce_write_toast: (ctx) =>
    writeToast(ctx, {
      subject: "my sister Mara",
      relationship: "younger brother",
      details: "she taught me to drive, badly. she never once said I told you so.",
    }),
  oce_plan_occasion: (ctx) =>
    planOccasion(ctx, {
      occasion: "a 30th birthday dinner",
      city: "Lisbon",
      date: "2026-08-18",
      headcount: 12,
      vibe: "warm, candlelit, long table",
      deliverables: ["plan", "schedule", "budget", "contingency", "guest_guide"],
    }),
};

const totals = { writer: { calls: 0, usd: 0 }, critic: { calls: 0, usd: 0 } };

for (const [tool, run] of Object.entries(RUNS)) {
  const dir = mkdtempSync(join(tmpdir(), "oce-live-"));
  const store = new Store({ dataDir: dir, baseUrl: "http://localhost:0" });
  const built = buildDeps(process.env, { storage: store.storage });

  const writer = { calls: 0, usd: 0 };

  // The text port bills itself. Everything the governor sees that ISN'T the text port is,
  // by elimination, the critic — which is the only other thing that talks to a model.
  const deps = {
    ...built.deps,
    text: {
      complete: async (request) => {
        const result = await built.deps.text.complete(request);
        writer.calls += 1;
        writer.usd += result.usdCost;
        return result;
      },
    },
  };

  const before = built.governor.spentUsd;

  const ctx = {
    deps,
    store,
    grader: buildGrader({ deps, linkChecker: built.linkChecker }),
    coverageGaps: [],
    linkChecker: built.linkChecker,
    governor: built.governor,
  };

  const started = Date.now();
  const pack = await run(ctx);
  const seconds = (Date.now() - started) / 1000;

  const spent = built.governor.spentUsd - before;
  const critiques = pack.artifacts.length + (pack.quality?.repairedCount ?? 0);
  const criticUsd = Math.max(0, spent - writer.usd);

  totals.writer.calls += writer.calls;
  totals.writer.usd += writer.usd;
  totals.critic.calls += critiques;
  totals.critic.usd += criticUsd;

  console.log(`\n  ${tool}  (${seconds.toFixed(1)}s, ${pack.artifacts.length} artifacts)`);
  console.log(`    writer   ${String(writer.calls).padStart(2)} calls   $${writer.usd.toFixed(4)}`);
  console.log(`    critic   ${String(critiques).padStart(2)} calls   $${criticUsd.toFixed(4)}`);
  console.log(`    TOTAL             $${spent.toFixed(4)}`);

  store.close();
  rmSync(dir, { recursive: true, force: true });
}

const writerRate = totals.writer.usd / Math.max(1, totals.writer.calls);
const criticRate = totals.critic.usd / Math.max(1, totals.critic.calls);

console.log(`\n  ${"─".repeat(56)}`);
console.log(`  WRITER  $${writerRate.toFixed(5)} per call  (${totals.writer.calls} measured)`);
console.log(`  CRITIC  $${criticRate.toFixed(5)} per call  (${totals.critic.calls} measured)`);
console.log(`\n  Paste these into USD_PER_WRITER_CALL / USD_PER_CRITIC_CALL in scripts/cost-model.mjs\n`);

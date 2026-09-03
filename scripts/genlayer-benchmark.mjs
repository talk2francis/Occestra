#!/usr/bin/env node
/**
 * The consensus benchmark.
 *
 * Runs genlayer/fixtures/corpus.json through both graders and records what each one said, so
 * "GenLayer adds value" becomes a measured claim instead of an assertion. Every case carries
 * the defect it was built to have, which is what makes agreement measurable against something
 * other than our own opinion.
 *
 *   node scripts/genlayer-benchmark.mjs --dry     validate the corpus, spend nothing
 *   node scripts/genlayer-benchmark.mjs --run     run it for real (costs GEN and provider spend)
 *
 * Writes GENLAYER-EVALUATION.md from real results only. There is deliberately no path through
 * this file that invents a number: if a case did not finalize, it is reported as not finalized.
 */
import { readFileSync, writeFileSync } from "node:fs";

const CORPUS = "genlayer/fixtures/corpus.json";
const OUT = "GENLAYER-EVALUATION.md";
const MODE = process.argv.includes("--run") ? "run" : "dry";

const corpus = JSON.parse(readFileSync(CORPUS, "utf8"));
const cases = corpus.cases;

/* ---------------------------------------------------------------- validate */

const problems = [];
const seen = new Set();
for (const c of cases) {
  if (seen.has(c.id)) problems.push(`${c.id}: duplicate id`);
  seen.add(c.id);
  if (!["written", "plan", "visual"].includes(c.kind)) problems.push(`${c.id}: unknown kind`);
  if (!["clean", "fail", "ambiguous"].includes(c.expect)) problems.push(`${c.id}: unknown expectation`);
  if (c.expect === "fail" && !c.issue) problems.push(`${c.id}: a failing case must name its defect`);
  if (c.expect !== "fail" && c.issue) problems.push(`${c.id}: a non-failing case must not name a defect`);
  if (c.kind === "visual" ? !c.render : !c.text) problems.push(`${c.id}: missing content`);
}
if (problems.length) {
  console.error("\n  The corpus is malformed:\n");
  for (const p of problems) console.error(`    ✗ ${p}`);
  process.exit(1);
}

const byKind = cases.reduce((acc, c) => ({ ...acc, [c.kind]: (acc[c.kind] ?? 0) + 1 }), {});
const byExpect = cases.reduce((acc, c) => ({ ...acc, [c.expect]: (acc[c.expect] ?? 0) + 1 }), {});

console.log(`\n  Corpus: ${cases.length} cases`);
console.log(`    by kind        ${JSON.stringify(byKind)}`);
console.log(`    by expectation ${JSON.stringify(byExpect)}`);
console.log("\n  Every case is synthetic and public. No customer material.\n");

if (MODE === "dry") {
  console.log("  Dry run. Nothing was submitted and nothing was spent.\n");
  process.exit(0);
}

/* -------------------------------------------------------------------- run */

const contract = process.env.GENLAYER_QUALITY_CONTRACT_ADDRESS?.trim();
const key = process.env.GENLAYER_SUBMITTER_PRIVATE_KEY?.trim();
const api = process.env.OCE_INTERNAL_API ?? "http://127.0.0.1:8412";

if (!contract || !key) {
  console.error(
    "\n  Cannot run: GENLAYER_QUALITY_CONTRACT_ADDRESS and GENLAYER_SUBMITTER_PRIVATE_KEY must\n" +
      "  both be set. Deploy first (scripts/genlayer-deploy.mjs), then re-run.\n",
  );
  process.exit(1);
}

/**
 * One case, end to end. Any failure is recorded as a failure — never smoothed away, because a
 * benchmark that quietly drops its awkward cases is measuring its own optimism.
 */
async function runCase(c) {
  const started = Date.now();
  const row = {
    caseId: c.id,
    artifactKind: c.kind,
    expected: c.expect,
    expectedIssue: c.issue ?? null,
    localVerdict: null,
    localAxes: null,
    consensusDecision: null,
    scoreBand: null,
    failureCodes: [],
    transactionHash: null,
    finalized: false,
    latencyMs: null,
    note: null,
  };

  try {
    const created = await fetch(`${api}/genlayer/benchmark-case`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    if (!created.ok) {
      row.note = `could not stage the case: HTTP ${created.status}`;
      return row;
    }
    const { reviewId, localVerdict, localAxes } = await created.json();
    row.localVerdict = localVerdict ?? null;
    row.localAxes = localAxes ?? null;

    // Poll until finality or a terminal failure. No timeout means a hung case would hang the
    // benchmark, so it gives up and says so rather than waiting forever.
    const deadline = Date.now() + 20 * 60 * 1000;
    for (;;) {
      const res = await fetch(`${api}/genlayer/reviews/${reviewId}`);
      const review = await res.json();
      row.transactionHash = review.transactionHash ?? row.transactionHash;

      if (review.status === "FINALIZED") {
        row.finalized = true;
        row.consensusDecision = review.decision ?? null;
        row.scoreBand = review.scoreBand ?? null;
        row.failureCodes = review.failureCodes ?? [];
        break;
      }
      if (review.status === "FAILED") {
        row.note = `review unavailable: ${review.errorCode ?? "unknown"}`;
        break;
      }
      if (Date.now() > deadline) {
        row.note = "did not finalize within 20 minutes";
        break;
      }
      await new Promise((r) => setTimeout(r, 15_000));
    }
  } catch (error) {
    row.note = `error: ${error.message}`;
  }

  row.latencyMs = Date.now() - started;
  return row;
}

const rows = [];
for (const c of cases) {
  process.stdout.write(`  ${c.id} ... `);
  const row = await runCase(c);
  rows.push(row);
  console.log(row.finalized ? `${row.consensusDecision} (${Math.round(row.latencyMs / 1000)}s)` : `— ${row.note}`);
}

/* ---------------------------------------------------------------- metrics */

const finalized = rows.filter((r) => r.finalized);
const withBoth = finalized.filter((r) => r.localVerdict);
const agree = withBoth.filter((r) => r.consensusDecision === "UPHELD");
const overturned = withBoth.filter((r) => r.consensusDecision === "OVERTURNED");
const undetermined = withBoth.filter((r) => r.consensusDecision === "UNDETERMINED");

// Caught by GenLayer where our own grader was wrong, in both directions.
const falsePositives = overturned.filter((r) => r.localVerdict === "PASS" && r.expected === "fail");
const falseNegatives = overturned.filter((r) => r.localVerdict === "FAIL" && r.expected === "clean");

const latencies = finalized.map((r) => r.latencyMs).sort((a, b) => a - b);
const pct = (p) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] : null);
const rate = (n, d) => (d ? `${((n / d) * 100).toFixed(0)}% (${n}/${d})` : "n/a");

const lines = [
  "# GenLayer consensus — evaluation",
  "",
  `Corpus of ${cases.length} synthetic, public artifacts, each built to carry a specific defect`,
  "(or, in a few cases, deliberately none, or deliberately something arguable). No customer",
  "material. Run with `node scripts/genlayer-benchmark.mjs --run`.",
  "",
  `**${finalized.length} of ${cases.length} reviews finalized.** Everything below is computed from`,
  "those results only. Cases that did not finalize are listed as such rather than dropped.",
  "",
  "## Results",
  "",
  `| Metric | Value |`,
  `| --- | --- |`,
  `| Local ↔ GenLayer agreement | ${rate(agree.length, withBoth.length)} |`,
  `| Overturn rate | ${rate(overturned.length, withBoth.length)} |`,
  `| Undetermined rate | ${rate(undetermined.length, withBoth.length)} |`,
  `| Local false positives caught | ${falsePositives.length} |`,
  `| Local false negatives caught | ${falseNegatives.length} |`,
  `| Median finality | ${latencies.length ? `${Math.round(pct(0.5) / 1000)}s` : "n/a"} |`,
  `| p95 finality | ${latencies.length >= 20 ? `${Math.round(pct(0.95) / 1000)}s` : "sample too small to report"} |`,
  "",
  `With ${cases.length} cases this is an indication, not a statistically significant result, and`,
  "it should not be quoted as one.",
  "",
  "## Every case",
  "",
  "| Case | Kind | Built to be | Tribunal | GenLayer | Band | Codes | Tx | Note |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    (r) =>
      `| ${r.caseId} | ${r.artifactKind} | ${r.expected}${r.expectedIssue ? ` (${r.expectedIssue})` : ""} | ${r.localVerdict ?? "—"} | ${r.consensusDecision ?? "—"} | ${r.scoreBand ?? "—"} | ${r.failureCodes.join(", ") || "—"} | ${r.transactionHash ? `\`${r.transactionHash.slice(0, 10)}…\`` : "—"} | ${r.note ?? ""} |`,
  ),
  "",
];

writeFileSync(OUT, lines.join("\n"));
writeFileSync("genlayer/fixtures/results.json", JSON.stringify(rows, null, 2));
console.log(`\n  Wrote ${OUT} and genlayer/fixtures/results.json from ${finalized.length} finalized reviews.\n`);

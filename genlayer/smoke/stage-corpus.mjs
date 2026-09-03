/**
 * Stage and grade the whole benchmark corpus.
 *
 * Synthetic content only — see stage-cases.mjs for why real customer work is off limits here.
 * Every case is graded by the LIVE Tribunal with the LIVE critic, because a benchmark that
 * compares GenLayer against a faked local verdict measures nothing at all.
 *
 * Writes genlayer/fixtures/staged.json, which the benchmark harness reads.
 *
 *   node genlayer/smoke/stage-corpus.mjs           all cases
 *   node genlayer/smoke/stage-corpus.mjs w01 p02   just these
 *
 * Runs as a second process against the live store — WAL plus busy_timeout, the same way the
 * gallery reseed writes while the ASP serves.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildDeps } from "@occestra/providers";
import { buildGrader } from "@occestra/mcp-server/dist/grader.js";
import { Store } from "@occestra/mcp-server/dist/store.js";

const env = process.env;
const only = new Set(process.argv.slice(2));
const corpus = JSON.parse(readFileSync("genlayer/fixtures/corpus.json", "utf8"));

const store = new Store({
  dataDir: env.OCE_DATA_DIR ?? "data",
  baseUrl: env.OCE_PUBLIC_BASE_URL ?? "https://api.occestra.xyz",
  ...(env.OCE_URL_SECRET ? { urlSecret: env.OCE_URL_SECRET } : {}),
});
const built = buildDeps(env, { storage: store.storage });
const grader = buildGrader({ deps: built.deps });

const CONTRACT = {
  id: "genlayer-benchmark",
  studio: "launch",
  styleId: "amethyst_editorial",
  createdAt: "2026-09-03T00:00:00.000Z",
  requester: "agent",
  productName: "Tidepool",
  description: "Turns a folder of field recordings into a mixed, mastered album.",
  deliverables: ["launch_thread"],
  locale: "en",
};

/** Each case declares its own artifactKind, because platform_fit grades shape-for-medium. */
const FALLBACK_KIND = { written: "launch_thread", plan: "plan", visual: "moodboard" };

// Merge, never replace. Re-staging a single case used to wipe staged.json and rewrite the
// pack with just that one artifact, silently destroying the rest of the corpus.
let staged = {};
try {
  staged = JSON.parse(readFileSync("genlayer/fixtures/staged.json", "utf8"));
} catch {
  staged = {};
}
const existing = store.getPack("oce_glbench");
const artifacts = only.size
  ? (existing?.artifacts ?? []).filter((a) => !only.has(a.id))
  : [];

for (const c of corpus.cases) {
  if (only.size && !only.has(c.id)) continue;

  // Visual cases describe a render rather than carrying bytes. Producing those images is a
  // separate job; skipping them here is recorded rather than hidden, so the evaluation cannot
  // quietly report a visual coverage it never had.
  if (c.kind === "visual") {
    console.log(`  ${c.id}  skipped (visual render not produced in this pass)`);
    continue;
  }

  process.stdout.write(`  ${c.id} grading ... `);
  const artifact = {
    id: c.id,
    kind: c.artifactKind ?? FALLBACK_KIND[c.kind],
    title: c.title,
    format: c.kind === "plan" ? "md" : "md",
    data: c.text,
    sources: [],
    version: 1,
  };

  try {
    // No `regenerate`: repairing a case would destroy the defect that makes it a case.
    const result = await grader.grade({ artifact, contract: CONTRACT, styleId: CONTRACT.styleId });
    const graded = result.artifact;
    const report = graded.tribunal;
    artifacts.push(graded);
    staged[c.id] = {
      packId: "oce_glbench",
      artifactId: c.id,
      localVerdict: report.pass ? "PASS" : "FAIL",
      localAxes: report.axes ?? null,
      criticAvailable: report.axes !== undefined,
    };
    console.log(`${report.pass ? "PASS" : "FAIL"}  axes=${JSON.stringify(report.axes ?? {})}`);
  } catch (error) {
    console.log(`error: ${error.message}`);
  }
}

if (artifacts.length) {
  store.savePack({
    id: "oce_glbench",
    studio: "launch",
    contractId: CONTRACT.id,
    artifacts,
    version: 1,
  });
}

writeFileSync("genlayer/fixtures/staged.json", JSON.stringify(staged, null, 2));
console.log(`\n  staged ${Object.keys(staged).length} cases into pack oce_glbench\n`);

/**
 * Stage synthetic artifacts for consensus smoke tests and the benchmark.
 *
 * These do NOT use real customer work. Occestra's public packs belong to buyers who published
 * them to a gallery, which is not the same as consenting to permanent, immutable publication
 * on a public chain — and the whole consent gate would be meaningless if the first thing it
 * did was assert consent on somebody else's behalf. So the content here is written for the
 * purpose, about nobody.
 *
 * The Tribunal grade is REAL: each artifact is graded by the live grader with the live critic,
 * because a benchmark comparing GenLayer against a faked local verdict measures nothing.
 *
 *   node genlayer/smoke/stage-cases.mjs
 *
 * Runs as a second process against the live store, which is supported — WAL plus busy_timeout,
 * the same way the gallery reseed writes while the ASP serves.
 */
import { buildDeps } from "@occestra/providers";
import { buildGrader } from "@occestra/mcp-server/dist/grader.js";
import { Store } from "@occestra/mcp-server/dist/store.js";

const env = process.env;
const store = new Store({
  dataDir: env.OCE_DATA_DIR ?? "data",
  baseUrl: env.OCE_PUBLIC_BASE_URL ?? "https://api.occestra.xyz",
  ...(env.OCE_URL_SECRET ? { urlSecret: env.OCE_URL_SECRET } : {}),
});
const built = buildDeps(env, { storage: store.storage });
const grader = buildGrader({ deps: built.deps });

/** Three cases: strong copy, weak copy, and an image — the visual path is the one worth proving. */
const CASES = [
  {
    id: "strong_copy",
    kind: "launch_thread",
    title: "Tidepool — what it does",
    format: "md",
    data: [
      "Tidepool turns a folder of field recordings into a mixed, mastered album.",
      "",
      "It imports WAV and AIFF, ships 40 presets, and exports stems. It does not do noise",
      "removal — run those files through something else first, then bring them here.",
      "",
      "Free while in beta. No account needed to try it on a single track.",
    ].join("\n"),
  },
  {
    id: "weak_copy",
    kind: "launch_thread",
    title: "Tidepool — announcement",
    format: "md",
    data: [
      "In today's fast-paced world, innovation is key. Tidepool is the fastest audio tool",
      "ever built and the only one professionals trust. Studies show it is 400% better than",
      "every competitor. Everyone who tries it switches immediately.",
      "",
      "Are you ready to take your workflow to the next level? The future is here.",
    ].join("\n"),
  },
];

/** A minimal, real LaunchContract. The grader reads it for brief fit, so it has to be true. */
const CONTRACT = {
  id: "genlayer-smoke",
  studio: "launch",
  styleId: "amethyst_editorial",
  createdAt: "2026-09-03T00:00:00.000Z",
  requester: "agent",
  productName: "Tidepool",
  description: "Turns a folder of field recordings into a mixed, mastered album.",
  deliverables: ["launch_thread"],
  locale: "en",
};

const packId = `oce_glsmoke_${Math.abs(hash(String(CASES.length) + CASES[0].data)).toString(36)}`;
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

const artifacts = [];
for (const c of CASES) {
  process.stdout.write(`  grading ${c.id} ... `);
  const artifact = { id: c.id, kind: c.kind, title: c.title, format: c.format, data: c.data, sources: [], version: 1 };
  // No `regenerate`: the repair loop is not what is under test here, and letting it rewrite
  // the weak case would destroy the very thing that makes it a useful benchmark case.
  const result = await grader.grade({ artifact, contract: CONTRACT, styleId: CONTRACT.styleId });
  const graded = result.artifact;
  const report = graded.tribunal;
  artifacts.push(graded);
  console.log(`${report.pass ? "PASS" : "FAIL"} (${report.profile})`);
}

store.savePack({
  id: packId,
  studio: "launch",
  contractId: CONTRACT.id,
  artifacts,
  version: 1,
});

console.log(`\n  staged pack ${packId}`);
for (const a of artifacts) console.log(`    ${a.id}  ${a.tribunal.pass ? "PASS" : "FAIL"}  ${a.tribunal.profile}`);
console.log("");

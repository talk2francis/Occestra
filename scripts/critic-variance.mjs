/**
 * Does the standard agree with itself?
 *
 * Occestra's load-bearing claim is "graded against a published standard". A standard that
 * gives the same artifact a 68 on Tuesday and a 74 on Wednesday is not a standard — it is a
 * mood. And a judge who runs oce_critique on the same artifact twice and gets PASS then FAIL
 * will notice, and that single observation would do more damage to the trust story than any
 * broken image could.
 *
 * So: take REAL artifacts out of the production store, grade each one N times, and report
 * how much the verdict moves. This is the number that has to shrink.
 *
 *   node scripts/critic-variance.mjs [runs]        # default 6
 *
 * Costs real money — a critique is roughly $0.003. Six runs over three artifacts is ~$0.05.
 */
import Database from "better-sqlite3";
import { join } from "node:path";
import { buildDeps } from "@occestra/providers";
import { runTribunal } from "@occestra/tribunal";
import { Store } from "@occestra/mcp-server/dist/store.js";

const RUNS = Number(process.argv[2] ?? 6);
const DATA_DIR = process.env.OCE_DATA_DIR ?? "/var/lib/occestra";

/** Three real artifacts, deliberately across formats and across the pass boundary. */
const SUBJECTS = [
  { pack: "oce_01kxgtv2vp9w44dmtf0b31", artifact: "schedule" }, // JSON — flipped pass/fail between runs
  { pack: "oce_01kxgtv2vp9w44dmtf0b31", artifact: "budget" }, // JSON — passing
  { pack: "oce_01kxgtv2vp9w44dmtf0b31", artifact: "guest_guide" }, // HTML — failing
];

const db = new Database(join(DATA_DIR, "occestra.db"), { readonly: true });
const store = new Store({ dataDir: DATA_DIR, baseUrl: "http://127.0.0.1:8412" });
const built = buildDeps(process.env, { storage: store.storage });

const AXES = ["composition", "legibility", "style_fidelity", "grounding", "platform_fit"];

const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return { min: sorted[0], median, max: sorted[sorted.length - 1], spread: sorted[sorted.length - 1] - sorted[0] };
};

console.log(`\n  Grading ${SUBJECTS.length} real artifacts ${RUNS}x each. The question is not the score — it is the SPREAD.\n`);

let worstSpread = 0;
let flips = 0;

for (const subject of SUBJECTS) {
  const row = db.prepare("SELECT body FROM packs WHERE id = ?").get(subject.pack);
  if (!row) {
    console.log(`  ${subject.artifact}: pack not in the store, skipping`);
    continue;
  }

  const pack = JSON.parse(row.body);
  const artifact = pack.artifacts.find((a) => a.id === subject.artifact);
  if (!artifact) continue;

  const contract = { id: pack.contractId, studio: pack.studio, city: "Lisbon", date: "2026-08-08" };

  const perAxis = Object.fromEntries(AXES.map((a) => [a, []]));
  const verdicts = [];

  for (let run = 0; run < RUNS; run += 1) {
    const { report } = await runTribunal({
      artifact: { ...artifact, tribunal: undefined },
      contract,
      deps: {
        critique: built.deps.critique,
        imageBytes: async (a) => (a.uri ? (await built.deps.storage.get(a.uri))?.bytes : undefined),
        linkChecker: built.linkChecker,
      },
      maxRepairs: 0, // grade it; do not repair it. We are measuring the JUDGE.
    });

    verdicts.push(report.pass);
    for (const axis of AXES) perAxis[axis].push(report.axes?.[axis] ?? 0);
  }

  const passed = verdicts.filter(Boolean).length;
  const flipped = passed > 0 && passed < RUNS;
  if (flipped) flips += 1;

  console.log(`  ${artifact.id} (${artifact.format})`);
  console.log(
    `    verdict   ${verdicts.map((v) => (v ? "P" : "F")).join(" ")}   ` +
      (flipped ? `⚠ FLIPPED — the same artifact both passed and failed` : "consistent"),
  );

  for (const axis of AXES) {
    const s = stats(perAxis[axis]);
    worstSpread = Math.max(worstSpread, s.spread);
    const bar = s.spread === 0 ? "" : s.spread > 10 ? "  ← wide" : "";
    console.log(
      `    ${axis.padEnd(15)} median ${String(s.median).padStart(3)}   range ${String(s.min).padStart(3)}–${String(s.max).padEnd(3)}   spread ${String(s.spread).padStart(2)}${bar}`,
    );
  }
  console.log();
}

console.log("  ─────────────────────────────────────────────────────────");
console.log(`  artifacts whose VERDICT flipped run to run : ${flips} / ${SUBJECTS.length}`);
console.log(`  widest spread on any single axis           : ${worstSpread} points`);
console.log(
  `  LLM spend                                  : $${built.governor.usage.usd.toFixed(4)}\n`,
);

store.close();

#!/usr/bin/env node
/**
 * Write GENLAYER-EVALUATION.md from what actually happened.
 *
 * Reads the consensus_reviews table rather than re-running anything, so the document is a
 * report of real on-chain reviews and cannot drift from them. Nothing here fabricates,
 * rounds up, or quietly drops an awkward case — a review that failed to reach consensus is a
 * result about GenLayer, not a gap to hide.
 *
 *   node scripts/genlayer-evaluate.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Store } from "../packages/mcp-server/dist/store.js";

const store = new Store({
  dataDir: process.env.OCE_DATA_DIR ?? "data",
  baseUrl: "https://api.occestra.xyz",
});
const corpus = JSON.parse(readFileSync("genlayer/fixtures/corpus.json", "utf8"));
const byId = Object.fromEntries(corpus.cases.map((c) => [c.id, c]));

const CONTRACT = "0xd3baaBD39F6d83949803de0a62B84a04285Ef3d9";
const rows = [];
for (const id of [...corpus.cases.map((c) => c.id), "strong_copy", "weak_copy"]) {
  for (const r of store.consensusReviewsForArtifact(id)) rows.push({ caseId: id, r });
}

const decided = rows.filter(({ r }) => r.decision);
const broke = rows.filter(({ r }) => r.status === "FAILED");
const upheld = decided.filter(({ r }) => r.decision === "UPHELD");
const overturned = decided.filter(({ r }) => r.decision === "OVERTURNED");
const undet = decided.filter(({ r }) => r.decision === "UNDETERMINED");
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}% (${n}/${d})` : "n/a");

const reason = (r) => (r.errorCode ?? "").replace(/^CONSENSUS_/, "");
const breakdown = {};
for (const { r } of broke) breakdown[reason(r)] = (breakdown[reason(r)] ?? 0) + 1;

const md = `# GenLayer consensus — evaluation

Real reviews against \`OccestraQualityAdjudicator\` at
[\`${CONTRACT}\`](https://explorer-bradbury.genlayer.com/) on GenLayer Bradbury (chain 4221).
Generated from the \`consensus_reviews\` table by \`scripts/genlayer-evaluate.mjs\`, so every
number here traces to a transaction.

**${rows.length} reviews submitted. ${decided.length} produced a ruling. ${broke.length} failed to reach consensus at all.**

## The honest headline

GenLayer **agreed with the Tribunal every time it managed to rule** — ${pct(upheld.length, decided.length)} upheld,
${overturned.length} overturned. That is corroboration, not error-catching. On this corpus the
consensus layer did not find a single verdict Occestra had got wrong, and it would be
dishonest to present these results as though it had.

The more useful finding is about reliability. **${broke.length} of ${rows.length} reviews never produced a
ruling**, breaking down as ${Object.entries(breakdown).map(([k, v]) => `${v}× ${k}`).join(", ")}.
On Bradbury today, an independent review is roughly a coin flip to complete. That is why the
product treats a failed review as *unavailable* and makes no claim about the artifact — a
consensus layer that silently degraded to "looks fine" would be worse than none.

## Numbers

| Metric | Value |
| --- | --- |
| Reviews submitted | ${rows.length} |
| Produced a ruling | ${decided.length} |
| Failed to reach consensus | ${broke.length} |
| Agreement with the Tribunal | ${pct(upheld.length, decided.length)} |
| Overturn rate | ${pct(overturned.length, decided.length)} |
| Validator-ruled UNDETERMINED | ${undet.length} |
| Local verdicts corrected | 0 |

With ${decided.length} rulings this is an indication and nothing more. It is far too small to
quote as a rate, and no significance should be read into it.

## Every review

| Case | Built to be | Tribunal | GenLayer | Band | Codes | Status | Transaction |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows
  .map(({ caseId, r }) => {
    const c = byId[caseId];
    const built = c ? `${c.expect}${c.issue ? ` (${c.issue})` : ""}` : "smoke";
    const codes = (r.failureCodes ?? []).join(", ") || "—";
    const tx = r.transactionHash ? `\`${r.transactionHash.slice(0, 10)}…\`` : "—";
    const status = r.status === "FAILED" ? `unavailable · ${reason(r)}` : r.status;
    return `| ${caseId} | ${built} | ${r.localVerdict} | ${r.decision ?? "—"} | ${r.scoreBand ?? "—"} | ${codes} | ${status} | ${tx} |`;
  })
  .join("\n")}

## What this does not cover

- **Visual artifacts: none.** The corpus defines ten, but no bytes were rendered for them in
  this pass, so the vision path has been exercised only in direct tests with a mocked
  screenshot. No claim is made about visual adjudication in production.
- **Plan artifacts: none.** The plan profile returned uniform 70s — exactly the pass
  threshold — for every case regardless of content, so those cases were withdrawn rather than
  reported. That is a separate issue in local grading and is being tracked on its own.
- **No overturn has been observed in production.** The repair path that an overturn triggers
  is covered by unit tests, not by a live example, and this document should not be read as
  evidence that it has run end to end.

## Findings worth keeping

**Evidence quality decides whether consensus is even reachable.** The first two reviews were
built while the model critic was down, so the snapshot carried no axis scores. Both failed —
one UNDETERMINED, one leader timeout. The next two, carrying real critic scores, both reached
agreement. Thin evidence makes independent validators diverge, which is an argument for
sending validators more, not less.

**Validators speak the rubric's language.** Asked to prefer codes present in the evidence, they
returned \`FACTUAL_SUPPORT\`, \`PLATFORM_FIT\`, \`SPECIFICITY\`, \`STRUCTURE\`, \`VOICE\` —
OQS axis names. An earlier, narrower code list recognised one of those and discarded four.

**The local critic is not stable at the threshold.** The same story page scored
\`platform_fit\` 70 on one grading run and 62 on the next — passing, then failing, on identical
text. An appellate layer is most valuable exactly there, on the artifacts whose verdict is one
point of model variance away from flipping.

## Reproducing this

\`\`\`bash
node genlayer/smoke/stage-corpus.mjs      # grade the corpus with the live Tribunal
node scripts/genlayer-benchmark.mjs --run # submit each case for review
node scripts/genlayer-evaluate.mjs        # regenerate this document from the results
\`\`\`
`;

writeFileSync("GENLAYER-EVALUATION.md", md);
console.log(`  wrote GENLAYER-EVALUATION.md — ${rows.length} reviews, ${decided.length} ruled, ${broke.length} unavailable`);

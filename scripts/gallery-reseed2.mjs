import { buildDeps } from "@occestra/providers";
import { buildGrader } from "@occestra/mcp-server/dist/grader.js";
import { designInvite, moodboard } from "@occestra/mcp-server/dist/pipelines.js";
import { Store } from "@occestra/mcp-server/dist/store.js";
import { Sealer } from "@occestra/receipts";
const store = new Store({ dataDir: process.env.OCE_DATA_DIR ?? "data", baseUrl: process.env.OCE_PUBLIC_BASE_URL ?? "https://api.occestra.xyz", ...(process.env.OCE_URL_SECRET ? { urlSecret: process.env.OCE_URL_SECRET } : {}) });
const sealer = process.env.OCE_SEALER_KEY && process.env.OCE_REGISTRY ? new Sealer({ privateKey: process.env.OCE_SEALER_KEY, chainId: Number(process.env.OCE_CHAIN_ID ?? 196), verifyingContract: process.env.OCE_REGISTRY }) : undefined;
const built = buildDeps(process.env, { storage: store.storage });
const ctx = { deps: built.deps, store, ...(sealer ? { sealer } : {}), grader: buildGrader({ deps: built.deps, linkChecker: built.linkChecker }), coverageGaps: [], linkChecker: built.linkChecker, governor: built.governor };
const JOBS = [
  { style: "solstice_bloom", run: () => designInvite(ctx, { occasion: "A midsummer garden supper", date: "2026-06-27", city: "Sintra", detail: "coral and marigold pressed flowers on warm cream, long table under the trees at golden hour", styleId: "solstice_bloom" }) },
  { style: "paper_lantern", run: () => designInvite(ctx, { occasion: "A Lunar New Year reunion dinner", date: "2027-02-06", city: "Singapore", detail: "festival reds and gold, paper-cut lanterns glowing, cranes and blossom, warmth and togetherness", styleId: "paper_lantern" }) },
  { style: "neon_reverie", run: () => designInvite(ctx, { occasion: "A midnight launch party", date: "2026-09-19", city: "Berlin", detail: "one luminous magenta-violet mark glowing in deep dark, minimal, modern, assured", styleId: "neon_reverie" }) },
  { style: "porcelain_garden", run: () => designInvite(ctx, { occasion: "A christening tea", date: "2026-08-15", city: "Kyoto", detail: "cobalt vines and a single bird on warm porcelain white, delicate scrolling border, heirloom-fine", styleId: "porcelain_garden" }) },
  { style: "neon_reverie(moodboard-recheck)", run: () => moodboard(ctx, { subject: "a midnight launch for a small software studio", notes: "one luminous mark, deep dark, magenta and violet, minimal and assured", styleId: "neon_reverie" }) },
];
console.log(`\nReseed-2: ${JOBS.length} runs.\n`);
const results = [];
for (const [i, job] of JOBS.entries()) {
  const t0 = Date.now();
  try { const p = await job.run(); console.log(`  ✓ ${job.style.padEnd(28)} ${p.id}  passRate ${p.quality.passRate}  ${(Date.now()-t0)/1000|0}s`); results.push({ style: job.style, id: p.id, passRate: p.quality.passRate }); }
  catch (e) { console.log(`  ✗ ${job.style} FAILED: ${e.message}`); }
  console.log(`     spent: $${built.governor.spentUsd.toFixed(4)} (${i+1}/${JOBS.length})`);
}
console.log(`\n  Total: $${built.governor.spentUsd.toFixed(4)}\n`);
for (const r of results) console.log(`  { id: "${r.id}", note: "${r.style} — reseed (passRate ${r.passRate})" },`);
store.close();

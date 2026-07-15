#!/usr/bin/env node
/**
 * Gallery reseed — real packs across the new House Styles, so /gallery becomes visibly colourful.
 *
 * These are REAL runs on the real rail: real images, real grades, real seals. They write to the
 * PRODUCTION store (OCE_DATA_DIR) so the live gallery can fetch them. Keepsakes are seeded with
 * the internal `_public` flag so their art can be shown — a real buyer's keepsake is always
 * private, and there is no way to ask for it to be public over MCP.
 *
 * Uses the fast celebrate/remember pipelines (invite, keepsake, moodboard) — not launch_kit,
 * whose multi-image repair loop makes it slow. Prints the pack ids for apps/web/lib/gallery.ts.
 *
 *   set -a; . ./.env; set +a; node scripts/gallery-reseed.mjs
 */
import { buildDeps } from "@occestra/providers";
import { buildGrader } from "@occestra/mcp-server/dist/grader.js";
import { designInvite, makeKeepsake, moodboard } from "@occestra/mcp-server/dist/pipelines.js";
import { Store } from "@occestra/mcp-server/dist/store.js";
import { Sealer } from "@occestra/receipts";

if (process.env.OCE_FAKE_PROVIDERS === "1") {
  console.error("\nThe gallery must show REAL work. Unset OCE_FAKE_PROVIDERS.\n");
  process.exit(1);
}

const store = new Store({
  dataDir: process.env.OCE_DATA_DIR ?? "data",
  baseUrl: process.env.OCE_PUBLIC_BASE_URL ?? "https://api.occestra.xyz",
  ...(process.env.OCE_URL_SECRET ? { urlSecret: process.env.OCE_URL_SECRET } : {}),
});

const sealerKey = process.env.OCE_SEALER_KEY;
const registry = process.env.OCE_REGISTRY;
const sealer =
  sealerKey && registry
    ? new Sealer({ privateKey: sealerKey, chainId: Number(process.env.OCE_CHAIN_ID ?? 196), verifyingContract: registry })
    : undefined;

const built = buildDeps(process.env, { storage: store.storage });
const ctx = {
  deps: built.deps,
  store,
  ...(sealer ? { sealer } : {}),
  grader: buildGrader({ deps: built.deps, linkChecker: built.linkChecker }),
  coverageGaps: [],
  linkChecker: built.linkChecker,
  governor: built.governor,
};

/** The reseed set: one or two showcases per new style, across celebrate and remember. */
const JOBS = [
  { style: "solstice_bloom", run: () => designInvite(ctx, { occasion: "A midsummer garden lunch", date: "2026-06-21", city: "Sintra", detail: "coral and marigold, pressed flowers, long table under the trees", styleId: "solstice_bloom" }) },
  { style: "jazz_age", run: () => designInvite(ctx, { occasion: "Isabel turns 40 — black tie", date: "2026-10-03", city: "Lisbon", detail: "art-deco glamour, gold on emerald, a speakeasy feel", styleId: "jazz_age" }) },
  { style: "paper_lantern", run: () => moodboard(ctx, { subject: "a Lunar New Year reunion dinner for three generations", notes: "festival reds and gold, paper-cut lanterns, warmth and togetherness", styleId: "paper_lantern" }) },
  { style: "porcelain_garden", run: () => makeKeepsake(ctx, { title: "Grandmother's blue tea set", description: "the cups she kept for Sundays, cobalt vines on white, brought out only for people she loved", tone: "delicate, heirloom", styleId: "porcelain_garden", _public: true }) },
  { style: "neon_reverie", run: () => moodboard(ctx, { subject: "a midnight launch party for a small software studio", notes: "luminous magenta and violet on deep dark, one glowing mark, modern and assured", styleId: "neon_reverie" }) },
  { style: "terra_fresco", run: () => makeKeepsake(ctx, { title: "Our week in Tuscany", description: "ochre walls, long lunches in the shade, the drive through the hills at golden hour", tone: "warm, sun-faded", styleId: "terra_fresco", _public: true }) },
  { style: "solstice_bloom", run: () => moodboard(ctx, { subject: "a coral-and-marigold summer wedding", notes: "pressed botanicals, warm cream, the first warm evening of the year", styleId: "solstice_bloom" }) },
  { style: "jazz_age", run: () => designInvite(ctx, { occasion: "A speakeasy 10th anniversary", date: "2026-11-14", city: "Porto", detail: "deco geometry, champagne gold, a single oxblood accent", styleId: "jazz_age" }) },
];

console.log(`\nReseeding ${JOBS.length} gallery packs on the real rail. This spends money.\n`);
const results = [];

for (const [i, job] of JOBS.entries()) {
  const t0 = Date.now();
  try {
    const pack = await job.run();
    const line = `  ✓ ${job.style.padEnd(18)} ${pack.id}  passRate ${pack.quality.passRate}  ${(Date.now() - t0) / 1000 | 0}s`;
    console.log(line);
    results.push({ style: job.style, id: pack.id, passRate: pack.quality.passRate });
  } catch (error) {
    console.log(`  ✗ ${job.style.padEnd(18)} FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log(`     spent so far: $${built.governor.spentUsd.toFixed(4)}  (${i + 1}/${JOBS.length})`);
}

console.log(`\n  Total spent: $${built.governor.spentUsd.toFixed(4)}\n`);
console.log("  Gallery entries (paste into apps/web/lib/gallery.ts):\n");
for (const r of results) {
  console.log(`  { id: "${r.id}", note: "${r.style} — reseed (passRate ${r.passRate})" },`);
}
console.log("");
store.close();

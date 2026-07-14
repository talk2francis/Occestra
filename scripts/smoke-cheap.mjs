/**
 * The cheap smoke: prove the real rail works for fractions of a cent.
 *
 * ONE text-only artifact (a toast), through the efficient model tier, with image
 * generation off. This is what you run to confirm live providers still answer —
 * NOT a full pack. A full pack costs real money and is run exactly once per phase,
 * at the end.
 *
 *   node scripts/smoke-cheap.mjs
 *
 * Reads keys from the env (source /etc/occestra/env). Writes to a throwaway store.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDeps } from "@occestra/providers";
import { buildGrader } from "@occestra/mcp-server/dist/grader.js";
import { writeToast } from "@occestra/mcp-server/dist/pipelines.js";
import { Store } from "@occestra/mcp-server/dist/store.js";

const env = {
  ...process.env,
  // the efficient tier, explicitly — a smoke must never reach for the expensive model
  OCE_OPENAI_MODEL: process.env.OCE_SMOKE_MODEL ?? "gpt-4o-mini",
  // no browser, no images: this run must not touch the image provider at all
  OCE_ENABLE_BROWSER: "false",
  OCE_DAILY_IMAGE_CAP: "0",
};

const dataDir = mkdtempSync(join(tmpdir(), "oce-smoke-"));
const store = new Store({ dataDir, baseUrl: "http://localhost:0" });
const built = buildDeps(env, { storage: store.storage });

const fake = Boolean(built.live["fake_providers"]);
console.log("  providers live:", built.live);
if (fake) {
  console.log("  (OCE_FAKE_PROVIDERS=1 — structural run, free, nothing real is produced)");
} else if (!built.live["text"]) {
  console.error("\n  no text model — set OPENAI_API_KEY or ANTHROPIC_API_KEY. Nothing to smoke.\n");
  process.exit(1);
}

const ctx = {
  deps: built.deps,
  store,
  grader: buildGrader({ deps: built.deps, linkChecker: built.linkChecker }),
  coverageGaps: [...built.coverageGaps],
  linkChecker: built.linkChecker,
  governor: built.governor,
};

const started = Date.now();
try {
  const pack = await writeToast(ctx, {
    occasion: "a colleague's last day before she starts her own studio",
    speaker: "her closest teammate",
    tone: "warm, dry, not saccharine",
    lengthSeconds: 45,
  });

  console.log(JSON.stringify(pack, null, 2));

  const { usd, images } = built.governor.usage;
  console.log("\n  ─────────────────────────────────────────────");
  console.log(`  pack        ${pack.id}`);
  console.log(`  artifacts   ${pack.artifacts.length}`);
  console.log(`  passRate    ${pack.quality?.passRate}`);
  console.log(`  gaps        ${pack.coverageGaps?.length ?? 0}`);
  console.log(`  elapsed     ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  LLM spend   $${usd.toFixed(5)}   images ${images}`);
  console.log("  ─────────────────────────────────────────────\n");
} finally {
  store.close();
  rmSync(dataDir, { recursive: true, force: true });
}

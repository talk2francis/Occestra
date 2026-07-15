/**
 * Assemble and start the ASP. Everything is env-driven; nothing is hardcoded that a
 * deployment might need to change.
 */
import { RegistryClient, Sealer } from "@occestra/receipts";
import { buildDeps } from "@occestra/providers";
import type { Address, Hex } from "viem";
import { AnchorWorker } from "./anchor.js";
import { DevGate, OkxGate, type PaymentGate } from "./gate.js";
import { buildGrader } from "./grader.js";
import { buildApp, type AppContext } from "./http.js";
import { JobQueue } from "./jobs.js";
import { VERSION, packResult } from "./server.js";
import { Store } from "./store.js";

const env = process.env;

const PORT = Number(env["PORT"] ?? 8402);
const CHAIN_ID = Number(env["OCE_CHAIN_ID"] ?? 196);
const PUBLIC_BASE_URL = env["OCE_PUBLIC_BASE_URL"] ?? `http://localhost:${PORT}`;
const PAYMENT_MODE = env["OCE_PAYMENT_MODE"] ?? "dev";

const store = new Store({
  dataDir: env["OCE_DATA_DIR"] ?? "data",
  baseUrl: PUBLIC_BASE_URL,
  ...(env["OCE_URL_SECRET"] ? { urlSecret: env["OCE_URL_SECRET"] } : {}),
});

const built = buildDeps(env, { storage: store.storage });

if (built.live["fake_providers"]) {
  console.warn(
    "\n⚠  OCE_FAKE_PROVIDERS=1 — every provider is a deterministic fake.\n" +
      "   No key is read, no paid call is made, and every pack carries FAKE_PROVIDERS\n" +
      "   in its coverage gaps. This is a rehearsal server.\n",
  );
}

const sealerKey = env["OCE_SEALER_KEY"] as Hex | undefined;
const registryAddress = env["OCE_REGISTRY"] as Address | undefined;

const sealer =
  sealerKey && registryAddress
    ? new Sealer({ privateKey: sealerKey, chainId: CHAIN_ID, verifyingContract: registryAddress })
    : undefined;

if (!sealer) {
  built.coverageGaps.push(
    "SEALING_UNAVAILABLE: no OCE_SEALER_KEY or OCE_REGISTRY — packs are delivered unsigned and unanchored",
  );
}

/* ------------------------------------------------------------------- gate */

let gate: PaymentGate;

if (PAYMENT_MODE === "okx") {
  const treasury = env["OCE_TREASURY"] as Address | undefined;
  if (!treasury) {
    console.error("OCE_PAYMENT_MODE=okx requires OCE_TREASURY (the address that receives USDT)");
    process.exit(1);
  }

  gate = new OkxGate({
    store,
    treasury,
    chainId: CHAIN_ID,
    publicBaseUrl: PUBLIC_BASE_URL,
    ...(env["OCE_SETTLEMENT_ASSET"] ? { asset: env["OCE_SETTLEMENT_ASSET"] as Address } : {}),
    ...(env["OCE_ASSET_NAME"] ? { assetName: env["OCE_ASSET_NAME"] } : {}),
    ...(env["OCE_RPC_URL"] ? { rpcUrl: env["OCE_RPC_URL"] } : {}),
    // The sealer key doubles as the gas key that redeems payment authorizations.
    ...(sealerKey ? { settlementKey: sealerKey } : {}),
  });
} else {
  gate = new DevGate();
  console.warn("⚠  OCE_PAYMENT_MODE is not 'okx' — every paid tool is FREE. Never do this in production.");
}

/* ------------------------------------------------------------------- app */

// The raw truth of a failure lands here — provider errors, URLs, stack detail —
// and NOWHERE else. Packs carry a stable code and one plain sentence instead.
built.deps.log = (message, detail) => {
  console.error(`[occestra] ${message}:`, detail instanceof Error ? detail.message : detail);
};

const ctx: AppContext = {
  deps: built.deps,
  store,
  grader: buildGrader({ deps: built.deps, linkChecker: built.linkChecker }),
  coverageGaps: built.coverageGaps,
  linkChecker: built.linkChecker,
  governor: built.governor,
  gate,
  publicBaseUrl: PUBLIC_BASE_URL,
  chainId: CHAIN_ID,
  live: built.live,
  ...(sealer ? { sealer, sealerAddress: sealer.signer } : {}),
  ...(registryAddress ? { registry: registryAddress } : {}),
  ...(env["OCE_DEMO_SECRET"] ? { demoSecret: env["OCE_DEMO_SECRET"] } : {}),
  ...(env["OCE_DEMO_DAILY_CAP"] ? { demoDailyCap: Number(env["OCE_DEMO_DAILY_CAP"]) } : {}),
  ...(env["OCE_DEMO_PER_IP_CAP"] ? { demoPerIpCap: Number(env["OCE_DEMO_PER_IP_CAP"]) } : {}),
};

/* -------------------------------------------------------------- job queue */

const jobs = new JobQueue({
  ctx: { ...ctx, packForClient: (pack) => packResult(ctx, pack) },
  concurrency: Number(env["OCE_JOB_CONCURRENCY"] ?? 2),
  ...(built.linkChecker ? { linkChecker: built.linkChecker } : {}),
});
ctx.jobs = jobs;

const recovered = jobs.start();

const app = buildApp(ctx);

/* --------------------------------------------------------- anchor worker */

if (sealerKey && registryAddress) {
  const worker = new AnchorWorker({
    store,
    registry: new RegistryClient({
      address: registryAddress,
      chainId: CHAIN_ID,
      privateKey: sealerKey,
      ...(env["OCE_RPC_URL"] ? { rpcUrl: env["OCE_RPC_URL"] } : {}),
    }),
    intervalMs: Number(env["OCE_ANCHOR_INTERVAL_MIN"] ?? 30) * 60_000,
  });
  worker.start();
  void worker.drain(); // catch up on anything queued while we were down
}

/* -------------------------------------------------- abandoned upload sweep */

// A stranger's photograph that was uploaded but never turned into a keepsake must not live on
// our disk forever. Sweep unlinked uploads older than OCE_UPLOAD_TTL_DAYS (default 3), hourly.
const UPLOAD_TTL_DAYS = Number(env["OCE_UPLOAD_TTL_DAYS"] ?? 3);
const sweepUploads = (): void => {
  const removed = store.purgeAbandonedUploads(UPLOAD_TTL_DAYS * 24 * 60 * 60 * 1000);
  if (removed.length > 0) {
    store.audit("uploads_purged", { detail: `${removed.length} abandoned upload(s) older than ${UPLOAD_TTL_DAYS}d` });
    console.log(`[occestra] purged ${removed.length} abandoned upload(s)`);
  }
};
sweepUploads();
const uploadSweep = setInterval(sweepUploads, 60 * 60 * 1000);
uploadSweep.unref();

/* ------------------------------------------------------------------ start */

app.listen(PORT, () => {
  console.log(`\nOccestra v${VERSION} — every moment, made monumental.\n`);
  console.log(`  listening      http://0.0.0.0:${PORT}`);
  console.log(`  public         ${PUBLIC_BASE_URL}`);
  console.log(`  mcp            ${PUBLIC_BASE_URL}/mcp  (POST, stateless)`);
  console.log(`  manifest       ${PUBLIC_BASE_URL}/.well-known/occestra.json`);
  console.log(`  standard       ${PUBLIC_BASE_URL}/standard`);
  console.log(`  payment mode   ${gate.mode}`);
  console.log(`  chain          ${CHAIN_ID}`);
  console.log(`  registry       ${registryAddress ?? "(none — packs are unanchored)"}`);
  console.log(`  sealer         ${sealer?.signer ?? "(none — packs are unsigned)"}`);
  console.log(`  job workers    ${env["OCE_JOB_CONCURRENCY"] ?? 2}`);

  // A restart is not an excuse to lose work somebody has already paid for.
  if (recovered.requeued.length > 0) {
    console.log(`  recovered      ${recovered.requeued.length} job(s) requeued after restart`);
  }
  if (recovered.abandoned.length > 0) {
    console.log(`  abandoned      ${recovered.abandoned.length} job(s) failed twice — refunds booked`);
  }

  const owed = store.refundsOwed();
  if (owed.length > 0) {
    console.log(
      `\n  ⚠ REFUNDS OWED: ${owed.length} — ${owed.reduce((sum, r) => sum + r.amountUsdt, 0).toFixed(4)} USDT. Run: node scripts/refunds.mjs`,
    );
  }
  console.log(`  live adapters  ${Object.entries(built.live).filter(([, on]) => on).map(([name]) => name).join(", ") || "none"}`);

  if (built.coverageGaps.length > 0) {
    console.log("\n  coverage gaps (recorded into every pack, not hidden):");
    for (const gap of built.coverageGaps) console.log(`    - ${gap}`);
  }
  console.log("");
});

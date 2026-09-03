#!/usr/bin/env node
/**
 * Deploy OccestraQualityAdjudicator to GenLayer.
 *
 * This spends real funds from a real wallet, so it refuses to run until it has checked every
 * condition itself rather than trusting that someone remembered. A deploy that half-works
 * leaves a contract address in a README pointing at something nobody tested.
 *
 *   node scripts/genlayer-deploy.mjs --check     preflight only, changes nothing
 *   node scripts/genlayer-deploy.mjs --deploy    actually deploy
 *
 * Reads the submitter key from GENLAYER_SUBMITTER_PRIVATE_KEY, which lives in
 * /root/.occestra-secrets/genlayer.env on the VPS and is never in this repo.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient, createAccount, chains } from "genlayer-js";

const CONTRACT = "genlayer/contracts/OccestraQualityAdjudicator.py";
const MODE = process.argv.includes("--deploy") ? "deploy" : "check";

/** Keys that must never be reused here. Separate trust domains, separate credentials. */
const FORBIDDEN_ENV = ["OCE_SEALER_KEY", "OCE_DEPLOYER_KEY", "OKX_SECRET_KEY"];

function fail(message) {
  console.error(`  ✗ ${message}`);
  process.exitCode = 1;
  return false;
}
function ok(message) {
  console.log(`  ✓ ${message}`);
  return true;
}

const env = process.env;
let healthy = true;

console.log("\n  Preflight\n");

// 1. The contract exists and passes its own linter.
if (!existsSync(CONTRACT)) healthy = fail(`${CONTRACT} is missing`);
else {
  try {
    const out = execFileSync("genlayer/.venv/bin/genvm-lint", ["lint", CONTRACT], {
      encoding: "utf8",
    });
    if (/Lint passed/.test(out) && !/Warnings/.test(out)) ok("contract lints clean");
    else healthy = fail(`contract lint is not clean:\n${out}`);
  } catch (error) {
    healthy = fail(`could not run the linter: ${error.message}`);
  }
}

// 2. Direct tests pass. Deploying past a failing test is how a bad contract becomes permanent.
try {
  execFileSync("genlayer/.venv/bin/gltest", ["genlayer/tests/direct/", "-q"], {
    encoding: "utf8",
    cwd: "genlayer",
  });
  ok("direct tests pass");
} catch {
  try {
    execFileSync("./.venv/bin/gltest", ["tests/direct/", "-q"], { encoding: "utf8", cwd: "genlayer" });
    ok("direct tests pass");
  } catch (error) {
    healthy = fail(`direct tests are not green:\n${String(error.stdout ?? error.message).slice(-800)}`);
  }
}

// 3. No secret is sitting in the working tree.
//
// Matching bare 0x+64hex is useless here: this repo is full of them, and every one is a
// public transaction hash, manifest hash or seal leaf that is SUPPOSED to be committed. A
// private key is distinguished by what it is assigned TO, so that is what this looks for.
try {
  const tracked = execFileSync(
    "git",
    ["grep", "-nEi", "(private_?key|secret_?key|sealer_?key|mnemonic|seed_?phrase)[\"']?\\s*[:=]\\s*[\"']?0x[0-9a-fA-F]{64}", "--", "."],
    { encoding: "utf8" },
  );
  if (tracked.trim()) healthy = fail(`a private key appears to be tracked in git:\n${tracked}`);
  else ok("no private key is tracked in git");
} catch {
  // git grep exits non-zero when it finds nothing, which is the good case.
  ok("no private key is tracked in git");
}

// 4. A dedicated key, and demonstrably not one of the production ones.
const key = env.GENLAYER_SUBMITTER_PRIVATE_KEY?.trim();
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  healthy = fail("GENLAYER_SUBMITTER_PRIVATE_KEY is missing or malformed");
} else {
  const collision = FORBIDDEN_ENV.find((name) => env[name]?.trim() === key);
  if (collision) healthy = fail(`the submitter key is the same as ${collision} — separate them`);
  else ok("submitter key is present and distinct from the X Layer credentials");
}

// 5. The wallet is actually funded.
const network = env.GENLAYER_NETWORK?.trim() || "bradbury";
const chain = network === "asimov" ? chains.testnetAsimov : chains.testnetBradbury;
let account;
if (key && /^0x[0-9a-fA-F]{64}$/.test(key)) {
  account = createAccount(key);
  const client = createClient({ chain, account });
  try {
    const balance = await client.getBalance({ address: account.address });
    const gen = Number(balance) / 1e18;
    if (balance === 0n) healthy = fail(`${account.address} has no GEN — fund it before deploying`);
    else if (gen < 0.5) healthy = fail(`${account.address} holds only ${gen} GEN; that is too thin`);
    else ok(`${account.address} holds ${gen} GEN`);
  } catch (error) {
    healthy = fail(`could not read the balance: ${error.message}`);
  }
}

if (!healthy) {
  console.error("\n  Preflight failed. Nothing was deployed.\n");
  process.exit(1);
}

console.log("\n  Preflight clean.\n");

if (MODE === "check") {
  console.log("  Check-only run. Re-run with --deploy to deploy.\n");
  process.exit(0);
}

/* ------------------------------------------------------------------ deploy */

const code = readFileSync(CONTRACT);
const client = createClient({ chain, account });

console.log(`  Deploying ${CONTRACT} to ${chain.name} (chain ${chain.id})...\n`);
const txHash = await client.deployContract({ code, args: [] });
console.log(`  deploy tx: ${txHash}`);

const receipt = await client.waitForTransactionReceipt({ hash: txHash, status: "FINALIZED" });
const address = receipt?.data?.contract_address ?? receipt?.contract_address;

// Everything a steward needs to verify this independently, printed once, from real values.
console.log("\n  DEPLOYED\n");
console.log(`    network         ${chain.name}`);
console.log(`    chainId         ${chain.id}`);
console.log(`    address         ${address ?? "(read it from the receipt below)"}`);
console.log(`    deployTx        ${txHash}`);
console.log(`    deployer        ${account.address}`);
console.log(`    explorer        ${chain.blockExplorers?.default?.url ?? ""}`);
console.log(`    deployedAt      (stamp this from your shell; scripts here take no clock)`);
if (!address) console.log(`\n    receipt: ${JSON.stringify(receipt).slice(0, 2000)}`);
console.log("\n  Record these in genlayer/README.md and .env, then run the smoke reviews.\n");

/**
 * Smoke test 1: the evidence-origin guard, on chain, against real validators.
 *
 * This one needs no production deployment, because it is supposed to be REJECTED. It proves
 * the security property that matters most about this contract: a caller cannot point it at an
 * arbitrary URL and turn every GenLayer validator into a fetcher for a host they chose.
 */
import { createClient, createAccount, chains } from "genlayer-js";

const CONTRACT = "0xd3baaBD39F6d83949803de0a62B84a04285Ef3d9";
const client = createClient({
  chain: chains.testnetBradbury,
  account: createAccount(process.env.GENLAYER_SUBMITTER_PRIVATE_KEY),
});

console.log("  submitting a review whose evidence URL is NOT an Occestra origin...");
const hash = await client.writeContract({
  address: CONTRACT,
  functionName: "request_review",
  args: [
    "oce_gl_smoke_origin_01",
    "https://evil.example.com/genlayer/evidence/oce_gl_smoke_origin_01",
    "0x" + "11".repeat(32),
    "written",
    "1.2.0",
    "PASS",
    1788422400n,
  ],
  value: 0n,
});
console.log(`  tx: ${hash}`);

const tx = await client.waitForTransactionReceipt({
  hash, status: "ACCEPTED", interval: 5000, retries: 120,
});
console.log(`  status      : ${tx.statusName}`);
console.log(`  validators  : ${tx.resultName}`);
console.log(`  execution   : ${tx.txExecutionResultName}`);

// The contract must have refused, and must not have stored anything.
const count = await client.readContract({ address: CONTRACT, functionName: "review_count", args: [] });
console.log(`  review_count: ${count}  ${Number(count) === 0 ? "(nothing stored — correct)" : "(SOMETHING WAS STORED — BAD)"}`);

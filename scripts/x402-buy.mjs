#!/usr/bin/env node
/**
 * Buy one service on the live rail and keep what it returns.
 *
 * A sibling of x402-buyer-smoke.mjs: same signing path, same treasury-pays-itself trick
 * (`from == to`, so the settlement is real but moves no net value and costs only gas), but
 * this one is for producing an ACTUAL deliverable — a marketplace task that was paid through
 * escrow still needs real work handed back, and the artifacts must land in the production
 * store so their /k links resolve for the buyer.
 *
 *   set -a; . /etc/occestra/env; set +a
 *   node scripts/x402-buy.mjs <tool> <brief.json> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";

const [tool, briefPath, outPath] = process.argv.slice(2);
const BASE = process.env.OCE_SMOKE_BASE ?? "https://api.occestra.xyz";
const KEY = process.env.OCE_SEALER_KEY;

if (!tool || !briefPath || !outPath) {
  console.error("\n  usage: node scripts/x402-buy.mjs <tool> <brief.json> <out.json>\n");
  process.exit(1);
}
if (!KEY) {
  console.error("\n  no OCE_SEALER_KEY — source /etc/occestra/env first.\n");
  process.exit(1);
}

const account = privateKeyToAccount(KEY);
const body = JSON.parse(readFileSync(briefPath, "utf8"));
const url = `${BASE}/x402/${tool}`;

const probe = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify(body),
});

if (probe.status !== 402) {
  console.error(`  expected 402, got ${probe.status}: ${(await probe.text()).slice(0, 400)}`);
  process.exit(1);
}

const terms = (await probe.json()).accepts[0];
const now = Math.floor(Date.now() / 1000);
const authorization = {
  from: account.address,
  to: terms.payTo,
  value: BigInt(terms.amount),
  validAfter: BigInt(now - 60),
  validBefore: BigInt(now + terms.maxTimeoutSeconds),
  nonce: `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`,
};

const signature = await account.signTypedData({
  domain: {
    name: terms.extra.name,
    version: terms.extra.version,
    chainId: Number(terms.network.split(":")[1]),
    verifyingContract: terms.asset,
  },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: authorization,
});

const paymentHeader = Buffer.from(
  JSON.stringify({
    x402Version: 2,
    scheme: "exact",
    network: terms.network,
    payload: {
      signature,
      authorization: {
        ...authorization,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
      },
    },
  }),
).toString("base64");

console.log(`  buying ${tool} at ${terms.amount} (${terms.decimals}dp)…`);
const started = Date.now();

const paid = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "PAYMENT-SIGNATURE": paymentHeader,
  },
  body: JSON.stringify(body),
});

const result = await paid.json();
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

if (paid.status !== 200) {
  console.error(`  HTTP ${paid.status} after ${elapsed}s: ${JSON.stringify(result).slice(0, 600)}`);
  process.exit(1);
}

const receipt = paid.headers.get("payment-response");
if (receipt) {
  const decoded = JSON.parse(Buffer.from(receipt, "base64").toString("utf8"));
  console.log(`  settlement: ${decoded.status} ${decoded.transaction ?? ""}`);
}

writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`  delivered in ${elapsed}s → ${outPath}`);

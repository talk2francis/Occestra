#!/usr/bin/env node
/**
 * Be the buyer. The only way to prove the paid rail actually delivers.
 *
 * Everything else we run tests the seller's side of the counter. This script stands on the
 * other side of it: it takes a real 402 challenge, signs a real EIP-3009 authorization,
 * replays the request, and checks that a deliverable comes back — the exact sequence that
 * failed twice on 2026-07-28 and charged the buyer 0.60 USD₮0 for nothing.
 *
 * It signs with the treasury key, so `from` and `to` are the same address: the transfer is a
 * real on-chain settlement that moves no net value and costs only OKB gas. That makes it safe
 * to run as often as you like, while still exercising the whole path — signature verification,
 * nonce claim, on-chain submission, and the receipt confirmation that was the bug.
 *
 * It then replays the SAME paid nonce with a re-serialized body, which must return the same
 * answer rather than 422.
 *
 *   set -a; . /etc/occestra/env; set +a
 *   node scripts/x402-buyer-smoke.mjs [tool]
 */
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const BASE = process.env.OCE_SMOKE_BASE ?? "https://api.occestra.xyz";
const TOOL = process.argv[2] ?? "oce_critique";
const KEY = process.env.OCE_SEALER_KEY;

if (!KEY) {
  console.error("\n  no OCE_SEALER_KEY — source /etc/occestra/env first.\n");
  process.exit(1);
}

const account = privateKeyToAccount(KEY);
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

/**
 * Per-tool briefs. `oce_critique` is the default because it is cheap and fast; the plan brief
 * is the one the 2026-07-28 tester actually bought, kept here so the failure can be re-run
 * exactly rather than approximated.
 */
const BODIES = {
  oce_critique: {
    artifact: {
      kind: "toast",
      format: "text",
      text: "To Amalia, who read thirty-one harvests in the soil before the vines said a word.",
    },
  },
  oce_plan_occasion: {
    occasion: "Retirement dinner for head winemaker Amalia Ferreiro after 31 harvests",
    date: "2026-10-17",
    location: "Porto",
    guestCount: 34,
    budgetUsd: 4200,
    style: "terra_fresco",
    tone: "warm, unfussy, candlelit harvest-supper feel",
    deliverables: ["plan", "schedule", "budget", "contingency", "guest_guide", "toast"],
    context: {
      dietary: ["two vegetarians", "one coeliac"],
      accessibility: ["an 88-year-old guest with a walking frame: step-free, short walk from the car"],
      donts: ["no amplified music", "speeches must finish before 22:00"],
    },
  },
};

const BODY = BODIES[TOOL] ?? BODIES["oce_critique"];

const url = `${BASE}/x402/${TOOL}`;

/* ------------------------------------------------------------------ 1. the challenge */

const probe = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify(BODY),
});

check("plain buyer gets 402, not 405/406", probe.status === 402, `HTTP ${probe.status}`);
const challenge = await probe.json();
const terms = challenge.accepts?.[0];
check("challenge carries exact-scheme terms", terms?.scheme === "exact", terms?.scheme);
console.log(`    price ${terms.amount} (${terms.decimals}dp) of ${terms.asset} → ${terms.payTo}`);

/* --------------------------------------------------------------------- 2. the payment */

const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;
const now = Math.floor(Date.now() / 1000);
const authorization = {
  from: account.address,
  to: terms.payTo,
  value: BigInt(terms.amount),
  validAfter: BigInt(now - 60),
  validBefore: BigInt(now + terms.maxTimeoutSeconds),
  nonce,
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

/* ------------------------------------------------------------------- 3. the deliverable */

const started = Date.now();
const paid = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "PAYMENT-SIGNATURE": paymentHeader,
  },
  body: JSON.stringify(BODY),
});

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const paidBody = await paid.json();

check(`paid call returns 200 in ${elapsed}s`, paid.status === 200, `HTTP ${paid.status}`);
check("a deliverable came back", Boolean(paidBody?.deliverable), Object.keys(paidBody).join(","));

const receipt = paid.headers.get("payment-response");
if (receipt) {
  const decoded = JSON.parse(Buffer.from(receipt, "base64").toString("utf8"));
  console.log(`    settlement: ${decoded.status} ${decoded.transaction ?? ""}`);
  // "broadcast" is acceptable and is the whole point of the fix; "verified" would mean we
  // never went on chain at all.
  check(
    "settlement reached the chain",
    decoded.status === "settled" || decoded.status === "broadcast",
    decoded.status,
  );

  if (decoded.transaction) {
    const client = createWalletClient({
      account,
      transport: http(process.env.OCE_RPC_URL ?? "https://rpc.xlayer.tech"),
    }).extend(publicActions);
    try {
      const chainReceipt = await client.getTransactionReceipt({ hash: decoded.transaction });
      check("settlement tx succeeded on chain", chainReceipt.status === "success", chainReceipt.status);
    } catch (error) {
      console.log(`    (receipt not readable yet: ${error.shortMessage ?? error.message})`);
    }
  }
} else {
  check("PAYMENT-RESPONSE header present", false);
}

/* ------------------------------------------------- 4. the recovery that used to be impossible */

const replayed = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "PAYMENT-SIGNATURE": paymentHeader,
  },
  // Deliberately re-serialized: same meaning, different bytes. This is what a buyer's client
  // does on retry, and what used to earn a 422 with the money already gone.
  body: JSON.stringify(BODY, null, 2),
});

const replayedBody = await replayed.json();
check("same nonce replays instead of 422", replayed.status === 200, `HTTP ${replayed.status}`);
check("replay is marked as one", replayed.headers.get("idempotency-replayed") === "true");
check(
  "replay returns the SAME deliverable, not new work",
  JSON.stringify(replayedBody?.deliverable) === JSON.stringify(paidBody?.deliverable),
);

console.log(failures === 0 ? "\n  the paid rail delivers.\n" : `\n  ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * The refund ledger, and the button that pays it.
 *
 * x402 settles BEFORE the work runs. That is not a design flaw, it is what makes an agent
 * with no account able to buy from an agent it has never met — but it means every failure
 * after settlement leaves money in our treasury and nothing in the buyer's hands. Occestra
 * writes every one of those down (see `refunds` in the store, and /health and /stats, where
 * the number is published rather than buried).
 *
 * Paying them back is a human action, on purpose. This script will not run itself, no worker
 * calls it, and nothing in the server can move money out of the treasury on its own. An ASP
 * that can autonomously spend from its own treasury is one bug away from having no treasury.
 *
 *   node scripts/refunds.mjs           # what is owed, to whom, and why
 *   node scripts/refunds.mjs --pay     # pay it, on chain, one transfer per debt
 *
 * The paying key is OCE_REFUND_KEY, or OCE_SEALER_KEY if that is unset. It must control the
 * treasury address — the script checks, and refuses if it does not.
 */

import Database from "better-sqlite3";
import { createPublicClient, createWalletClient, formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainFor } from "../packages/receipts/dist/index.js";



const PAY = process.argv.includes("--pay");
const DATA_DIR = process.env.OCE_DATA_DIR ?? "data";
const CHAIN_ID = Number(process.env.OCE_CHAIN_ID ?? 196);
const ASSET = process.env.OCE_SETTLEMENT_ASSET ?? "0x779ded0c9e1022225f8e0630b35a9b54be713736";
const TREASURY = process.env.OCE_TREASURY;
const DECIMALS = 6;

const ERC20 = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

const db = new Database(`${DATA_DIR}/occestra.db`, { readonly: !PAY });
const owed = db.prepare("SELECT * FROM refunds WHERE paid_at IS NULL ORDER BY created_at").all();

if (owed.length === 0) {
  console.log("\nNothing is owed. Every paid call delivered something.\n");
  process.exit(0);
}

const total = owed.reduce((sum, row) => sum + row.amount_usdt, 0);

console.log(`\n  ${owed.length} refund(s) owed — ${total.toFixed(4)} USDT\n`);
for (const row of owed) {
  const when = new Date(row.created_at).toISOString().slice(0, 16).replace("T", " ");
  console.log(`  ${when}  ${String(row.amount_usdt).padStart(6)} USDT  ${row.payer_ref}`);
  console.log(`                ${row.tool} — ${row.reason}  (order ${row.order_id})`);
}

if (!PAY) {
  console.log(`\n  This is a report. To actually pay them:  node scripts/refunds.mjs --pay\n`);
  process.exit(0);
}

/* ------------------------------------------------------------------- pay */

const key = process.env.OCE_REFUND_KEY ?? process.env.OCE_SEALER_KEY;
if (!key) {
  console.error("\nNo OCE_REFUND_KEY (or OCE_SEALER_KEY). Nothing can be paid without one.\n");
  process.exit(1);
}

const account = privateKeyToAccount(key);
const chain = chainFor(CHAIN_ID);
const transport = http(process.env.OCE_RPC_URL ?? chain.rpcUrls.default.http[0]);
const publicClient = createPublicClient({ chain, transport });
const wallet = createWalletClient({ account, chain, transport });

// The money must come from the address the buyers actually paid. If the key we hold is not
// that address, paying from it would be a transfer out of some OTHER wallet — which is either
// a mistake or a theft, and this script is not going to guess which.
if (TREASURY && account.address.toLowerCase() !== TREASURY.toLowerCase()) {
  console.error(`\n  The refund key controls ${account.address}`);
  console.error(`  but the treasury buyers paid into is ${TREASURY}.`);
  console.error(`\n  Refusing to pay refunds out of a wallet that did not take the money.`);
  console.error(`  Set OCE_REFUND_KEY to the key for ${TREASURY}.\n`);
  process.exit(1);
}

const balance = await publicClient.readContract({
  address: ASSET,
  abi: ERC20,
  functionName: "balanceOf",
  args: [account.address],
});

console.log(`\n  paying from   ${account.address}`);
console.log(`  balance       ${formatUnits(balance, DECIMALS)} USDT`);
console.log(`  to pay        ${total.toFixed(4)} USDT\n`);

if (balance < parseUnits(total.toFixed(DECIMALS), DECIMALS)) {
  console.error("  Not enough USDT to clear the ledger. Top up, or pay them one at a time.\n");
  process.exit(1);
}

const markPaid = db.prepare("UPDATE refunds SET tx_hash = ?, paid_at = ? WHERE order_id = ?");

for (const row of owed) {
  const value = parseUnits(row.amount_usdt.toFixed(DECIMALS), DECIMALS);

  try {
    const hash = await wallet.writeContract({
      address: ASSET,
      abi: ERC20,
      functionName: "transfer",
      args: [row.payer_ref, value],
      account,
      chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      console.error(`  ✗ ${row.order_id} — the transfer reverted (${hash})`);
      continue;
    }

    // Written down only AFTER the chain agrees it happened. A debt marked paid by a transfer
    // that reverted is a debt that has quietly disappeared.
    markPaid.run(hash, Date.now(), row.order_id);
    console.log(`  ✓ ${row.amount_usdt} USDT -> ${row.payer_ref}  ${hash}`);
  } catch (error) {
    console.error(`  ✗ ${row.order_id} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

const left = db.prepare("SELECT COUNT(*) AS n FROM refunds WHERE paid_at IS NULL").get();
console.log(`\n  ${left.n} refund(s) still owed.\n`);

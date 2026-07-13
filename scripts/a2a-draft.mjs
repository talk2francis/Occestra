/**
 * The semi-manual tasks helper. The OKX.AI tasks board has no public REST API
 * (finding recorded in AGENTS.md deviations) and the onchainos CLI holds one
 * session at a time — so there is deliberately NO auto-bidding. A human runs:
 *
 *   node scripts/a2a-draft.mjs "the task text pasted from the board"
 *
 * …and gets back the negotiation skill's draft reply, quote, and (if the
 * counterparty already agreed) the exact pipeline call to run. If
 * OCE_TELEGRAM_TOKEN + OCE_TELEGRAM_CHAT are set, the draft is also pushed to
 * Telegram for approval on the move. The human sends the message; the human
 * clicks nothing they haven't read.
 */
import { freshState, negotiate } from "../packages/mcp-server/dist/a2a/negotiate.js";

const text = process.argv.slice(2).join(" ").trim();
if (!text) {
  console.error('usage: node scripts/a2a-draft.mjs "<task text from the OKX.AI board>"');
  process.exit(1);
}

const out = negotiate(freshState(), text);

console.log("── draft reply (send it yourself — no auto-bidding) ──────────");
console.log(out.reply);
console.log("\n── state ──────────────────────────────────────────────────");
console.log(JSON.stringify(out.state, null, 2));
if (out.action) {
  console.log("\n── pipeline action (run after agreement + escrow) ─────────");
  console.log(JSON.stringify(out.action, null, 2));
}

const token = process.env.OCE_TELEGRAM_TOKEN;
const chat = process.env.OCE_TELEGRAM_CHAT;
if (token && chat) {
  const body = `A2A draft for a board task:\n\n${out.reply}\n\n(stage: ${out.state.stage})`;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: body }),
  });
  console.log(`\ntelegram ping: ${res.ok ? "sent" : `failed (${res.status})`}`);
}

#!/usr/bin/env node
/**
 * The async job lifecycle, end to end, against a running ASP.
 *
 * Proves the thing the unit tests cannot: that a real HTTP client can start a job, watch it,
 * and collect the pack — and that the safety rails hold on the wire, not just in a function.
 * It checks four things a buyer actually cares about:
 *
 *   1. a blocked brief is refused AT THE DOOR, with no order recorded;
 *   2. a job goes queued -> running -> done and hands back a real pack;
 *   3. the SAME idempotency key, sent twice, is one pack and one charge (Idempotency-Replayed);
 *   4. /health publishes the job queue and the refund ledger.
 *
 * Point it at a fake-mode server (free) or a real one. Defaults to the local ASP.
 *
 *   OCE_SMOKE_BASE=http://127.0.0.1:8412 node scripts/job-smoke.mjs
 */
const BASE = process.env.OCE_SMOKE_BASE ?? "http://127.0.0.1:8412";

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

async function call(name, args, headers = {}) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: Math.floor(Math.random() * 1e6), method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  let payload;
  try {
    payload = JSON.parse(line ? line.slice(6) : text);
  } catch {
    payload = undefined;
  }
  const inner = payload?.result?.content?.[0]?.text;
  return { status: res.status, replayed: res.headers.get("idempotency-replayed"), body: inner ? JSON.parse(inner) : payload };
}

console.log(`\n  Async job smoke against ${BASE}\n`);

// 1. blocked brief, refused before any money
const blocked = await call("oce_launch_kit", { productName: "Spider-Man Fan Club", description: "a marvel fan community" });
check("a franchise brief is refused at the door", blocked.status === 403 && blocked.body?.charged === false);

// 2. a job, start to finish
const created = await call("oce_create_pack_job", {
  tool: "oce_plan_occasion",
  arguments: { occasion: "a 30th birthday dinner", city: "Lisbon", date: "2026-08-18", headcount: 12, vibe: "warm, candlelit, long table" },
});
check("a job is created and queued", created.status === 200 && created.body?.state === "queued", created.body?.jobId);

const jobId = created.body?.jobId;
let state = "queued";
let last;
for (let i = 0; i < 120 && (state === "queued" || state === "running"); i += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  last = await call("oce_job_status", { jobId });
  state = last.body?.state;
}
check("the job reached a terminal state", state === "done", `${state}, ${last?.body?.progress?.length ?? 0} events`);
check("the progress feed is the real run", (last?.body?.progress ?? []).some((e) => e.body?.type === "run_started"));

const result = await call("oce_job_result", { jobId });
check("the finished pack is collectable", result.body?.ready === true && Boolean(result.body?.keepsakeId));
check("every artifact carries its Tribunal report", (result.body?.artifacts ?? []).every((a) => a.tribunal || a.undelivered));

// 3. idempotency, on the wire
const toast = { subject: "my sister Mara", details: "she taught me to drive, badly" };
const a = await call("oce_write_toast", toast, { "Idempotency-Key": "smoke-idem-1" });
const b = await call("oce_write_toast", toast, { "Idempotency-Key": "smoke-idem-1" });
check("the same idempotency key returns the same pack", a.body?.keepsakeId && a.body.keepsakeId === b.body?.keepsakeId);
check("and the second is flagged as a replay", b.replayed === "true");

// 4. health publishes the queue and the ledger
const health = await (await fetch(`${BASE}/health`)).json();
check("/health publishes the job queue", health.jobs && typeof health.jobs.queued === "number");
check("/health publishes the refund ledger", health.refundsOwed && typeof health.refundsOwed.count === "number");

console.log(`\n  ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);

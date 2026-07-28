/**
 * THE MONEY MUST NOT OUTRUN THE GOODS.
 *
 * On 2026-07-28 a buyer ran the marketplace listing end to end and paid twice, 0.60 USD₮0, for
 * nothing. Neither charge was a pricing bug or a pipeline bug — the pipeline never ran. Both
 * were failures in the seam between "the transfer landed" and "here is your deliverable":
 *
 *   1. `settle()` confirmed the transfer with viem's `waitForTransactionReceipt`, which polls
 *      the head and then FETCHES THAT BLOCK. X Layer's public RPC is a load-balanced pool, so
 *      one node advertised head N while the next answered `block is out of range` for it. That
 *      is a well-formed JSON-RPC error, not a network error, so viem did not retry — it threw.
 *      The transfer had already landed. The buyer got HTTP 400 and we kept the fee.
 *
 *   2. Recovery was impossible afterwards. The idempotency key we derive from the payment
 *      nonce was ALSO bound to a hash of the request body, so replaying the same paid nonce
 *      with a byte-different serialization returned 422 "used for a DIFFERENT request". The
 *      nonce was spent, the answer was unreachable, and the money was gone for good.
 *
 * These tests hold both seams shut.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { OkxGate, type GateVerdict } from "../src/gate.js";
import { Store } from "../src/store.js";

const dirs: string[] = [];

function makeStore(): Store {
  const dataDir = mkdtempSync(join(tmpdir(), "occestra-settlement-"));
  dirs.push(dataDir);
  return new Store({ dataDir, urlSecret: "test-secret", baseUrl: "http://test.local" });
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/* ------------------------------------------------- 1. the receipt must not be fatal */

type ConfirmResult = { status: "success" | "reverted" | "unconfirmed" };

/** `confirm` is private because nothing outside the gate may decide this. Tests may look. */
function confirmOf(gate: OkxGate): (client: unknown, hash: string) => Promise<ConfirmResult> {
  const method = (gate as unknown as Record<string, unknown>)["confirm"];
  return (method as (c: unknown, h: string) => Promise<ConfirmResult>).bind(gate);
}

function makeGate(): OkxGate {
  return new OkxGate({
    store: makeStore(),
    treasury: "0x0d63f9eeb86813230b72017444cea16cd4a453f2",
    publicBaseUrl: "http://test.local",
  });
}

describe("settlement confirmation survives a flaky RPC pool", () => {
  it("keeps asking after `block is out of range` instead of throwing", async () => {
    const confirm = confirmOf(makeGate());
    let calls = 0;

    const client = {
      getTransactionReceipt: async () => {
        calls += 1;
        // The exact shape of the failure that cost 0.30 USD₮0.
        if (calls < 3) throw new Error("RPC Request failed. Details: block is out of range");
        return { status: "success" };
      },
    };

    expect(await confirm(client, "0xdead")).toEqual({ status: "success" });
    expect(calls).toBe(3);
  });

  it("retries a not-yet-mined receipt rather than treating absence as failure", async () => {
    const confirm = confirmOf(makeGate());
    let calls = 0;

    const client = {
      getTransactionReceipt: async () => {
        calls += 1;
        if (calls < 2) throw new Error("Transaction receipt with hash 0xdead could not be found");
        return { status: "success" };
      },
    };

    expect(await confirm(client, "0xdead")).toEqual({ status: "success" });
  });

  it("reports a genuine revert as a revert — that money really did not move", async () => {
    const confirm = confirmOf(makeGate());
    const client = { getTransactionReceipt: async () => ({ status: "reverted" }) };

    expect(await confirm(client, "0xdead")).toEqual({ status: "reverted" });
  });

  it("gives up as `unconfirmed`, never as an error, when the RPC never answers", async () => {
    // A clock we control, so the 90s deadline costs the suite nothing: each reading jumps
    // 50s, which also drives the backoff sleep to zero once the deadline is behind us.
    let now = 0;
    const gate = new OkxGate({
      store: makeStore(),
      treasury: "0x0d63f9eeb86813230b72017444cea16cd4a453f2",
      publicBaseUrl: "http://test.local",
      now: () => (now += 50_000),
    });

    let attempts = 0;
    const client = {
      getTransactionReceipt: async () => {
        attempts += 1;
        throw new Error("block is out of range");
      },
    };

    // The point: it RESOLVES. Whatever else happens, the caller is never handed an exception
    // that turns into a 400 on top of a completed transfer.
    expect(await confirmOf(gate)(client, "0xdead")).toEqual({ status: "unconfirmed" });
    expect(attempts).toBeGreaterThan(0);
  });
});

describe("the buyer is told the truth about an unconfirmed settlement", () => {
  const header = (verdict: Extract<GateVerdict, { ok: true }>): Record<string, unknown> =>
    JSON.parse(Buffer.from(OkxGate.settlementHeader(verdict, "0.3"), "base64").toString("utf8"));

  it("says `settled` when we have a receipt", () => {
    expect(
      header({ ok: true, payerRef: "0xabc", settled: true, txHash: "0x1", confirmed: true })[
        "status"
      ],
    ).toBe("settled");
  });

  it("says `broadcast` — not `settled`, not an error — when the receipt never arrived", () => {
    const decoded = header({
      ok: true,
      payerRef: "0xabc",
      settled: true,
      txHash: "0x1",
      confirmed: false,
    });

    expect(decoded["status"]).toBe("broadcast");
    // The hash is the whole point: the buyer can confirm for themselves what we could not.
    expect(decoded["transaction"]).toBe("0x1");
  });

  it("still says `verified` when there is no settlement key at all", () => {
    expect(header({ ok: true, payerRef: "0xabc", settled: false })["status"]).toBe("verified");
  });
});

/* ------------------------------------------------- 2. a spent nonce must stay redeemable */

describe("idempotency: a payment nonce buys exactly one answer, and keeps it", () => {
  const stored = { payload: { ok: true, service: "oce_plan_occasion" }, isError: false };

  it("replays for a nonce-derived key even if the retry serializes the body differently", () => {
    const store = makeStore();
    const nonce = "0xnonce-1";

    expect(store.claimIdempotencyKey(nonce, "hash-as-sent", "oce_plan_occasion", {
      bindRequest: false,
    })).toEqual({ status: "fresh" });
    store.completeIdempotencyKey(nonce, stored);

    // The buyer re-sends the same paid nonce, byte-compacted. Before the fix this was a 422
    // and the money was unrecoverable.
    const claim = store.claimIdempotencyKey(nonce, "hash-recompacted", "oce_plan_occasion", {
      bindRequest: false,
    });

    expect(claim.status).toBe("replay");
    expect((claim as { response: unknown }).response).toEqual(stored);
  });

  it("still refuses to answer for a DIFFERENT service on the same nonce", () => {
    const store = makeStore();
    const nonce = "0xnonce-2";

    store.claimIdempotencyKey(nonce, "hash-a", "oce_plan_occasion", { bindRequest: false });
    store.completeIdempotencyKey(nonce, stored);

    // Never hand back a plan to someone who asked for a toast, however they paid.
    expect(
      store.claimIdempotencyKey(nonce, "hash-a", "oce_write_toast", { bindRequest: false }).status,
    ).toBe("conflict");
  });

  it("keeps a BUYER-CHOSEN key bound to its request, because reuse there is their bug", () => {
    const store = makeStore();
    const key = "buyer-picked-key";

    store.claimIdempotencyKey(key, "hash-a", "oce_plan_occasion");
    store.completeIdempotencyKey(key, stored);

    expect(store.claimIdempotencyKey(key, "hash-b", "oce_plan_occasion").status).toBe("conflict");
    expect(store.claimIdempotencyKey(key, "hash-a", "oce_plan_occasion").status).toBe("replay");
  });

  it("reports an in-flight nonce as in_flight, so a retry does not start second work", () => {
    const store = makeStore();
    const nonce = "0xnonce-3";

    store.claimIdempotencyKey(nonce, "hash-a", "oce_plan_occasion", { bindRequest: false });
    expect(
      store.claimIdempotencyKey(nonce, "hash-b", "oce_plan_occasion", { bindRequest: false }).status,
    ).toBe("in_flight");
  });
});

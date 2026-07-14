/**
 * Async jobs, idempotency, and the money.
 *
 * The thing these tests are really defending is a number in somebody else's wallet. An ASP
 * that sells minutes-long work over a request/response protocol has exactly two ways to take
 * money it did not earn — charge twice for one retry, or charge once and deliver nothing —
 * and both of them are invisible unless you go looking. So we go looking.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FakeCritique, FakeImageModel, FakePlaces, FakeTextModel, FakeWeather, FixedClock } from "@occestra/providers";
import type { EngineDeps } from "@occestra/studio-core";
import { PACK_TOOLS, PRICES, paymentNonceOf, priceOf } from "../src/gate.js";
import { buildGrader } from "../src/grader.js";
import { JobQueue } from "../src/jobs.js";
import { PACK_PIPELINES } from "../src/pipelines.js";
import { packResult, type ServerContext } from "../src/server.js";
import { Store } from "../src/store.js";

const NOW = Date.parse("2026-07-14T10:00:00.000Z");
const dirs: string[] = [];

function makeCtx(over: Partial<EngineDeps> = {}): ServerContext & { store: Store } {
  const dataDir = mkdtempSync(join(tmpdir(), "occestra-jobs-"));
  dirs.push(dataDir);

  const store = new Store({ dataDir, urlSecret: "test-secret", baseUrl: "http://test.local" });

  const deps: EngineDeps = {
    text: new FakeTextModel(() => "## The toast\n\nTo Mara, who taught me to drive. Badly.\n\n## The short version\n\nTo Mara.\n\n## If you get emotional\n\nRaise the glass."),
    image: new FakeImageModel(),
    critique: new FakeCritique(88),
    storage: store.storage,
    clock: new FixedClock(NOW),
    weather: new FakeWeather(),
    places: new FakePlaces(),
    ...over,
  };

  return {
    deps,
    store,
    coverageGaps: [],
    grader: buildGrader({ deps }),
    publicBaseUrl: "http://test.local",
    chainId: 196,
  } as ServerContext & { store: Store };
}

const queueFor = (ctx: ServerContext & { store: Store }, concurrency = 2) =>
  new JobQueue({
    ctx: { ...ctx, packForClient: (pack) => packResult(ctx, pack) },
    concurrency,
    pollMs: 10,
  });

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/* -------------------------------------------------------------------- runs */

describe("a job runs the real pipeline and keeps the pack", () => {
  it("goes queued -> done, and the pack it names is really in the store", async () => {
    const ctx = makeCtx();
    const queue = queueFor(ctx);

    ctx.store.createJob({
      id: "job_1",
      tool: "oce_write_toast",
      args: { subject: "my sister Mara", details: "she taught me to drive, badly" },
      payerRef: "0xbuyer",
      priceUsdt: PRICES.oce_write_toast,
      orderId: "o_1",
    });

    expect(ctx.store.getJob("job_1")!.state).toBe("queued");

    queue.start();
    await queue.drain();
    queue.stop();

    const job = ctx.store.getJob("job_1")!;
    expect(job.state).toBe("done");
    expect(job.packId).toBeTruthy();
    expect(ctx.store.getPack(job.packId!)).toBeDefined();

    // The progress feed is the REAL run, not a decoration: the writer actually wrote.
    const types = job.progress.map((event) => (event.body as { type: string }).type);
    expect(types).toContain("run_started");
    expect(types).toContain("writing");
    expect(types).toContain("run_complete");

    // Delivered. Nothing is owed.
    expect(ctx.store.refundsOwed()).toHaveLength(0);
  });

  it("holds the line at max concurrency — the cost cap cannot slow down what already started", async () => {
    const ctx = makeCtx();
    let inFlight = 0;
    let peak = 0;

    // Count how many pipelines are inside the text model at the same moment.
    ctx.deps.text = new FakeTextModel(() => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      inFlight -= 1;
      return "## The toast\n\nTo Mara.\n\n## The short version\n\nTo Mara.\n\n## If you get emotional\n\nRaise it.";
    });
    ctx.grader = buildGrader({ deps: ctx.deps });

    for (let i = 0; i < 5; i += 1) {
      ctx.store.createJob({
        id: `job_c${i}`,
        tool: "oce_write_toast",
        args: { subject: "Mara", details: "she taught me to drive" },
        payerRef: "0xbuyer",
        priceUsdt: 0.02,
        orderId: `o_c${i}`,
      });
    }

    const queue = queueFor(ctx, 2);
    queue.start();
    await queue.drain();
    queue.stop();

    expect(peak).toBeLessThanOrEqual(2);
    for (let i = 0; i < 5; i += 1) expect(ctx.store.getJob(`job_c${i}`)!.state).toBe("done");
  });
});

/* --------------------------------------------------------- restart survival */

describe("a restart does not lose work somebody paid for", () => {
  it("requeues a job that was RUNNING when the process died, and finishes it", async () => {
    const ctx = makeCtx();

    ctx.store.createJob({
      id: "job_crash",
      tool: "oce_write_toast",
      args: { subject: "Mara", details: "she taught me to drive, badly" },
      payerRef: "0xbuyer",
      priceUsdt: 0.02,
      orderId: "o_crash",
    });

    // Simulate the crash: claimed, started, and then the process went away. The promise that
    // was driving it is gone; nothing in memory remembers this job exists.
    const claimed = ctx.store.claimJob()!;
    expect(claimed.state).toBe("running");

    // Boot.
    const queue = queueFor(ctx);
    const recovered = queue.start();
    expect(recovered.requeued).toEqual(["job_crash"]);

    await queue.drain();
    queue.stop();

    const job = ctx.store.getJob("job_crash")!;
    expect(job.state).toBe("done");
    expect(job.packId).toBeTruthy();
    expect(ctx.store.refundsOwed()).toHaveLength(0); // it was delivered in the end
  });

  it("abandons a job that has died TWICE, and books the refund — a poison brief cannot loop forever", () => {
    const ctx = makeCtx();

    ctx.store.createJob({
      id: "job_poison",
      tool: "oce_launch_kit",
      args: { productName: "Tidepool" },
      payerRef: "0xbuyer",
      priceUsdt: PRICES.oce_launch_kit,
      orderId: "o_poison",
    });

    ctx.store.claimJob(); // attempt 1 — crash
    ctx.store.recoverJobs(); // requeued
    ctx.store.claimJob(); // attempt 2 — crash again

    const queue = queueFor(ctx);
    const recovered = queue.start();
    queue.stop();

    expect(recovered.abandoned).toEqual(["job_poison"]);
    expect(ctx.store.getJob("job_poison")!.state).toBe("failed");

    // It was paid for and it delivered nothing. That is a debt, and it is written down.
    const owed = ctx.store.refundsOwed();
    expect(owed).toHaveLength(1);
    expect(owed[0]!.amountUsdt).toBe(PRICES.oce_launch_kit);
    expect(owed[0]!.payerRef).toBe("0xbuyer");
  });
});

/* ------------------------------------------------------------ cancellation */

describe("cancellation is honest about the money", () => {
  it("cancels a QUEUED job instantly and owes the full price back — nothing had been spent", () => {
    const ctx = makeCtx();

    ctx.store.createJob({
      id: "job_q",
      tool: "oce_launch_kit",
      args: { productName: "Tidepool" },
      payerRef: "0xbuyer",
      priceUsdt: 0.25,
      orderId: "o_q",
    });

    expect(ctx.store.requestCancel("job_q")).toBe("cancelled");
    expect(ctx.store.getJob("job_q")!.state).toBe("cancelled");
    // The queue must never pick it up afterwards.
    expect(ctx.store.claimJob()).toBeUndefined();
  });

  it("stops a RUNNING job at its next provider call — and does NOT pretend the money came back", async () => {
    const ctx = makeCtx();

    // Ask to cancel the moment the pipeline reaches the world. The worker sees it on the
    // next emit and unwinds.
    ctx.deps.text = new FakeTextModel(() => {
      ctx.store.requestCancel("job_x");
      return "## The toast\n\nTo Mara.\n\n## The short version\n\nTo Mara.\n\n## If you get emotional\n\nRaise it.";
    });
    ctx.grader = buildGrader({ deps: ctx.deps });

    ctx.store.createJob({
      id: "job_x",
      tool: "oce_write_toast",
      args: { subject: "Mara", details: "she taught me to drive" },
      payerRef: "0xbuyer",
      priceUsdt: 0.02,
      orderId: "o_x",
    });

    const queue = queueFor(ctx);
    queue.start();
    await queue.drain();
    queue.stop();

    expect(ctx.store.getJob("job_x")!.state).toBe("cancelled");
    // The providers were already paid. Saying otherwise would be a lie with a refund on it.
    expect(ctx.store.refundsOwed()).toHaveLength(0);
  });

  it("will not 'cancel' something that already finished", async () => {
    const ctx = makeCtx();
    ctx.store.createJob({
      id: "job_done",
      tool: "oce_write_toast",
      args: { subject: "Mara", details: "she drove badly" },
      payerRef: "0xbuyer",
      priceUsdt: 0.02,
    });

    const queue = queueFor(ctx);
    queue.start();
    await queue.drain();
    queue.stop();

    expect(ctx.store.requestCancel("job_done")).toBe("not_cancellable");
    expect(ctx.store.requestCancel("job_nope")).toBe("unknown");
  });
});

/* ------------------------------------------------------------ the money out */

describe("a job that fails books what it owes", () => {
  it("records the debt against the payer, and publishes it", async () => {
    const ctx = makeCtx({
      text: new FakeTextModel(() => {
        throw new Error("the writer fell over");
      }),
    });
    ctx.grader = buildGrader({ deps: ctx.deps });

    ctx.store.createJob({
      id: "job_boom",
      tool: "oce_write_toast",
      args: { subject: "Mara", details: "she taught me to drive" },
      payerRef: "0xbuyer",
      priceUsdt: 0.02,
      orderId: "o_boom",
    });

    const queue = queueFor(ctx);
    queue.start();
    await queue.drain();
    queue.stop();

    expect(ctx.store.getJob("job_boom")!.state).toBe("failed");

    const owed = ctx.store.refundsOwed();
    expect(owed).toHaveLength(1);
    expect(owed[0]!.amountUsdt).toBe(0.02);

    // It shows up on /stats — the number we would most like to hide is the one we publish.
    expect(ctx.store.stats().refundsOwed).toBe(1);
    expect(ctx.store.stats().refundsOwedUsdt).toBe(0.02);

    ctx.store.markRefunded("o_boom", "0xdeadbeef");
    expect(ctx.store.refundsOwed()).toHaveLength(0);
    expect(ctx.store.refundFor("o_boom")!.txHash).toBe("0xdeadbeef");
  });

  it("owes exactly one refund per order, however many times it is booked", () => {
    const ctx = makeCtx();
    for (let i = 0; i < 3; i += 1) {
      ctx.store.oweRefund({
        orderId: "o_same",
        payerRef: "0xbuyer",
        amountUsdt: 0.25,
        tool: "oce_launch_kit",
        reason: "the run failed",
      });
    }
    expect(ctx.store.refundsOwed()).toHaveLength(1);
  });

  it("never books a refund for a free run — a demo owes nobody anything", () => {
    const ctx = makeCtx();
    ctx.store.oweRefund({ orderId: "o_demo", payerRef: "demo", amountUsdt: 0, tool: "oce_write_toast", reason: "x" });
    ctx.store.oweRefund({ orderId: "o_dev", payerRef: "dev", amountUsdt: 0.05, tool: "oce_plan_occasion", reason: "x" });
    expect(ctx.store.refundsOwed()).toHaveLength(0);
  });
});

/* ------------------------------------------------------------- idempotency */

describe("idempotency: a retry is not a second bill", () => {
  it("replays the stored response instead of doing the work again", () => {
    const ctx = makeCtx();

    expect(ctx.store.claimIdempotencyKey("k1", "hash-a", "oce_launch_kit")).toEqual({ status: "fresh" });

    // A second, identical request arrives while the first is still running.
    expect(ctx.store.claimIdempotencyKey("k1", "hash-a", "oce_launch_kit")).toEqual({ status: "in_flight" });

    ctx.store.completeIdempotencyKey("k1", { status: 200, body: "the pack" });

    const claim = ctx.store.claimIdempotencyKey("k1", "hash-a", "oce_launch_kit");
    expect(claim.status).toBe("replay");
    expect((claim as { response: { body: string } }).response.body).toBe("the pack");
  });

  it("refuses a key reused for a DIFFERENT request", () => {
    const ctx = makeCtx();
    ctx.store.claimIdempotencyKey("k2", "hash-a", "oce_launch_kit");
    ctx.store.completeIdempotencyKey("k2", { body: "a" });

    // Replaying would answer a question nobody asked; running it would charge under an old
    // key. Neither is acceptable, so we refuse.
    expect(ctx.store.claimIdempotencyKey("k2", "hash-b", "oce_launch_kit")).toEqual({ status: "conflict" });
  });

  it("releases the key when the work never happened — an unpaid 402 must not burn it", () => {
    const ctx = makeCtx();
    ctx.store.claimIdempotencyKey("k3", "hash-a", "oce_launch_kit");
    ctx.store.releaseIdempotencyKey("k3");

    expect(ctx.store.claimIdempotencyKey("k3", "hash-a", "oce_launch_kit")).toEqual({ status: "fresh" });
  });

  it("never releases a COMPLETED key — the result is not retractable", () => {
    const ctx = makeCtx();
    ctx.store.claimIdempotencyKey("k4", "hash-a", "oce_launch_kit");
    ctx.store.completeIdempotencyKey("k4", { body: "done" });
    ctx.store.releaseIdempotencyKey("k4");

    expect(ctx.store.claimIdempotencyKey("k4", "hash-a", "oce_launch_kit").status).toBe("replay");
  });

  it("derives a key from the x402 nonce, so a plain retry is safe with no client change", () => {
    const proof = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        payload: { signature: "0xabc", authorization: { nonce: "0xNONCE" } },
      }),
    ).toString("base64");

    expect(paymentNonceOf({ "payment-signature": proof })).toBe("0xnonce");
    expect(paymentNonceOf({ "x-payment": proof })).toBe("0xnonce"); // legacy v1
    expect(paymentNonceOf({})).toBeUndefined();
    expect(paymentNonceOf({ "payment-signature": "not base64 json" })).toBeUndefined();
  });
});

/* ----------------------------------------------------------------- pricing */

describe("a job costs exactly what the tool it runs costs", () => {
  it("prices oce_create_pack_job from the tool inside it", () => {
    expect(priceOf("oce_create_pack_job", { tool: "oce_launch_kit" })).toBe(PRICES.oce_launch_kit);
    expect(priceOf("oce_create_pack_job", { tool: "oce_write_toast" })).toBe(PRICES.oce_write_toast);
  });

  it("refuses to run a tool that does not make a pack — you cannot job a verify", () => {
    expect(priceOf("oce_create_pack_job", { tool: "oce_verify_keepsake" })).toBeUndefined();
    expect(priceOf("oce_create_pack_job", { tool: "oce_job_status" })).toBeUndefined();
    expect(priceOf("oce_create_pack_job", {})).toBeUndefined();
  });

  it("watching a job is free, forever", () => {
    expect(PRICES.oce_job_status).toBe(0);
    expect(PRICES.oce_job_result).toBe(0);
    expect(PRICES.oce_cancel_job).toBe(0);
  });

  it("the tools a job may run are EXACTLY the pipelines that exist", () => {
    // Two lists, in two files, that must never drift: the paywall prices from one and the
    // worker dispatches from the other. A tool in one and not the other is either work we
    // charge for and cannot do, or work we do and cannot charge for.
    expect([...PACK_TOOLS].sort()).toEqual(Object.keys(PACK_PIPELINES).sort());
  });
});

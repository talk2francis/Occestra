/**
 * The consensus review lifecycle.
 *
 * The property these tests exist to defend is that a review is submitted to the chain AT MOST
 * ONCE. Everything else — retries, restarts, duplicate HTTP calls, a second worker — has to
 * resolve into resuming the existing transaction rather than opening a new one, because a
 * second submission would mean a second permanent public ruling for the same evidence, paid
 * for twice.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { GenLayerConfig } from "@occestra/genlayer";
import { readGenLayerConfig } from "@occestra/genlayer";
import { ConsensusWorker } from "../src/genlayer-worker.js";
import { Store } from "../src/store.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const CONFIG: GenLayerConfig = readGenLayerConfig({
  GENLAYER_NETWORK: "bradbury",
  GENLAYER_QUALITY_CONTRACT_ADDRESS: `0x${"b".repeat(40)}`,
  GENLAYER_SUBMITTER_PRIVATE_KEY: `0x${"a".repeat(64)}`, // guard:allow-fixture
} as NodeJS.ProcessEnv)!;

const ARTIFACT_HASH = `0x${"1".repeat(64)}`;
const REVIEW_ID = "oce_gl_lifecycle_0001";

const SNAPSHOT = {
  schemaVersion: "1",
  reviewId: REVIEW_ID,
  createdAt: "2026-09-03T10:00:00.000Z",
  artifactId: "art_thread",
  artifactHash: ARTIFACT_HASH,
  artifactKind: "launch_thread",
  profile: "written",
  oqsVersion: "1.2.0",
  localVerdict: "PASS",
  publicForConsensus: true,
  brief: { objective: "Announce it.", requiredElements: [], prohibitedElements: [] },
  rubric: { oqsVersion: "1.2.0", profile: "written", axisPassThreshold: 70, axes: [] },
  localTribunal: { verdict: "PASS", axes: {}, hardFailures: [], issues: [], repairs: 0 },
  artifact: { title: "Launch thread", format: "md", text: "copy" },
};

const ON_CHAIN = {
  reviewId: REVIEW_ID,
  evidenceUrl: `https://api.occestra.xyz/genlayer/evidence/${REVIEW_ID}`,
  artifactHash: ARTIFACT_HASH,
  profile: "written",
  oqsVersion: "1.2.0",
  localVerdict: "PASS",
  consensusDecision: "OVERTURNED",
  scoreBand: "50-69",
  criticalFailure: "FACTUAL_SUPPORT",
  failureCodes: ["FACTUAL_SUPPORT"],
  requester: `0x${"b".repeat(40)}`,
  createdAt: 1788422400,
};

function seed(overrides: Record<string, unknown> = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "occestra-glworker-"));
  dirs.push(dataDir);
  const store = new Store({ dataDir, urlSecret: "t", baseUrl: "http://test.local" });

  store.createConsensusReview({
    reviewId: REVIEW_ID,
    artifactId: "art_thread",
    keepsakeId: "pack_1",
    artifactHash: ARTIFACT_HASH,
    profile: "written",
    oqsVersion: "1.2.0",
    localVerdict: "PASS",
    evidenceJson: JSON.stringify(SNAPSHOT),
    evidenceHash: `0x${"2".repeat(64)}`,
    network: "genlayer-bradbury",
  } as Parameters<typeof store.createConsensusReview>[0]);

  if (Object.keys(overrides).length) {
    store.updateConsensusReview(REVIEW_ID, overrides as never);
  }
  return store;
}

function chain(opts: {
  submit?: () => Promise<{ transactionHash: string; status: string }>;
  status?: () => Promise<string | undefined>;
  read?: () => Promise<typeof ON_CHAIN>;
}) {
  return {
    submit: vi.fn(opts.submit ?? (async () => ({ transactionHash: "0xtx", status: "SUBMITTED" }))),
    status: vi.fn(opts.status ?? (async () => "FINALIZED")),
    read: vi.fn(opts.read ?? (async () => ON_CHAIN)),
  } as never;
}

function worker(store: Store, c: ReturnType<typeof chain>) {
  return new ConsensusWorker({ store, config: CONFIG, chain: c });
}

/** Submit on one pass, poll on the next — the worker never polls a tx it just sent. */
async function runToCompletion(store: Store, c: ReturnType<typeof chain>) {
  const w = worker(store, c);
  await w.tick();
  await w.tick();
}

describe("the happy path", () => {
  it("submits, then finalizes, and records what the chain actually said", async () => {
    const store = seed();
    const c = chain({});
    await runToCompletion(store, c);

    const after = store.consensusReview(REVIEW_ID)!;
    expect(after.status).toBe("FINALIZED");
    expect(after.decision).toBe("OVERTURNED");
    expect(after.scoreBand).toBe("50-69");
    expect(after.failureCodes).toEqual(["FACTUAL_SUPPORT"]);
    expect(after.transactionHash).toBe("0xtx");
    expect(after.finalizedAt).toBeTruthy();
  });

  it("records an upheld verdict", async () => {
    const store = seed();
    const c = chain({ read: async () => ({ ...ON_CHAIN, consensusDecision: "UPHELD", failureCodes: [] }) });
    await runToCompletion(store, c);
    expect(store.consensusReview(REVIEW_ID)!.decision).toBe("UPHELD");
  });

  it("records an undetermined verdict as a real ruling", async () => {
    const store = seed();
    const c = chain({ read: async () => ({ ...ON_CHAIN, consensusDecision: "UNDETERMINED" }) });
    await runToCompletion(store, c);
    const after = store.consensusReview(REVIEW_ID)!;
    expect(after.status).toBe("FINALIZED");
    expect(after.decision).toBe("UNDETERMINED");
  });

  it("submits without polling the transaction it just sent", async () => {
    const store = seed();
    const c = chain({});
    await worker(store, c).tick();

    expect(c.submit).toHaveBeenCalledTimes(1);
    expect(c.status).not.toHaveBeenCalled();
    expect(store.consensusReview(REVIEW_ID)!.status).toBe("SUBMITTED");
  });

  it("waits through the intermediate states without finalizing early", async () => {
    const store = seed({ status: "SUBMITTED", transactionHash: "0xtx" });
    const c = chain({ status: async () => "COMMITTING" });
    await worker(store, c).tick();

    const after = store.consensusReview(REVIEW_ID)!;
    expect(after.status).toBe("SUBMITTED");
    expect(after.decision).toBeUndefined();
    expect(c.read).not.toHaveBeenCalled();
  });
});

describe("submitted exactly once", () => {
  it("resumes polling from a stored transaction hash instead of resubmitting", async () => {
    // This is the restart case: the process died after the tx hash was written.
    const store = seed({ status: "SUBMITTED", transactionHash: "0xtx" });
    const c = chain({});
    await worker(store, c).tick();

    expect(c.submit).not.toHaveBeenCalled();
    expect(store.consensusReview(REVIEW_ID)!.status).toBe("FINALIZED");
  });

  it("resumes from ACCEPTED without resubmitting", async () => {
    const store = seed({ status: "ACCEPTED", transactionHash: "0xtx" });
    const c = chain({});
    await worker(store, c).tick();

    expect(c.submit).not.toHaveBeenCalled();
    expect(store.consensusReview(REVIEW_ID)!.status).toBe("FINALIZED");
  });

  it("does not submit twice when two workers run over the same row", async () => {
    const store = seed();
    const c = chain({ status: async () => "COMMITTING" });

    await worker(store, c).tick();
    await worker(store, c).tick();

    expect(c.submit).toHaveBeenCalledTimes(1);
  });

  it("refuses a second review under the same id at the storage layer", () => {
    const store = seed();
    expect(() =>
      store.createConsensusReview({
        reviewId: REVIEW_ID,
        artifactId: "art_thread",
        artifactHash: ARTIFACT_HASH,
        profile: "written",
        oqsVersion: "1.2.0",
        localVerdict: "PASS",
        evidenceJson: "{}",
        evidenceHash: `0x${"3".repeat(64)}`,
        network: "genlayer-bradbury",
      } as Parameters<typeof store.createConsensusReview>[0]),
    ).toThrow();
  });
});

describe("failure", () => {
  it("retries a transport failure with backoff rather than giving up", async () => {
    const store = seed();
    const c = chain({
      submit: async () => {
        throw new Error("socket hang up");
      },
    });
    await worker(store, c).tick();

    const after = store.consensusReview(REVIEW_ID)!;
    expect(after.status).toBe("QUEUED");
    expect(after.attempts).toBe(1);
    expect(after.nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it("holds off until the backoff expires", async () => {
    const store = seed();
    const c = chain({
      submit: async () => {
        throw new Error("socket hang up");
      },
    });
    await worker(store, c).tick();
    await worker(store, c).tick();

    // The second tick must not have hammered the RPC again.
    expect(c.submit).toHaveBeenCalledTimes(1);
  });

  it("treats a contract revert as terminal — retrying only burns gas", async () => {
    const store = seed();
    const c = chain({
      submit: async () => {
        throw new Error("execution reverted: Review already exists");
      },
    });
    await worker(store, c).tick();

    const after = store.consensusReview(REVIEW_ID)!;
    expect(after.status).toBe("FAILED");
    expect(after.errorCode).toBe("CONTRACT_REVERTED");
    expect(after.decision).toBeUndefined();
  });

  it("treats a consensus breakdown as FAILED, never as a verdict", async () => {
    const store = seed({ status: "SUBMITTED", transactionHash: "0xtx" });
    const c = chain({ status: async () => "UNDETERMINED" });
    await worker(store, c).tick();

    const after = store.consensusReview(REVIEW_ID)!;
    expect(after.status).toBe("FAILED");
    expect(after.errorCode).toBe("CONSENSUS_UNDETERMINED");
    // Crucially NOT decision=UNDETERMINED: nobody ruled anything.
    expect(after.decision).toBeUndefined();
  });

  it("treats a validator timeout as terminal", async () => {
    const store = seed({ status: "SUBMITTED", transactionHash: "0xtx" });
    const c = chain({ status: async () => "VALIDATORS_TIMEOUT" });
    await worker(store, c).tick();
    expect(store.consensusReview(REVIEW_ID)!.status).toBe("FAILED");
  });

  it("refuses to submit when the frozen evidence disagrees with the row", async () => {
    const store = seed();
    // Simulates the one thing that should be impossible: a row whose immutable columns no
    // longer match the snapshot validators would read.
    const tampered = { ...SNAPSHOT, artifactHash: `0x${"9".repeat(64)}` };
    const dataDir = mkdtempSync(join(tmpdir(), "occestra-glworker-t-"));
    dirs.push(dataDir);
    const s2 = new Store({ dataDir, urlSecret: "t", baseUrl: "http://test.local" });
    s2.createConsensusReview({
      reviewId: REVIEW_ID,
      artifactId: "art_thread",
      artifactHash: ARTIFACT_HASH,
      profile: "written",
      oqsVersion: "1.2.0",
      localVerdict: "PASS",
      evidenceJson: JSON.stringify(tampered),
      evidenceHash: `0x${"2".repeat(64)}`,
      network: "genlayer-bradbury",
    } as Parameters<typeof s2.createConsensusReview>[0]);

    const c = chain({});
    await worker(s2, c).tick();

    expect(c.submit).not.toHaveBeenCalled();
    expect(s2.consensusReview(REVIEW_ID)!.errorCode).toBe("EVIDENCE_MISMATCH");
    void store;
  });

  it("gives up after a bounded number of attempts", async () => {
    const store = seed();
    const c = chain({
      submit: async () => {
        throw new Error("socket hang up");
      },
    });
    const w = worker(store, c);
    for (let i = 0; i < 8; i += 1) {
      // Clear the backoff so this converges without waiting minutes.
      store.updateConsensusReview(REVIEW_ID, {} as never);
      (store as unknown as { db: { prepare: (q: string) => { run: (...a: unknown[]) => void } } }).db
        .prepare("UPDATE consensus_reviews SET next_attempt_at = 0 WHERE review_id = ?")
        .run(REVIEW_ID);
      await w.tick();
    }
    expect(store.consensusReview(REVIEW_ID)!.status).toBe("FAILED");
  });
});

describe("reading the chain's status", () => {
  it("acts on statusName, not the numeric status enum", async () => {
    // The SDK returns both: status is a number, statusName is the string this maps against.
    // Reading the number made everything look like SUBMITTED, so a consensus breakdown polled
    // forever instead of terminating. This asserts the shape the worker actually consumes.
    const store = seed({ status: "SUBMITTED", transactionHash: "0xtx" });
    const c = chain({ status: async () => "UNDETERMINED" });
    await worker(store, c).tick();
    expect(store.consensusReview(REVIEW_ID)!.status).toBe("FAILED");

    const numeric = seed({ status: "SUBMITTED", transactionHash: "0xtx" });
    // A numeric status must never be silently treated as progress.
    const cNum = chain({ status: async () => String(6) });
    await worker(numeric, cNum).tick();
    // "6" is not a name we recognise, so it stays pending rather than being read as a verdict.
    expect(numeric.consensusReview(REVIEW_ID)!.decision).toBeUndefined();
  });
});

describe("recording a verdict as soon as it exists", () => {
  it("stores the ruling at ACCEPTED, without claiming finality", async () => {
    // The contract's state is readable once validators agree. On Bradbury finality trails by
    // a long way, and waiting for it before recording anything left a decided review showing
    // as pending for hours.
    const store = seed({ status: "SUBMITTED", transactionHash: "0xtx" });
    const c = chain({ status: async () => "ACCEPTED" });
    await worker(store, c).tick();

    const after = store.consensusReview(REVIEW_ID)!;
    expect(after.status).toBe("ACCEPTED");
    expect(after.decision).toBe("OVERTURNED");
    expect(after.failureCodes).toEqual(["FACTUAL_SUPPORT"]);
    // Not finalized, and it does not pretend to be.
    expect(after.finalizedAt).toBeUndefined();
  });

  it("stamps finalizedAt only at FINALIZED", async () => {
    const store = seed({ status: "ACCEPTED", transactionHash: "0xtx" });
    const c = chain({ status: async () => "FINALIZED" });
    await worker(store, c).tick();

    const after = store.consensusReview(REVIEW_ID)!;
    expect(after.status).toBe("FINALIZED");
    expect(after.finalizedAt).toBeTruthy();
  });
});

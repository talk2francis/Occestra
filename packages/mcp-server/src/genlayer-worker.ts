/**
 * Driving consensus reviews to finality.
 *
 * This deliberately does NOT run on the pack JobQueue, and the reason is worth stating because
 * it looks like duplication. That queue's recovery model requeues and RE-RUNS anything that
 * was mid-flight when the process died — correct there, because the buyer paid and eating our
 * own provider spend twice is the right way round. Here it would be a bug with money attached:
 * re-running a SUBMITTED review would put a second transaction on chain for a review that is
 * already being adjudicated.
 *
 * So the state machine lives in the consensus_reviews table, which is durable for the same
 * reason the jobs table is, and the transaction hash is the record of what actually happened.
 * A restart resumes polling. It never resubmits.
 *
 *   QUEUED -> SUBMITTED -> ACCEPTED -> FINALIZED
 *                  \\           \\
 *                   `----------- `--> FAILED (terminal)
 */
import {
  GenLayerSubmissionError,
  getConsensusReview,
  isTerminalFailure,
  networkLabel,
  normalizeTransactionStatus,
  submitConsensusReview,
  toConsensusOutcome,
  type EvidenceSnapshot,
  type GenLayerConfig,
} from "@occestra/genlayer";
import { evidenceUrlFor } from "@occestra/genlayer";
import type { ConsensusReviewRow, Store } from "./store.js";

/** Transport hiccups are worth retrying; a revert is not. */
const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 15_000;

export interface ConsensusWorkerConfig {
  store: Store;
  config: GenLayerConfig;
  pollMs?: number;
  evidenceOrigin?: string;
  log?: (message: string, detail?: unknown) => void;
  /** Injected in tests. Defaults to the real chain calls. */
  chain?: {
    submit: typeof submitConsensusReview;
    status: (config: GenLayerConfig, hash: string) => Promise<string | undefined>;
    read: typeof getConsensusReview;
  };
}

export class ConsensusWorker {
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(private readonly cfg: ConsensusWorkerConfig) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.cfg.pollMs ?? 10_000);
    this.timer.unref?.();
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One full pass. Exposed so tests can drive it deterministically. */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const review of this.cfg.store.actionableConsensusReviews()) {
        await this.advance(review);
      }
    } finally {
      this.busy = false;
    }
  }

  private get chain() {
    return (
      this.cfg.chain ?? {
        submit: submitConsensusReview,
        status: async (config: GenLayerConfig, hash: string) => {
          const { createReadClient } = await import("@occestra/genlayer");
          const tx = await createReadClient(config).getTransaction({ hash: hash as never });
          // `status` is the NUMERIC enum; `statusName` is the string the mapping compares
          // against. Reading the number made every state fall through to SUBMITTED, so a
          // review whose validators disagreed would have polled forever instead of failing.
          // Only running it against the chain surfaced this.
          const raw = tx as { status?: number | string; statusName?: string } | undefined;
          return raw?.statusName ?? (typeof raw?.status === "string" ? raw.status : undefined);
        },
        read: getConsensusReview,
      }
    );
  }

  private async advance(review: ConsensusReviewRow): Promise<void> {
    try {
      // Resumption before submission, always. A stored transaction hash means this review is
      // already on chain, whatever our status column says — a crash between the write and the
      // status update must not become a duplicate ruling.
      if (review.transactionHash) {
        await this.poll(review);
        return;
      }
      if (review.status === "QUEUED") {
        await this.submit(review);
      }
    } catch (error) {
      this.retryOrFail(review, error);
    }
  }

  private async submit(review: ConsensusReviewRow): Promise<void> {
    const snapshot = JSON.parse(review.evidenceJson) as EvidenceSnapshot;

    // Re-verify identity against the frozen snapshot rather than trusting our own columns.
    // If these ever disagree, something rewrote a row that is supposed to be immutable, and
    // submitting anyway would ask validators to rule on a mismatch.
    if (
      snapshot.artifactHash !== review.artifactHash ||
      snapshot.profile !== review.profile ||
      snapshot.oqsVersion !== review.oqsVersion ||
      snapshot.localVerdict !== review.localVerdict ||
      snapshot.publicForConsensus !== true
    ) {
      this.fail(review, "EVIDENCE_MISMATCH");
      return;
    }

    const { transactionHash } = await this.chain.submit(
      this.cfg.config,
      snapshot,
      evidenceUrlFor(review.reviewId, this.cfg.evidenceOrigin),
    );

    // Written before anything else can fail, so a crash here still leaves us able to resume
    // rather than resubmit.
    this.cfg.store.updateConsensusReview(review.reviewId, {
      transactionHash,
      status: "SUBMITTED",
      submittedAt: new Date().toISOString(),
      ...(this.cfg.config.contractAddress
        ? { contractAddress: this.cfg.config.contractAddress }
        : {}),
    });
  }

  private async poll(review: ConsensusReviewRow): Promise<void> {
    const raw = await this.chain.status(this.cfg.config, review.transactionHash!);

    if (isTerminalFailure(raw)) {
      // Includes the chain's own UNDETERMINED, which means consensus broke down. That is an
      // unavailable review, never a validator ruling of UNDETERMINED.
      this.fail(review, `CONSENSUS_${raw}`);
      return;
    }

    const status = normalizeTransactionStatus(raw);
    if (status !== "FINALIZED") {
      if (status !== review.status) {
        this.cfg.store.updateConsensusReview(review.reviewId, { status });
      }
      // Not an error — just not there yet. Backoff keeps us off the RPC.
      this.cfg.store.backoffConsensusReview(review.reviewId, Date.now() + BASE_BACKOFF_MS);
      return;
    }

    const onChain = await this.chain.read(this.cfg.config, review.reviewId);
    const outcome = toConsensusOutcome(onChain);

    this.cfg.store.updateConsensusReview(review.reviewId, {
      status: "FINALIZED",
      decision: outcome.decision,
      scoreBand: outcome.scoreBand,
      ...(outcome.criticalFailure ? { criticalFailure: outcome.criticalFailure } : {}),
      failureCodes: outcome.failureCodes,
      finalizedAt: new Date().toISOString(),
    });
  }

  private fail(review: ConsensusReviewRow, code: string): void {
    this.cfg.store.updateConsensusReview(review.reviewId, { status: "FAILED", errorCode: code });
  }

  /**
   * Decides whether an error is worth another go.
   *
   * A contract revert is the contract telling us no — retrying only burns gas. Transport
   * failures get a bounded, widening backoff. Either way the caller sees a code; the detail
   * goes to the log, because wallet and RPC errors carry endpoints and nonces in their text.
   */
  private retryOrFail(review: ConsensusReviewRow, error: unknown): void {
    this.cfg.log?.(`consensus review ${review.reviewId} attempt failed`, error);

    const message = error instanceof Error ? error.message : String(error);
    const reverted = /revert|already exists|UserError/i.test(message);
    const code = error instanceof GenLayerSubmissionError ? error.code : "REVIEW_FAILED";

    if (reverted || review.attempts + 1 >= MAX_ATTEMPTS) {
      this.fail(review, reverted ? "CONTRACT_REVERTED" : code);
      return;
    }
    this.cfg.store.backoffConsensusReview(
      review.reviewId,
      Date.now() + BASE_BACKOFF_MS * 2 ** review.attempts,
    );
  }
}

export { networkLabel };

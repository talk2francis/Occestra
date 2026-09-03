/**
 * The review lifecycle against the Intelligent Contract.
 *
 * The delicate part here is mapping GenLayer's transaction status onto Occestra's review
 * status, because the two vocabularies overlap misleadingly. GenLayer has a transaction
 * status called UNDETERMINED that means "the validators could not agree"; Occestra has a
 * consensus decision called UNDETERMINED that means "the validators agreed the evidence does
 * not support a ruling". Those are opposite kinds of fact. One is a broken review, the other
 * is a real verdict, and letting the first display as the second would be a lie told by a
 * type coercion. They are kept apart deliberately below.
 */
import {
  OnChainReviewSchema,
  normalizeFailureCodes,
  type ConsensusDecision,
  type ConsensusStatus,
  type EvidenceSnapshot,
  type FailureCode,
  type OnChainReview,
  type ScoreBand,
} from "./schemas.js";
import type { TransactionHash, TransactionStatus } from "genlayer-js/types";
import type { GenLayerConfig } from "./config.js";
import { createReadClient, createWriteClient, type GenLayerReadClient } from "./client.js";

export class GenLayerSubmissionError extends Error {
  /** A sanitized code safe to show a buyer. The raw cause stays in logs. */
  readonly code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/** Terminal GenLayer statuses: retrying these only burns gas. */
const TERMINAL_FAILURES = new Set([
  "CANCELED",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
  "UNDETERMINED",
]);

/**
 * GenLayer transaction status -> Occestra review status.
 *
 * Note UNDETERMINED landing in FAILED. On-chain it means consensus broke down, so there is no
 * verdict to show; a review in that state must read as "unavailable", never as a ruling.
 */
export function normalizeTransactionStatus(status: string | undefined): ConsensusStatus {
  switch (status) {
    case "FINALIZED":
      return "FINALIZED";
    case "ACCEPTED":
    case "READY_TO_FINALIZE":
      return "ACCEPTED";
    case "PENDING":
    case "PROPOSING":
    case "COMMITTING":
    case "REVEALING":
    case "APPEAL_COMMITTING":
    case "APPEAL_REVEALING":
    case "UNINITIALIZED":
      return "SUBMITTED";
    case "CANCELED":
    case "VALIDATORS_TIMEOUT":
    case "LEADER_TIMEOUT":
    case "UNDETERMINED":
      return "FAILED";
    default:
      return "SUBMITTED";
  }
}

export function isTerminalFailure(status: string | undefined): boolean {
  return status !== undefined && TERMINAL_FAILURES.has(status);
}

export interface SubmitResult {
  transactionHash: string;
  status: ConsensusStatus;
}

/**
 * Submits one review.
 *
 * Idempotency lives in the contract, not here: `request_review` rejects a duplicate reviewId,
 * so a retried job cannot create a second on-chain ruling for the same evidence. The worker
 * still resumes from a stored transaction hash rather than calling this again.
 */
export async function submitConsensusReview(
  config: GenLayerConfig,
  snapshot: EvidenceSnapshot,
  evidenceUrl: string,
): Promise<SubmitResult> {
  if (!config.contractAddress) {
    throw new GenLayerSubmissionError(
      "CONTRACT_NOT_DEPLOYED",
      "GENLAYER_QUALITY_CONTRACT_ADDRESS is not set",
    );
  }

  const client = createWriteClient(config);
  try {
    const transactionHash = await client.writeContract({
      address: config.contractAddress,
      functionName: "request_review",
      args: [
        snapshot.reviewId,
        evidenceUrl,
        snapshot.artifactHash,
        snapshot.profile,
        snapshot.oqsVersion,
        snapshot.localVerdict,
        BigInt(Math.floor(new Date(snapshot.createdAt).getTime() / 1000)),
      ],
      value: 0n,
    });
    return { transactionHash: String(transactionHash), status: "SUBMITTED" };
  } catch (cause) {
    // Wallet and RPC errors carry endpoints, nonces and sometimes key material in their
    // messages. The caller gets a code; the detail goes to the log.
    throw new GenLayerSubmissionError("SUBMIT_FAILED", "could not submit the consensus review", {
      cause,
    });
  }
}

async function waitFor(
  config: GenLayerConfig,
  transactionHash: string,
  status: "ACCEPTED" | "FINALIZED",
  options: { interval?: number; retries?: number } = {},
) {
  const client = createReadClient(config);
  return client.waitForTransactionReceipt({
    // `TransactionHash` is branded with `{ length: 66 }`, which no runtime string can prove.
    hash: transactionHash as TransactionHash,
    status: status as TransactionStatus,
    ...(options.interval === undefined ? {} : { interval: options.interval }),
    ...(options.retries === undefined ? {} : { retries: options.retries }),
  });
}

export function waitForConsensusAccepted(
  config: GenLayerConfig,
  transactionHash: string,
  options?: { interval?: number; retries?: number },
) {
  return waitFor(config, transactionHash, "ACCEPTED", options);
}

export function waitForConsensusFinalized(
  config: GenLayerConfig,
  transactionHash: string,
  options?: { interval?: number; retries?: number },
) {
  return waitFor(config, transactionHash, "FINALIZED", options);
}

export interface ConsensusOutcome {
  decision: ConsensusDecision;
  scoreBand: ScoreBand;
  criticalFailure?: string;
  failureCodes: FailureCode[];
}

const DECISIONS = new Set(["UPHELD", "OVERTURNED", "UNDETERMINED"]);
const BANDS = new Set(["0-49", "50-69", "70-84", "85-100", "UNKNOWN"]);

/**
 * Reads a finalized review back off the chain.
 *
 * What the contract says is what Occestra shows. Anything unrecognisable becomes UNDETERMINED
 * rather than being coerced towards a verdict — the one direction this must never fail is
 * towards claiming an artifact passed independent review when it did not.
 */
export function toConsensusOutcome(review: OnChainReview): ConsensusOutcome {
  const decision = DECISIONS.has(review.consensusDecision)
    ? (review.consensusDecision as ConsensusDecision)
    : "UNDETERMINED";
  const scoreBand = BANDS.has(review.scoreBand) ? (review.scoreBand as ScoreBand) : "UNKNOWN";
  const criticalFailure = review.criticalFailure?.trim().toUpperCase();

  return {
    decision,
    scoreBand,
    ...(criticalFailure ? { criticalFailure } : {}),
    failureCodes: normalizeFailureCodes(review.failureCodes ?? []),
  };
}

/** Fetches the contract's stored review. Read-only: no submitter key needed. */
export async function getConsensusReview(
  config: GenLayerConfig,
  reviewId: string,
  client?: GenLayerReadClient,
): Promise<OnChainReview> {
  if (!config.contractAddress) {
    throw new GenLayerSubmissionError(
      "CONTRACT_NOT_DEPLOYED",
      "GENLAYER_QUALITY_CONTRACT_ADDRESS is not set",
    );
  }
  const reader = client ?? createReadClient(config);
  const raw = await reader.readContract({
    address: config.contractAddress,
    functionName: "get_review",
    args: [reviewId],
  });
  return OnChainReviewSchema.parse(raw);
}

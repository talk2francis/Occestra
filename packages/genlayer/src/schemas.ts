/**
 * The consensus vocabulary.
 *
 * Everything crossing a boundary here — the frozen evidence a validator fetches, the review
 * row we persist, the status a page renders — is parsed, never trusted. The evidence schema in
 * particular is `.strict()`: an unexpected key is a bug worth failing on, because the failure
 * mode being guarded against is a private field arriving in a snapshot that is about to be
 * published on a public chain forever.
 */
import { z } from "zod";

/** What the validators decided about Occestra's own verdict. */
export const ConsensusDecisionSchema = z.enum(["UPHELD", "OVERTURNED", "UNDETERMINED"]);
export type ConsensusDecision = z.infer<typeof ConsensusDecisionSchema>;

/**
 * Where a review is in its life.
 *
 * Distinct from GenLayer's transaction status, which this deliberately does not mirror:
 * the chain has its own UNDETERMINED meaning "validators could not agree", which is a
 * FAILED review here, not a validator ruling of UNDETERMINED. Collapsing the two would let
 * a consensus breakdown display as a real verdict.
 */
export const ConsensusStatusSchema = z.enum([
  "NOT_REQUESTED",
  "QUEUED",
  "SUBMITTED",
  "ACCEPTED",
  "FINALIZED",
  "FAILED",
]);
export type ConsensusStatus = z.infer<typeof ConsensusStatusSchema>;

/** OQS grading profiles, matching @occestra/tribunal's ProfileId exactly. */
export const ConsensusProfileSchema = z.enum(["visual", "written", "plan", "pack"]);
export type ConsensusProfile = z.infer<typeof ConsensusProfileSchema>;

export const LocalVerdictSchema = z.enum(["PASS", "FAIL"]);
export type LocalVerdict = z.infer<typeof LocalVerdictSchema>;

export const ScoreBandSchema = z.enum(["0-49", "50-69", "70-84", "85-100", "UNKNOWN"]);
export type ScoreBand = z.infer<typeof ScoreBandSchema>;

const Hex32 = z.string().regex(/^0x[0-9a-f]{64}$/, "expected a 32-byte lowercase hex hash");
const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected a 20-byte address");
const Iso = z.string().datetime();

export const EVIDENCE_SCHEMA_VERSION = "1";

/**
 * The only Occestra data a GenLayer validator ever sees.
 *
 * This is a purpose-built redaction, not a serialized OccasionContract. Everything a validator
 * needs to answer "is this verdict supported?" is here; nothing else is. There is no owner
 * token, no signed URL, no storage key, no email, no salt, no payment signature and no
 * original upload — and `.strict()` means a future field cannot drift in unnoticed.
 */
export const EvidenceSnapshotSchema = z
  .object({
    schemaVersion: z.literal(EVIDENCE_SCHEMA_VERSION),
    reviewId: z.string().min(8),
    createdAt: Iso,

    artifactId: z.string().min(1),
    artifactHash: Hex32,
    artifactKind: z.string().min(1),
    profile: ConsensusProfileSchema,
    oqsVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    localVerdict: LocalVerdictSchema,

    /**
     * Always literally true. A snapshot for a non-public artifact is not a snapshot with a
     * false flag — it must never have been built, so the type cannot express one.
     */
    publicForConsensus: z.literal(true),

    /** What was asked for, so a validator can judge fit rather than taste. */
    brief: z
      .object({
        objective: z.string(),
        requiredElements: z.array(z.string()),
        prohibitedElements: z.array(z.string()),
      })
      .strict(),

    /** The rubric travels with the evidence so a review stays reproducible after OQS moves on. */
    rubric: z
      .object({
        oqsVersion: z.string(),
        profile: ConsensusProfileSchema,
        axisPassThreshold: z.number(),
        axes: z.array(
          z.object({ id: z.string(), label: z.string(), description: z.string() }).strict(),
        ),
      })
      .strict(),

    /** Occestra's own grade — the thing under appeal. */
    localTribunal: z
      .object({
        verdict: LocalVerdictSchema,
        axes: z.record(z.string(), z.number()),
        hardFailures: z.array(z.string()),
        issues: z.array(z.string()),
        repairs: z.number().int().min(0),
        /**
         * False when the model critic could not be reached, so this verdict rests on the
         * deterministic checks alone. Validators MUST be told: a PASS graded without a critic
         * is a much weaker claim than one graded with it, and hiding that would ask them to
         * adjudicate a confidence Occestra never actually had.
         */
        criticAvailable: z.boolean(),
        /** What the Tribunal could not check, in its own words. */
        coverageGaps: z.array(z.string()),
      })
      .strict(),

    /** Frozen public content. Text inline; images by immutable consensus URL only. */
    artifact: z
      .object({
        title: z.string(),
        format: z.string(),
        text: z.string().optional(),
      })
      .strict(),

    /** Set for visual profiles: the immutable public asset a validator renders. */
    artifactUrl: z.string().url().optional(),
  })
  .strict();
export type EvidenceSnapshot = z.infer<typeof EvidenceSnapshotSchema>;

/** What the Intelligent Contract stores and `get_review` returns. */
export const OnChainReviewSchema = z
  .object({
    reviewId: z.string(),
    evidenceUrl: z.string(),
    artifactHash: z.string(),
    profile: z.string(),
    oqsVersion: z.string(),
    localVerdict: z.string(),
    consensusDecision: z.string(),
    scoreBand: z.string(),
    criticalFailure: z.string(),
    failureCodes: z.array(z.string()),
    requester: z.string(),
    createdAt: z.number(),
  })
  .passthrough();
export type OnChainReview = z.infer<typeof OnChainReviewSchema>;

/** Occestra's row for one review, spanning its whole life. */
export const ConsensusReviewSchema = z
  .object({
    reviewId: z.string().min(8),
    artifactId: z.string().min(1),
    keepsakeId: z.string().optional(),
    artifactHash: Hex32,
    profile: ConsensusProfileSchema,
    oqsVersion: z.string(),
    localVerdict: LocalVerdictSchema,

    evidenceHash: Hex32,
    evidenceUrl: z.string().url(),
    publicForConsensus: z.literal(true),

    network: z.string(),
    intelligentContractAddress: Address.optional(),
    transactionHash: z.string().optional(),

    status: ConsensusStatusSchema,
    decision: ConsensusDecisionSchema.optional(),
    scoreBand: ScoreBandSchema.optional(),
    criticalFailure: z.string().optional(),
    failureCodes: z.array(z.string()),

    submittedAt: Iso.optional(),
    finalizedAt: Iso.optional(),
    /** A sanitized code. Raw provider/wallet errors stay in the logs. */
    errorCode: z.string().optional(),
  })
  .strict();
export type ConsensusReview = z.infer<typeof ConsensusReviewSchema>;

/**
 * Normalized failure codes.
 *
 * Only these may reach the repair loop. Validator prose never does — a model that can write
 * arbitrary text into a regeneration brief is a prompt-injection path straight through the
 * consensus layer into Occestra's own generator.
 */
export const FAILURE_CODES = [
  "LEGIBILITY",
  "COMPOSITION",
  "BRIEF_MISMATCH",
  "SUBJECT_FIDELITY",
  "STYLE_DRIFT",
  "FACTUAL_SUPPORT",
  "SOURCE_COVERAGE",
  "SCHEDULE_CONFLICT",
  "BUDGET_INCONSISTENCY",
  "PACK_INCOMPLETE",
  "ARTIFACT_UNAVAILABLE",
  "INVALID_VALIDATOR_OUTPUT",
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

const KNOWN = new Set<string>(FAILURE_CODES);

/**
 * Keeps only codes the repair loop actually understands.
 *
 * An unrecognised code is dropped rather than passed along: it cannot drive a repair, and
 * letting it through would mean model-authored strings reaching code that dispatches on them.
 */
export function normalizeFailureCodes(codes: readonly string[]): FailureCode[] {
  const seen = new Set<FailureCode>();
  for (const code of codes) {
    const upper = code.trim().toUpperCase();
    if (KNOWN.has(upper)) seen.add(upper as FailureCode);
  }
  return [...seen].sort();
}

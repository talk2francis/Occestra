/**
 * Preparing an artifact for independent review.
 *
 * This is the gate between Occestra's private world and a public chain. Everything downstream
 * of it — the evidence endpoint, the submission job, the validators — trusts that whatever
 * reaches it was allowed out. So the checks live here, before a snapshot exists at all, and
 * they refuse rather than sanitize: an artifact that should not be reviewed does not get a
 * redacted review, it gets no review.
 *
 * The server builds the evidence itself, from the stored artifact, the stored Tribunal report
 * and the live rubric. It never accepts an evidence document from a caller — a client that
 * could hand us the evidence could hand us a flattering description of work we never made.
 */
import { keccak256, toBytes } from "viem";
import type { Artifact, Pack } from "@occestra/studio-core";
import {
  AXIS_PASS_THRESHOLD,
  OQS_VERSION,
  PROFILES,
  gradingProfile,
  type TribunalReport,
} from "@occestra/tribunal";
import {
  buildEvidenceSnapshot,
  artifactUrlFor,
  evidenceUrlFor,
  hashEvidenceSnapshot,
  serializeEvidenceSnapshot,
  type ConsensusProfile,
  type EvidenceSnapshot,
  type LocalVerdict,
} from "@occestra/genlayer";
import type { Store } from "./store.js";

/** Why an artifact may not be reviewed. The message is safe to show a caller. */
export class ConsensusRefused extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const VISUAL_FORMATS = new Set(["png", "svg"]);

export interface PrepareInputs {
  pack: Pack;
  artifact: Artifact;
  /** The owner's explicit, recorded decision — never inferred from "it looks public". */
  consented: boolean;
  reviewId: string;
  now?: Date;
  network: string;
  contractAddress?: string;
  evidenceOrigin?: string;
  artifactOrigin?: string;
}

export interface PreparedReview {
  snapshot: EvidenceSnapshot;
  evidenceJson: string;
  evidenceHash: `0x${string}`;
  evidenceUrl: string;
}

function reportOf(artifact: Artifact): TribunalReport {
  const report = artifact.tribunal as TribunalReport | undefined;
  if (!report || typeof report !== "object") {
    throw new ConsensusRefused(
      "NO_TRIBUNAL_REPORT",
      "this artifact has not been graded, so there is no verdict to appeal",
    );
  }
  return report;
}

/**
 * Freezes an artifact into an evidence snapshot, or refuses.
 *
 * The order matters: consent and privacy are checked before any content is read, so a private
 * artifact is never even marshalled into a shape that could be written somewhere by accident.
 */
export async function prepareConsensusReview(
  store: Store,
  inputs: PrepareInputs,
): Promise<PreparedReview> {
  const { pack, artifact } = inputs;

  // 1. Consent, first, before anything is read.
  if (!inputs.consented) {
    throw new ConsensusRefused(
      "NOT_CONSENTED",
      "independent review publishes a public evidence snapshot and needs explicit approval",
    );
  }

  // 2. A private pack is out of scope even with consent recorded elsewhere. Remember uploads
  //    are private by default and this feature is not the exception that changes that.
  if (store.isPrivate(pack.id)) {
    throw new ConsensusRefused(
      "PRIVATE_PACK",
      "this keepsake is private; publish it before requesting independent review",
    );
  }

  if (artifact.undelivered) {
    throw new ConsensusRefused(
      "ARTIFACT_UNDELIVERED",
      "this artifact was never produced, so there is nothing to review",
    );
  }

  const report = reportOf(artifact);

  // 3. The profile the Tribunal actually graded under, not one we pick now.
  const profile = (report.profile || gradingProfile(artifact.kind, artifact.format).id) as
    | ConsensusProfile
    | undefined;
  if (!profile || !(profile in PROFILES)) {
    throw new ConsensusRefused("UNSUPPORTED_PROFILE", `cannot adjudicate profile "${profile}"`);
  }

  const localVerdict: LocalVerdict = report.pass ? "PASS" : "FAIL";
  const isVisual = VISUAL_FORMATS.has(artifact.format);

  // 4. Hash the artifact's ACTUAL bytes. A hash taken from anywhere else would let the
  //    snapshot claim identity over content it never saw.
  let bytes: Uint8Array | undefined;
  let artifactText: string | undefined;

  if (isVisual) {
    if (!artifact.uri) {
      throw new ConsensusRefused("ARTIFACT_MISSING", "this visual artifact has no stored bytes");
    }
    const stored = await store.storage.get(artifact.uri);
    if (!stored) {
      throw new ConsensusRefused("ARTIFACT_MISSING", "the stored bytes for this artifact are gone");
    }
    bytes = stored.bytes;
  } else {
    if (artifact.data === undefined) {
      throw new ConsensusRefused("ARTIFACT_MISSING", "this artifact has no content to review");
    }
    artifactText = artifact.data;
    bytes = toBytes(artifact.data);
  }

  if (!bytes) {
    throw new ConsensusRefused("ARTIFACT_MISSING", "this artifact has no content to review");
  }
  const artifactHash = keccak256(bytes);

  // 5. Freeze the public copy a validator will render, so a later repair cannot change what
  //    was judged out from under the review.
  let artifactUrl: string | undefined;
  if (isVisual) {
    store.putConsensusArtifact(inputs.reviewId, bytes);
    artifactUrl = artifactUrlFor(inputs.reviewId, inputs.artifactOrigin);
  }

  const rubricProfile = PROFILES[profile];
  const snapshot = buildEvidenceSnapshot({
    reviewId: inputs.reviewId,
    createdAt: inputs.now ?? new Date(),
    artifactId: artifact.id,
    artifactHash,
    artifactKind: artifact.kind,
    artifactTitle: artifact.title,
    artifactFormat: artifact.format,
    profile,
    ...(artifactText === undefined ? {} : { artifactText }),
    ...(artifactUrl === undefined ? {} : { artifactUrl }),
    oqsVersion: report.oqsVersion || OQS_VERSION,
    localVerdict,
    axisPassThreshold: AXIS_PASS_THRESHOLD,
    rubricAxes: rubricProfile.axes.map((axis) => ({
      id: axis.id,
      label: axis.title,
      description: axis.description,
    })),
    brief: { objective: artifact.title },
    tribunal: {
      ...(report.axes ? { axes: report.axes as Record<string, number> } : {}),
      hardFailures: report.deterministic.filter((c) => c.hard && !c.passed).map((c) => c.id),
      issues: report.issues,
      repairs: report.repairs,
      coverageGaps: report.coverageGaps,
    },
    publicForConsensus: true,
  });

  return {
    snapshot,
    evidenceJson: serializeEvidenceSnapshot(snapshot),
    evidenceHash: hashEvidenceSnapshot(snapshot),
    evidenceUrl: evidenceUrlFor(inputs.reviewId, inputs.evidenceOrigin),
  };
}

/**
 * Building the frozen evidence snapshot.
 *
 * This is the privacy boundary of the whole feature. Whatever this function returns gets
 * published at a public URL and read by independent validators on a public chain, and it can
 * never be unpublished. So it is built by naming every field that goes in, one at a time,
 * from typed inputs — never by copying an object and deleting what looks sensitive. A
 * denylist fails silently the first time someone adds a field; an allowlist fails loudly.
 *
 * The hash uses studio-core's `canonicalJson`, the same discipline as the manifest hashes
 * anchored on X Layer, so an evidence hash is reproducible by anyone holding the snapshot.
 */
import { canonicalJson } from "@occestra/studio-core";
import { keccak256, toBytes } from "viem";
import {
  EVIDENCE_SCHEMA_VERSION,
  EvidenceSnapshotSchema,
  type ConsensusProfile,
  type EvidenceSnapshot,
  type LocalVerdict,
} from "./schemas.js";

/** Raised when an artifact is not eligible for public consensus. Never a warning. */
export class ConsensusNotPermittedError extends Error {}

export interface EvidenceInputs {
  reviewId: string;
  createdAt: Date;

  artifactId: string;
  /** keccak256 over the artifact's actual bytes, verified by the caller before freezing. */
  artifactHash: `0x${string}`;
  artifactKind: string;
  artifactTitle: string;
  artifactFormat: string;
  profile: ConsensusProfile;

  /** Frozen public text, for written/plan/pack. Omitted for visual. */
  artifactText?: string;
  /** Immutable public consensus asset, for visual. Never a private storage path. */
  artifactUrl?: string;

  oqsVersion: string;
  localVerdict: LocalVerdict;
  axisPassThreshold: number;
  rubricAxes: readonly { id: string; label: string; description: string }[];

  brief: {
    objective: string;
    requiredElements?: readonly string[];
    prohibitedElements?: readonly string[];
  };

  tribunal: {
    /** Undefined when the critic was unavailable — that distinction is carried, not flattened. */
    axes?: Readonly<Record<string, number>>;
    hardFailures?: readonly string[];
    issues?: readonly string[];
    repairs: number;
    coverageGaps?: readonly string[];
  };

  /** The owner's explicit, recorded decision to publish this for consensus. */
  publicForConsensus: boolean;
}

/**
 * The origins the Intelligent Contract will accept. Kept here as well as in the contract so a
 * snapshot that could never be adjudicated fails at build time rather than on-chain.
 */
export const EVIDENCE_ORIGIN = "https://api.occestra.xyz/genlayer/evidence/";
export const ARTIFACT_ORIGIN = "https://api.occestra.xyz/genlayer/artifacts/";

export function evidenceUrlFor(reviewId: string, origin = EVIDENCE_ORIGIN): string {
  return origin + encodeURIComponent(reviewId);
}

export function artifactUrlFor(reviewId: string, origin = ARTIFACT_ORIGIN): string {
  return origin + encodeURIComponent(reviewId);
}

/**
 * Assembles the snapshot, or refuses.
 *
 * Refusal is the point: consent is checked before any content is read, so a private artifact
 * never even gets marshalled into a shape that could be written somewhere by mistake.
 */
export function buildEvidenceSnapshot(inputs: EvidenceInputs): EvidenceSnapshot {
  if (!inputs.publicForConsensus) {
    throw new ConsensusNotPermittedError(
      `artifact ${inputs.artifactId} is not approved for public consensus`,
    );
  }

  if (inputs.profile === "visual") {
    if (!inputs.artifactUrl) {
      throw new ConsensusNotPermittedError(
        "a visual review needs a frozen public consensus artifact URL",
      );
    }
    if (!inputs.artifactUrl.startsWith(ARTIFACT_ORIGIN)) {
      throw new ConsensusNotPermittedError(
        "the artifact URL must be an Occestra consensus asset, not a storage or provider URL",
      );
    }
  }

  const snapshot: EvidenceSnapshot = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    reviewId: inputs.reviewId,
    createdAt: inputs.createdAt.toISOString(),

    artifactId: inputs.artifactId,
    artifactHash: inputs.artifactHash,
    artifactKind: inputs.artifactKind,
    profile: inputs.profile,
    oqsVersion: inputs.oqsVersion,
    localVerdict: inputs.localVerdict,
    publicForConsensus: true,

    brief: {
      objective: inputs.brief.objective,
      requiredElements: [...(inputs.brief.requiredElements ?? [])],
      prohibitedElements: [...(inputs.brief.prohibitedElements ?? [])],
    },

    rubric: {
      oqsVersion: inputs.oqsVersion,
      profile: inputs.profile,
      axisPassThreshold: inputs.axisPassThreshold,
      axes: inputs.rubricAxes.map((axis) => ({
        id: axis.id,
        label: axis.label,
        description: axis.description,
      })),
    },

    localTribunal: {
      verdict: inputs.localVerdict,
      axes: { ...(inputs.tribunal.axes ?? {}) },
      hardFailures: [...(inputs.tribunal.hardFailures ?? [])],
      issues: [...(inputs.tribunal.issues ?? [])],
      repairs: inputs.tribunal.repairs,
      // The Tribunal leaves axes undefined when the critic could not be reached. An empty
      // object would read as "graded, scored nothing", which is a different and flattering
      // claim, so the distinction is stated outright.
      criticAvailable: inputs.tribunal.axes !== undefined,
      coverageGaps: [...(inputs.tribunal.coverageGaps ?? [])],
    },

    artifact: {
      title: inputs.artifactTitle,
      format: inputs.artifactFormat,
      // Visual artifacts travel as an image, never as inline bytes or a caption pretending
      // to be one. Text profiles carry their frozen content directly.
      ...(inputs.profile === "visual" || inputs.artifactText === undefined
        ? {}
        : { text: inputs.artifactText }),
    },

    ...(inputs.artifactUrl ? { artifactUrl: inputs.artifactUrl } : {}),
  };

  // Parse what we just built. `.strict()` turns a stray field into a thrown error here,
  // before it can reach a public URL.
  return EvidenceSnapshotSchema.parse(snapshot);
}

/**
 * keccak256 over the snapshot's canonical JSON.
 *
 * Same canonicalisation as the X Layer manifest hash, so the two provenance systems agree
 * about what "the bytes of this object" means, and anyone can recompute it from what we serve.
 */
export function hashEvidenceSnapshot(snapshot: EvidenceSnapshot): `0x${string}` {
  return keccak256(toBytes(canonicalJson(snapshot)));
}

/** The exact bytes to serve at the evidence URL. Serving anything else breaks the hash. */
export function serializeEvidenceSnapshot(snapshot: EvidenceSnapshot): string {
  return canonicalJson(snapshot);
}

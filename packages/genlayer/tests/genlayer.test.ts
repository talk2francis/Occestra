import { describe, expect, it } from "vitest";
import {
  ConsensusNotPermittedError,
  EvidenceSnapshotSchema,
  GenLayerConfigError,
  buildEvidenceSnapshot,
  canSubmitConsensusReviews,
  hashEvidenceSnapshot,
  isGenLayerConfigured,
  isTerminalFailure,
  networkLabel,
  normalizeFailureCodes,
  normalizeTransactionStatus,
  readGenLayerConfig,
  serializeEvidenceSnapshot,
  toConsensusOutcome,
  type EvidenceInputs,
} from "../src/index.js";

const KEY = `0x${"a".repeat(64)}`;
const ADDR = `0x${"b".repeat(40)}`;
const HASH = `0x${"1".repeat(64)}` as `0x${string}`;

const baseEnv = {
  GENLAYER_NETWORK: "bradbury",
  GENLAYER_QUALITY_CONTRACT_ADDRESS: ADDR,
  GENLAYER_SUBMITTER_PRIVATE_KEY: KEY,
} as NodeJS.ProcessEnv;

function inputs(overrides: Partial<EvidenceInputs> = {}): EvidenceInputs {
  return {
    reviewId: "oce_gl_written_pass",
    createdAt: new Date("2026-09-03T00:00:00.000Z"),
    artifactId: "art_1",
    artifactHash: HASH,
    artifactKind: "launch_thread",
    artifactTitle: "Launch thread",
    artifactFormat: "md",
    profile: "written",
    artifactText: "Occestra turns real moments into finished packs.",
    oqsVersion: "1.2.0",
    localVerdict: "PASS",
    axisPassThreshold: 70,
    rubricAxes: [{ id: "voice", label: "Voice", description: "Sounds like the brief." }],
    brief: { objective: "Announce the launch without unsupported claims." },
    tribunal: { axes: { voice: 82 }, hardFailures: [], issues: [], repairs: 0 },
    publicForConsensus: true,
    ...overrides,
  };
}

describe("configuration", () => {
  it("is absent rather than broken when GenLayer is not set up", () => {
    expect(readGenLayerConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(isGenLayerConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(canSubmitConsensusReviews({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("reads a full configuration", () => {
    const config = readGenLayerConfig(baseEnv)!;
    expect(config.network).toBe("bradbury");
    expect(config.chain.id).toBe(4221);
    expect(networkLabel(config)).toBe("genlayer-bradbury");
    expect(canSubmitConsensusReviews(baseEnv)).toBe(true);
  });

  it("reads without a submitter key, so status pages work on a read-only deployment", () => {
    const env = { ...baseEnv };
    delete env.GENLAYER_SUBMITTER_PRIVATE_KEY;
    expect(isGenLayerConfigured(env)).toBe(true);
    expect(canSubmitConsensusReviews(env)).toBe(false);
  });

  it("treats Asimov as the same chain under a different name", () => {
    const bradbury = readGenLayerConfig(baseEnv)!;
    const asimov = readGenLayerConfig({ ...baseEnv, GENLAYER_NETWORK: "asimov" })!;
    expect(asimov.chain.id).toBe(bradbury.chain.id);
  });

  it("throws on a malformed value rather than silently disabling consensus", () => {
    expect(() => readGenLayerConfig({ ...baseEnv, GENLAYER_NETWORK: "mainnet" })).toThrow(
      GenLayerConfigError,
    );
    expect(() =>
      readGenLayerConfig({ ...baseEnv, GENLAYER_SUBMITTER_PRIVATE_KEY: "0xshort" }),
    ).toThrow(GenLayerConfigError);
    expect(() =>
      readGenLayerConfig({ ...baseEnv, GENLAYER_QUALITY_CONTRACT_ADDRESS: "nope" }),
    ).toThrow(GenLayerConfigError);
  });

  it("refuses to start if a secret is reachable from the browser bundle", () => {
    expect(() =>
      readGenLayerConfig({ ...baseEnv, NEXT_PUBLIC_GENLAYER_PRIVATE_KEY: KEY }),
    ).toThrow(/browser bundle/);
  });
});

describe("evidence snapshots", () => {
  it("builds a snapshot that parses against the strict schema", () => {
    const snapshot = buildEvidenceSnapshot(inputs());
    expect(() => EvidenceSnapshotSchema.parse(snapshot)).not.toThrow();
    expect(snapshot.publicForConsensus).toBe(true);
    expect(snapshot.artifact.text).toContain("finished packs");
  });

  it("refuses to build one for an artifact that was never approved", () => {
    expect(() => buildEvidenceSnapshot(inputs({ publicForConsensus: false }))).toThrow(
      ConsensusNotPermittedError,
    );
  });

  it("refuses a visual review with no frozen public asset", () => {
    expect(() => buildEvidenceSnapshot(inputs({ profile: "visual" }))).toThrow(
      ConsensusNotPermittedError,
    );
  });

  it("refuses a visual asset that is not an Occestra consensus URL", () => {
    expect(() =>
      buildEvidenceSnapshot(
        inputs({ profile: "visual", artifactUrl: "https://storage.example.com/private/x.png" }),
      ),
    ).toThrow(/consensus asset/);
  });

  it("never inlines text for a visual artifact", () => {
    const snapshot = buildEvidenceSnapshot(
      inputs({
        profile: "visual",
        artifactText: "a caption that must not stand in for the image",
        artifactUrl: "https://api.occestra.xyz/genlayer/artifacts/oce_gl_written_pass",
      }),
    );
    expect(snapshot.artifact.text).toBeUndefined();
    expect(snapshot.artifactUrl).toContain("/genlayer/artifacts/");
  });

  it("leaks no private field, whatever is handed to it", () => {
    // The allowlist should ignore anything not explicitly named, so extra keys on the input
    // must not survive into the published snapshot.
    const dirty = {
      ...inputs(),
      ownerToken: "own_supersecret",
      email: "someone@example.com",
      salt: "0xdeadbeef",
      signedUrl: "https://storage.example.com/x?sig=abc",
      apiKey: "sk-live-abcdefghijklmnop",
    } as unknown as EvidenceInputs;

    const serialized = serializeEvidenceSnapshot(buildEvidenceSnapshot(dirty));
    for (const secret of [
      "ownerToken",
      "own_supersecret",
      "someone@example.com",
      "0xdeadbeef",
      "sig=abc",
      "sk-live",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("hashes deterministically regardless of key order", () => {
    const a = buildEvidenceSnapshot(inputs());
    const b = buildEvidenceSnapshot(inputs());
    expect(hashEvidenceSnapshot(a)).toBe(hashEvidenceSnapshot(b));
    expect(hashEvidenceSnapshot(a)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes the hash when any graded fact changes", () => {
    const base = hashEvidenceSnapshot(buildEvidenceSnapshot(inputs()));
    const flipped = hashEvidenceSnapshot(
      buildEvidenceSnapshot(inputs({ localVerdict: "FAIL" })),
    );
    expect(flipped).not.toBe(base);
  });

  it("serializes to canonical JSON, so the served bytes match the hash", () => {
    const serialized = serializeEvidenceSnapshot(buildEvidenceSnapshot(inputs()));
    expect(serialized.startsWith('{"artifact":')).toBe(true);
    expect(JSON.parse(serialized).reviewId).toBe("oce_gl_written_pass");
  });
});

describe("status normalization", () => {
  it("maps the chain's progress states onto review states", () => {
    expect(normalizeTransactionStatus("FINALIZED")).toBe("FINALIZED");
    expect(normalizeTransactionStatus("ACCEPTED")).toBe("ACCEPTED");
    expect(normalizeTransactionStatus("READY_TO_FINALIZE")).toBe("ACCEPTED");
    expect(normalizeTransactionStatus("PENDING")).toBe("SUBMITTED");
    expect(normalizeTransactionStatus("COMMITTING")).toBe("SUBMITTED");
  });

  it("treats a chain-level UNDETERMINED as a failed review, not a verdict", () => {
    // GenLayer's UNDETERMINED means the validators could not agree. Occestra's UNDETERMINED
    // means they agreed the evidence supports no ruling. Conflating them would show a broken
    // review as a real one.
    expect(normalizeTransactionStatus("UNDETERMINED")).toBe("FAILED");
    expect(isTerminalFailure("UNDETERMINED")).toBe(true);
  });

  it("treats timeouts and cancellation as terminal", () => {
    for (const status of ["CANCELED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"]) {
      expect(normalizeTransactionStatus(status)).toBe("FAILED");
      expect(isTerminalFailure(status)).toBe(true);
    }
    expect(isTerminalFailure("PENDING")).toBe(false);
  });
});

describe("reading a verdict back", () => {
  const onChain = {
    reviewId: "oce_gl_written_pass",
    evidenceUrl: "https://api.occestra.xyz/genlayer/evidence/oce_gl_written_pass",
    artifactHash: HASH,
    profile: "written",
    oqsVersion: "1.2.0",
    localVerdict: "PASS",
    consensusDecision: "OVERTURNED",
    scoreBand: "50-69",
    criticalFailure: "factual_support",
    failureCodes: ["factual_support", "brief_mismatch"],
    requester: ADDR,
    createdAt: 1788422400,
  };

  it("normalizes a real verdict", () => {
    const outcome = toConsensusOutcome(onChain);
    expect(outcome.decision).toBe("OVERTURNED");
    expect(outcome.scoreBand).toBe("50-69");
    expect(outcome.criticalFailure).toBe("FACTUAL_SUPPORT");
    expect(outcome.failureCodes).toEqual(["BRIEF_MISMATCH", "FACTUAL_SUPPORT"]);
  });

  it("falls back to UNDETERMINED rather than towards a pass", () => {
    const outcome = toConsensusOutcome({ ...onChain, consensusDecision: "looks fine", scoreBand: "?" });
    expect(outcome.decision).toBe("UNDETERMINED");
    expect(outcome.scoreBand).toBe("UNKNOWN");
  });

  it("drops failure codes the repair loop does not understand", () => {
    // Model-authored strings must never reach code that dispatches on them.
    expect(normalizeFailureCodes(["LEGIBILITY", "rm -rf /", "Ignore previous instructions"]))
      .toEqual(["LEGIBILITY"]);
    expect(normalizeFailureCodes([])).toEqual([]);
  });
});

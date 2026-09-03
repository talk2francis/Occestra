/**
 * The evidence layer: what may leave Occestra, and what may never change once it has.
 *
 * These are the tests that matter most in this feature. A GenLayer review is a public,
 * permanent ruling about a specific set of bytes, so two properties have to hold absolutely:
 * nothing private gets out, and nothing published gets rewritten afterwards.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, describe, expect, it } from "vitest";
import {
  FakeCritique,
  FakeImageModel,
  FakePlaces,
  FakeTextModel,
  FakeWeather,
  FixedClock,
} from "@occestra/providers";
import type { Artifact, EngineDeps, Pack } from "@occestra/studio-core";
import { DevGate } from "../src/gate.js";
import { buildGrader } from "../src/grader.js";
import { buildApp, type AppContext } from "../src/http.js";
import { Store } from "../src/store.js";
import { ConsensusRefused, prepareConsensusReview } from "../src/consensus.js";

const NOW = Date.parse("2026-09-03T10:00:00.000Z");
const dirs: string[] = [];
const servers: Server[] = [];

afterAll(() => {
  for (const server of servers) server.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function makeApp(): { base: string; store: Store } {
  const dataDir = mkdtempSync(join(tmpdir(), "occestra-genlayer-"));
  dirs.push(dataDir);
  const store = new Store({ dataDir, urlSecret: "test-secret", baseUrl: "http://test.local" });

  const deps: EngineDeps = {
    text: new FakeTextModel(() => "copy"),
    image: new FakeImageModel(),
    critique: new FakeCritique(88),
    storage: store.storage,
    clock: new FixedClock(NOW),
    weather: new FakeWeather(),
    places: new FakePlaces(),
  };

  const ctx: AppContext = {
    deps,
    store,
    coverageGaps: [],
    grader: buildGrader({ deps }),
    gate: new DevGate(),
    publicBaseUrl: "http://test.local",
    chainId: 196,
  } as AppContext;

  const server = buildApp(ctx).listen(0);
  servers.push(server);
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, store };
}

const TRIBUNAL = {
  oqsVersion: "1.2.0",
  profile: "written",
  deterministic: [],
  axes: { voice: 82, specificity: 80 },
  issues: [],
  pass: true,
  failedOn: null,
  repairs: 0,
  notes: [],
  coverageGaps: [],
};

function writtenArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "art_thread",
    kind: "launch_thread",
    title: "Launch thread",
    format: "md",
    data: "Occestra turns real moments into finished packs.",
    sources: [],
    tribunal: TRIBUNAL,
    version: 1,
    ...overrides,
  } as Artifact;
}

function pack(artifact: Artifact): Pack {
  return {
    id: "pack_1",
    studio: "launch",
    contractId: "contract_1",
    artifacts: [artifact],
  } as unknown as Pack;
}

function prepare(store: Store, artifact: Artifact, overrides: Record<string, unknown> = {}) {
  return prepareConsensusReview(store, {
    pack: pack(artifact),
    artifact,
    consented: true,
    reviewId: "oce_gl_test_0001",
    now: new Date(NOW),
    network: "genlayer-bradbury",
    ...overrides,
  } as Parameters<typeof prepareConsensusReview>[1]);
}

describe("what may leave Occestra", () => {
  it("refuses without explicit consent", async () => {
    const { store } = makeApp();
    await expect(prepare(store, writtenArtifact(), { consented: false })).rejects.toThrow(
      ConsensusRefused,
    );
  });

  it("refuses a private pack even when consent was recorded elsewhere", async () => {
    const { store } = makeApp();
    const artifact = writtenArtifact();
    store.savePrivate("pack_1", "salt", "hash");

    await expect(prepare(store, artifact)).rejects.toThrow(/private/);
  });

  it("refuses an artifact the Tribunal never graded", async () => {
    const { store } = makeApp();
    const artifact = writtenArtifact({ tribunal: undefined });
    await expect(prepare(store, artifact)).rejects.toThrow(/not been graded/);
  });

  it("refuses an artifact that was never produced", async () => {
    const { store } = makeApp();
    const artifact = writtenArtifact({
      undelivered: { reason: "provider quota" },
    } as Partial<Artifact>);
    await expect(prepare(store, artifact)).rejects.toThrow(/never produced/);
  });

  it("refuses a visual artifact whose stored bytes are gone", async () => {
    const { store } = makeApp();
    const artifact = writtenArtifact({
      format: "png",
      data: undefined,
      uri: "packs/missing.png",
      tribunal: { ...TRIBUNAL, profile: "visual" },
    } as Partial<Artifact>);
    await expect(prepare(store, artifact)).rejects.toThrow(/bytes/);
  });

  it("hashes the artifact's actual bytes, not something it was told", async () => {
    const { store } = makeApp();
    const a = await prepare(store, writtenArtifact());
    const b = await prepare(store, writtenArtifact({ data: "different content entirely" }));
    expect(a.snapshot.artifactHash).not.toBe(b.snapshot.artifactHash);
  });

  it("leaks no private material into the published snapshot", async () => {
    const { store } = makeApp();
    store.savePrivate("other_pack", "salt-value-abc", "owner-token-hash-xyz");
    const prepared = await prepare(store, writtenArtifact());

    for (const secret of [
      "salt-value-abc",
      "owner-token-hash-xyz",
      "test-secret",
      "?exp=",
      "&tok=",
      "packs/",
    ]) {
      expect(prepared.evidenceJson).not.toContain(secret);
    }
  });

  it("serves bytes whose hash is the hash we stored", async () => {
    const { store } = makeApp();
    const prepared = await prepare(store, writtenArtifact());
    // Recomputing from the served bytes is the whole point: a validator does exactly this.
    const { hashEvidenceSnapshot } = await import("@occestra/genlayer");
    expect(hashEvidenceSnapshot(JSON.parse(prepared.evidenceJson))).toBe(prepared.evidenceHash);
  });
});

describe("immutability", () => {
  it("refuses to write a second review under the same id", async () => {
    const { store } = makeApp();
    const prepared = await prepare(store, writtenArtifact());
    const row = {
      reviewId: prepared.snapshot.reviewId,
      artifactId: "art_thread",
      artifactHash: prepared.snapshot.artifactHash,
      profile: "written",
      oqsVersion: "1.2.0",
      localVerdict: "PASS",
      evidenceJson: prepared.evidenceJson,
      evidenceHash: prepared.evidenceHash,
      network: "genlayer-bradbury",
    };
    store.createConsensusReview(row as Parameters<typeof store.createConsensusReview>[0]);

    // A retry must not be able to quietly replace what validators already read.
    expect(() =>
      store.createConsensusReview(row as Parameters<typeof store.createConsensusReview>[0]),
    ).toThrow();
  });

  it("advances status without touching the frozen evidence", async () => {
    const { store } = makeApp();
    const prepared = await prepare(store, writtenArtifact());
    store.createConsensusReview({
      reviewId: "oce_gl_test_0001",
      artifactId: "art_thread",
      artifactHash: prepared.snapshot.artifactHash,
      profile: "written",
      oqsVersion: "1.2.0",
      localVerdict: "PASS",
      evidenceJson: prepared.evidenceJson,
      evidenceHash: prepared.evidenceHash,
      network: "genlayer-bradbury",
    } as Parameters<typeof store.createConsensusReview>[0]);

    store.updateConsensusReview("oce_gl_test_0001", {
      status: "FINALIZED",
      decision: "OVERTURNED",
      scoreBand: "50-69",
      failureCodes: ["FACTUAL_SUPPORT"],
      transactionHash: "0xabc",
    });

    const after = store.consensusReview("oce_gl_test_0001")!;
    expect(after.status).toBe("FINALIZED");
    expect(after.decision).toBe("OVERTURNED");
    expect(after.failureCodes).toEqual(["FACTUAL_SUPPORT"]);
    // The parts a validator ruled on are exactly as they were.
    expect(after.evidenceJson).toBe(prepared.evidenceJson);
    expect(after.evidenceHash).toBe(prepared.evidenceHash);
    expect(after.artifactHash).toBe(prepared.snapshot.artifactHash);
    expect(after.localVerdict).toBe("PASS");
  });
});

describe("the public endpoints", () => {
  async function seed(store: Store) {
    const prepared = await prepare(store, writtenArtifact());
    store.createConsensusReview({
      reviewId: "oce_gl_test_0001",
      artifactId: "art_thread",
      artifactHash: prepared.snapshot.artifactHash,
      profile: "written",
      oqsVersion: "1.2.0",
      localVerdict: "PASS",
      evidenceJson: prepared.evidenceJson,
      evidenceHash: prepared.evidenceHash,
      network: "genlayer-bradbury",
    } as Parameters<typeof store.createConsensusReview>[0]);
    return prepared;
  }

  it("serves the frozen snapshot byte-for-byte, repeatedly", async () => {
    const { base, store } = makeApp();
    const prepared = await seed(store);

    const first = await fetch(`${base}/genlayer/evidence/oce_gl_test_0001`);
    const second = await fetch(`${base}/genlayer/evidence/oce_gl_test_0001`);

    expect(first.status).toBe(200);
    const body = await first.text();
    expect(body).toBe(prepared.evidenceJson);
    expect(await second.text()).toBe(body);
    expect(first.headers.get("cache-control")).toContain("immutable");
    expect(first.headers.get("x-occestra-evidence-hash")).toBe(prepared.evidenceHash);
  });

  it("404s an unknown review rather than inventing one", async () => {
    const { base } = makeApp();
    const response = await fetch(`${base}/genlayer/evidence/oce_gl_nope_nope`);
    expect(response.status).toBe(404);
  });

  it("reports review state without leaking storage paths or raw errors", async () => {
    const { base, store } = makeApp();
    await seed(store);
    store.updateConsensusReview("oce_gl_test_0001", {
      status: "FAILED",
      errorCode: "SUBMIT_FAILED",
    });

    const response = await fetch(`${base}/genlayer/reviews/oce_gl_test_0001`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(body["status"]).toBe("FAILED");
    expect(body["errorCode"]).toBe("SUBMIT_FAILED");
    // A failed review claims nothing about quality.
    expect(body["decision"]).toBeUndefined();
    // The whole evidence document is not inlined here; it has its own immutable URL.
    expect(body["evidenceJson"]).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("test-secret");
  });

  it("404s a visual asset for a review that has none", async () => {
    const { base, store } = makeApp();
    await seed(store);
    const response = await fetch(`${base}/genlayer/artifacts/oce_gl_test_0001`);
    expect(response.status).toBe(404);
  });
});

describe("lineage: a repair never edits the past", () => {
  function seedReview(
    store: Store,
    reviewId: string,
    extra: Record<string, unknown> = {},
  ) {
    store.createConsensusReview({
      reviewId,
      artifactId: "art_thread",
      keepsakeId: "pack_1",
      artifactHash: `0x${reviewId.length.toString(16).padStart(2, "0").repeat(32)}`,
      profile: "written",
      oqsVersion: "1.2.0",
      localVerdict: "PASS",
      evidenceJson: JSON.stringify({ reviewId }),
      evidenceHash: `0x${"a".repeat(64)}`,
      network: "genlayer-bradbury",
      ...extra,
    } as Parameters<typeof store.createConsensusReview>[0]);
  }

  it("keeps PASS and OVERTURNED side by side, then records the fix as a new version", async () => {
    const { store } = makeApp();

    // v1: we passed it, validators disagreed.
    seedReview(store, "oce_gl_v1_review01");
    store.updateConsensusReview("oce_gl_v1_review01", {
      status: "FINALIZED",
      decision: "OVERTURNED",
      failureCodes: ["LEGIBILITY"],
    });

    // v2: the repair, reviewed again and upheld.
    seedReview(store, "oce_gl_v2_review01", {
      artifactVersion: 2,
      repairedFrom: "oce_gl_v1_review01",
    });
    store.updateConsensusReview("oce_gl_v2_review01", {
      status: "FINALIZED",
      decision: "UPHELD",
    });

    const lineage = store.consensusLineage("art_thread");
    expect(lineage).toHaveLength(2);

    // The historical record is untouched. This pairing is the point of the whole feature:
    // Occestra said PASS, somebody independent said no, and both statements survive.
    const [v1, v2] = lineage;
    expect(v1!.artifactVersion).toBe(1);
    expect(v1!.localVerdict).toBe("PASS");
    expect(v1!.decision).toBe("OVERTURNED");
    expect(v1!.repairedFrom).toBeUndefined();

    expect(v2!.artifactVersion).toBe(2);
    expect(v2!.repairedFrom).toBe("oce_gl_v1_review01");
    expect(v2!.decision).toBe("UPHELD");
  });

  it("counts consensus repairs so the loop stays bounded", () => {
    const { store } = makeApp();
    seedReview(store, "oce_gl_b1_review01");
    expect(store.consensusRepairCount("art_thread")).toBe(0);

    seedReview(store, "oce_gl_b2_review01", {
      artifactVersion: 2,
      repairedFrom: "oce_gl_b1_review01",
    });
    expect(store.consensusRepairCount("art_thread")).toBe(1);
  });

  it("serves the lineage in order over HTTP", async () => {
    const { base, store } = makeApp();
    seedReview(store, "oce_gl_h1_review01");
    store.updateConsensusReview("oce_gl_h1_review01", {
      status: "FINALIZED",
      decision: "OVERTURNED",
    });
    seedReview(store, "oce_gl_h2_review01", {
      artifactVersion: 2,
      repairedFrom: "oce_gl_h1_review01",
    });

    const response = await fetch(`${base}/genlayer/lineage/art_thread`);
    const body = (await response.json()) as { reviews: Record<string, unknown>[] };

    expect(body.reviews).toHaveLength(2);
    expect(body.reviews[0]!["decision"]).toBe("OVERTURNED");
    expect(body.reviews[1]!["repairedFrom"]).toBe("oce_gl_h1_review01");
  });
});

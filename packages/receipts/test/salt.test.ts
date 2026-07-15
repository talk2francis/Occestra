/**
 * Salted seals — privacy for a keepsake that can be PROVEN without being PUBLISHED.
 *
 * A private keepsake's on-chain leaf commits to keccak256(salt || manifest), not to the bare
 * manifest hash. Two things follow, and both are tested here: (1) the anchored leaf reveals
 * nothing and links to nothing — the same manifest under a different salt is a different
 * commitment; (2) the owner, holding the salt, can still verify the commitment opens to their
 * pack, while a stranger without the salt can only confirm the signature, not the contents.
 */
import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { manifestHash, saltedManifestCommitment, type Pack } from "@occestra/studio-core";
import { Sealer, verifyPack } from "../src/index.js";

const KEY: Hex = `0x${"11".repeat(32)}`;
const REGISTRY = "0x000000000000000000000000000000000000dEaD";
const sealer = new Sealer({ privateKey: KEY, chainId: 196, verifyingContract: REGISTRY });
const salt = (): Hex => `0x${randomBytes(32).toString("hex")}`;

function pack(): Pack {
  return {
    id: "oce_01kxprivate0000000000",
    contractId: "r_1",
    studio: "remember",
    artifacts: [
      { id: "art", kind: "keepsake_art", title: "Our summer", format: "png", uri: "k/art.png", sources: [], version: 1 },
    ],
    coverageGaps: [],
    quality: { oqsVersion: "1.2.0", passRate: 1, repairedCount: 0, undeliveredCount: 0 },
    createdAt: "2026-07-15T10:00:00.000Z",
  } as Pack;
}

describe("a salted commitment hides and de-links", () => {
  it("differs from the bare manifest hash", () => {
    const p = pack();
    expect(saltedManifestCommitment(p, salt())).not.toBe(manifestHash(p));
  });

  it("is DIFFERENT for the same manifest under a different salt — the leaf is unlinkable", () => {
    const p = pack();
    expect(saltedManifestCommitment(p, salt())).not.toBe(saltedManifestCommitment(p, salt()));
  });

  it("is STABLE for the same manifest and the same salt — the owner can reproduce it", () => {
    const p = pack();
    const s = salt();
    expect(saltedManifestCommitment(p, s)).toBe(saltedManifestCommitment(p, s));
  });

  it("rejects a salt that is not 32 bytes", () => {
    expect(() => saltedManifestCommitment(pack(), "0xdead" as Hex)).toThrow(/32 bytes/);
  });
});

describe("verifying a salted seal", () => {
  it("the OWNER, with the salt, verifies the manifest fully", async () => {
    const s = salt();
    const sealed = await sealer.seal(pack(), "remember", s);
    expect(sealed.seal.salted).toBe(true);

    const result = await verifyPack(sealed, undefined, s);
    expect(result.valid).toBe(true);
    expect(result.manifestChecked).toBe(true);
  });

  it("a STRANGER, without the salt, verifies the signature but NOT the manifest", async () => {
    const sealed = await sealer.seal(pack(), "remember", salt());

    const result = await verifyPack(sealed); // no salt
    // The signature is real, so nothing is WRONG — but the manifest was not checked, and the
    // result says so rather than implying a full verification.
    expect(result.valid).toBe(true);
    expect(result.manifestChecked).toBe(false);
  });

  it("a WRONG salt fails the manifest check — a salt is not a skeleton key", async () => {
    const sealed = await sealer.seal(pack(), "remember", salt());

    const result = await verifyPack(sealed, undefined, salt()); // different salt
    expect(result.valid).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/salt does not open/i);
  });

  it("a tampered private pack fails even with the right salt", async () => {
    const s = salt();
    const sealed = await sealer.seal(pack(), "remember", s);
    const tampered = { ...sealed, artifacts: [{ ...sealed.artifacts[0]!, uri: "k/OTHER.png" }] } as Pack & { seal: typeof sealed.seal };

    const result = await verifyPack(tampered, undefined, s);
    expect(result.valid).toBe(false);
  });
});

describe("a PUBLIC pack is unchanged", () => {
  it("seals unsalted and verifies against the pack alone, with no salt", async () => {
    const publicPack = { ...pack(), studio: "celebrate" } as Pack;
    const sealed = await sealer.seal(publicPack, "celebrate");

    expect(sealed.seal.salted).toBeUndefined();
    const result = await verifyPack(sealed);
    expect(result.valid).toBe(true);
    expect(result.manifestChecked).toBe(true);
  });
});

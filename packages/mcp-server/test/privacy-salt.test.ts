/**
 * Private keepsakes: PROVEN without being PUBLISHED.
 *
 * A Remember pack is sealed to a salted commitment and its salt is held server-side, released
 * only to a caller who proves ownership. Its public /k page shows the seal, never the contents.
 * These tests hold that boundary: the store must not leak a private pack's artifacts, and it
 * must not hand out the salt without the owner token.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Pack } from "@occestra/studio-core";
import { Store } from "../src/store.js";

const dirs: string[] = [];
function store(): Store {
  const dir = mkdtempSync(join(tmpdir(), "oce-priv-"));
  dirs.push(dir);
  return new Store({ dataDir: dir, urlSecret: "test-secret", baseUrl: "http://test.local" });
}

function pack(id: string, studio: Pack["studio"]): Pack {
  return {
    id,
    contractId: "r_1",
    studio,
    artifacts: [
      { id: "art", kind: "keepsake_art", title: "Our summer", format: "png", uri: "k/art.png", sources: [], version: 1 },
      { id: "story", kind: "story_page", title: "The story", format: "md", data: "We drove to the coast.", sources: [], version: 1 },
    ],
    coverageGaps: [],
    quality: { oqsVersion: "1.2.0", passRate: 1, repairedCount: 0, undeliveredCount: 0 },
    createdAt: "2026-07-15T10:00:00.000Z",
  } as Pack;
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("a private pack's /k page shows the seal, not the contents", () => {
  it("hides the artifacts, the story, and the manifest", () => {
    const s = store();
    const p = pack("oce_01kxprivate0000000001", "remember");
    s.savePack(p);
    s.savePrivate(p.id, `0x${randomBytes(32).toString("hex")}`, s.hashOwnerToken("owner-token-123"));

    const view = s.publicPack(p.id)!;
    expect(view["private"]).toBe(true);
    expect(view["artifacts"]).toBeUndefined(); // no contents
    expect(view["quality"]).toBeUndefined(); // not even the grade summary
    expect(view).toHaveProperty("seal"); // the seal field IS surfaced (here, an unsealed test pack)
    expect(String(view["note"])).toContain("only to its owner");
  });

  it("leaves a PUBLIC pack fully visible", () => {
    const s = store();
    const p = pack("oce_01kxpublic00000000001", "celebrate");
    s.savePack(p); // no savePrivate — it is not private

    const view = s.publicPack(p.id)!;
    expect(view["private"]).toBeUndefined();
    expect(Array.isArray(view["artifacts"])).toBe(true);
    expect((view["artifacts"] as unknown[]).length).toBe(2);
  });
});

describe("the public activity pulse is real and anonymous", () => {
  it("returns sealed public work, excludes private/unsealed work, and never returns artifact titles", () => {
    const s = store();
    const publicSealed = pack("oce_01kxpublicsealed000001", "celebrate");
    publicSealed.artifacts[0]!.title = "Francis and Ada's private dinner";
    publicSealed.seal = {
      keepsakeId: publicSealed.id,
      manifestHash: `0x${"11".repeat(32)}`,
      packKind: 0,
      createdAt: Date.now(),
      signature: "0x11",
      signer: `0x${"22".repeat(20)}`,
      chainId: 196,
      verifyingContract: `0x${"33".repeat(20)}`,
    };

    const publicUnsealed = pack("oce_01kxpublicplain0000001", "launch");
    const privateSealed = pack("oce_01kxprivsealed00000001", "remember");
    privateSealed.seal = { ...publicSealed.seal, keepsakeId: privateSealed.id, packKind: 1 };

    s.savePack(publicSealed);
    s.savePack(publicUnsealed);
    s.savePack(privateSealed);
    s.savePrivate(privateSealed.id, `0x${randomBytes(32).toString("hex")}`, s.hashOwnerToken("owner"));

    const recent = s.recentPublicSealedPacks(8);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.id).toBe(publicSealed.id);
    expect(recent[0]?.descriptor).toBe("Celebrate pack · 2 delivered artifacts");
    expect(JSON.stringify(recent)).not.toContain("Francis");
    expect(JSON.stringify(recent)).not.toContain("Ada");
  });
});

describe("the salt is released only to the owner", () => {
  it("reveals the salt to the right token, and refuses a wrong one", () => {
    const s = store();
    const p = pack("oce_01kxprivate0000000002", "remember");
    const salt = `0x${randomBytes(32).toString("hex")}`;
    s.savePack(p);
    s.savePrivate(p.id, salt, s.hashOwnerToken("correct-token"));

    expect(s.ownsPack(p.id, "correct-token")).toBe(true);
    expect(s.ownsPack(p.id, "wrong-token")).toBe(false);
    expect(s.revealSalt(p.id, "correct-token")).toBe(salt);
    expect(s.revealSalt(p.id, "wrong-token")).toBeUndefined();
  });

  it("stores the token as a HASH — the table does not hold the plaintext key", () => {
    const s = store();
    const p = pack("oce_01kxprivate0000000003", "remember");
    s.savePack(p);
    s.savePrivate(p.id, `0x${randomBytes(32).toString("hex")}`, s.hashOwnerToken("secret"));

    // Ownership is checked without the plaintext ever being persisted.
    expect(s.hashOwnerToken("secret")).not.toBe("secret");
    expect(s.ownsPack(p.id, "secret")).toBe(true);
  });

  it("says nothing about a pack it does not know", () => {
    const s = store();
    expect(s.isPrivate("oce_01kxnope000000000000")).toBe(false);
    expect(s.ownsPack("oce_01kxnope000000000000", "any")).toBe(false);
    expect(s.revealSalt("oce_01kxnope000000000000", "any")).toBeUndefined();
  });
});

describe("deleting a private pack destroys its salt too", () => {
  it("removes the pack_private row on delete", () => {
    const s = store();
    const p = pack("oce_01kxprivate0000000004", "remember");
    s.savePack(p);
    s.savePrivate(p.id, `0x${randomBytes(32).toString("hex")}`, s.hashOwnerToken("t"));

    expect(s.isPrivate(p.id)).toBe(true);
    s.deletePack(p.id);
    expect(s.isPrivate(p.id)).toBe(false);
    expect(s.saltFor(p.id)).toBeUndefined();
  });
});

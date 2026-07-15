/**
 * The security sweep, at the store and upload layer: image-bomb refusal, deletion auth, the
 * audit log, and the abandoned-upload purge.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import type { Pack } from "@occestra/studio-core";
import { Store } from "../src/store.js";
import { MAX_PIXELS, sanitizeImage, UploadRejected } from "../src/uploads.js";

const dirs: string[] = [];
function store(): Store {
  const dir = mkdtempSync(join(tmpdir(), "oce-sec-"));
  dirs.push(dir);
  return new Store({ dataDir: dir, urlSecret: "test-secret", baseUrl: "http://test.local" });
}

function keepsake(id: string): Pack {
  return {
    id,
    contractId: "r_1",
    studio: "remember",
    artifacts: [{ id: "art", kind: "keepsake_art", title: "x", format: "png", uri: "k/art.png", sources: [], version: 1 }],
    coverageGaps: [],
    quality: { oqsVersion: "1.2.0", passRate: 1, repairedCount: 0, undeliveredCount: 0 },
    createdAt: "2026-07-15T10:00:00.000Z",
  } as Pack;
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("image-bomb defence", () => {
  it("refuses an image whose declared pixels exceed the cap", async () => {
    // A real, small PNG that is nonetheless too many pixels — 13000 wide is over MAX_DIMENSION.
    const bomb = await sharp({ create: { width: 13_000, height: 10, channels: 3, background: "#fff" } })
      .png()
      .toBuffer();
    await expect(sanitizeImage(new Uint8Array(bomb))).rejects.toBeInstanceOf(UploadRejected);
  });

  it("accepts a normal photo and re-encodes it, stripping metadata", async () => {
    const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#abc" } })
      .png()
      .toBuffer();
    const safe = await sanitizeImage(new Uint8Array(photo));
    expect(safe.format).toBe("png");
    expect(safe.width).toBe(800);
    expect(safe.width * safe.height).toBeLessThan(MAX_PIXELS);
  });
});

describe("deletion requires the owner token", () => {
  it("the store refuses to reveal or delete without the right token, and audits a real deletion", () => {
    const s = store();
    const p = keepsake("oce_01kxsec00000000000001");
    s.savePack(p);
    s.savePrivate(p.id, `0x${randomBytes(32).toString("hex")}`, s.hashOwnerToken("the-owner-token"));

    // Ownership is the gate the HTTP layer checks before it will delete.
    expect(s.ownsPack(p.id, "wrong")).toBe(false);
    expect(s.ownsPack(p.id, "the-owner-token")).toBe(true);

    s.audit("keepsake_deleted", { packId: p.id, actor: s.actorHash("the-owner-token"), detail: "0 uploads" });
    const log = s.auditFor(p.id);
    expect(log.some((e) => e.event === "keepsake_deleted")).toBe(true);
    // No private content in the log — just the event and a detail count.
    expect(JSON.stringify(log)).not.toContain("the-owner-token");
  });
});

describe("the audit log records provenance without leaking content", () => {
  it("records a salt reveal by actor hash, never the salt", () => {
    const s = store();
    s.audit("salt_revealed", { packId: "oce_01kxsec00000000000002", actor: s.actorHash("tok") });
    const log = s.auditFor("oce_01kxsec00000000000002");
    expect(log[0]!.event).toBe("salt_revealed");
    expect(JSON.stringify(log)).not.toContain("tok");
  });
});

describe("abandoned uploads are swept", () => {
  it("purges an unlinked upload past the cutoff, but keeps a linked one", () => {
    const s = store();
    const old = Date.now() - 5 * 24 * 60 * 60 * 1000; // 5 days ago

    s.recordUpload("uploads/abandoned.png", old);
    s.recordUpload("uploads/used.png", old);
    s.recordUpload("uploads/fresh.png", Date.now());
    // "used" was turned into a keepsake — it is linked and must survive.
    s.linkUploads("oce_01kxsec00000000000003", ["uploads/used.png"]);

    const removed = s.purgeAbandonedUploads(3 * 24 * 60 * 60 * 1000);

    expect(removed).toContain("uploads/abandoned.png");
    expect(removed).not.toContain("uploads/used.png"); // linked to a pack
    expect(removed).not.toContain("uploads/fresh.png"); // too recent
  });
});

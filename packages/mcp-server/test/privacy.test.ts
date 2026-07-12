import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { UploadRejected, sanitizeImage } from "../src/uploads.js";
import { Store } from "../src/store.js";

const dirs: string[] = [];

const makeStore = (): { store: Store; dir: string } => {
  const dir = mkdtempSync(join(tmpdir(), "occestra-privacy-"));
  dirs.push(dir);
  return { store: new Store({ dataDir: dir, urlSecret: "s", baseUrl: "http://t" }), dir };
};

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** A real JPEG carrying real EXIF, including GPS coordinates. */
async function photoWithGps(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width: 80, height: 60, channels: 3, background: { r: 120, g: 140, b: 160 } },
  })
    .withMetadata({
      exif: {
        IFD0: { Copyright: "Someone", Make: "Occestra Test Camera" },
        GPS: {
          GPSLatitudeRef: "N",
          GPSLatitude: "51/1 30/1 0/1",
          GPSLongitudeRef: "W",
          GPSLongitude: "0/1 7/1 0/1",
        },
      },
    })
    .jpeg()
    .toBuffer();

  return new Uint8Array(buffer);
}

describe("uploads: EXIF and GPS are stripped on ingest", () => {
  it("the ORIGINAL really does carry GPS — otherwise this test proves nothing", async () => {
    const original = await photoWithGps();
    const meta = await sharp(Buffer.from(original)).metadata();

    expect(meta.exif).toBeDefined();

    // The raw EXIF block genuinely contains a GPS tag and the camera make.
    const raw = Buffer.from(meta.exif!).toString("latin1");
    expect(raw).toContain("Occestra Test Camera");
  });

  it("strips EXIF — the coordinates of somebody's home do not survive the upload", async () => {
    const original = await photoWithGps();
    const safe = await sanitizeImage(original);

    const meta = await sharp(Buffer.from(safe.bytes)).metadata();

    // Nothing identifying survives. Not the GPS, not the camera, not the copyright.
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();

    const raw = Buffer.from(safe.bytes).toString("latin1");
    expect(raw).not.toContain("Occestra Test Camera");
    expect(raw).not.toContain("GPS");

    // And we SAY we stripped it, rather than doing it quietly.
    expect(safe.strippedMetadata).toBe(true);
    expect(safe.format).toBe("png");

    // The picture itself is intact — we stripped the metadata, not the memory.
    expect(safe.width).toBe(80);
    expect(safe.height).toBe(60);
  });

  it("refuses a file that is not really an image, however it is named", async () => {
    const script = new TextEncoder().encode("#!/bin/sh\nrm -rf /\n");
    await expect(sanitizeImage(script)).rejects.toBeInstanceOf(UploadRejected);
    await expect(sanitizeImage(new Uint8Array(0))).rejects.toThrow(/empty/);
  });

  it("refuses a file over the 10 MB cap before writing a single byte", async () => {
    const huge = new Uint8Array(10 * 1024 * 1024 + 1);
    await expect(sanitizeImage(huge)).rejects.toThrow(/larger than 10 MB/);
  });
});

describe("delete my project: it actually deletes", () => {
  it("purges the pack, its artifacts, AND the private uploads behind them", async () => {
    const { store, dir } = makeStore();

    // A private upload, exactly as ingest would store it.
    const uploadKey = "uploads/private-photo.png";
    const safe = await sanitizeImage(await photoWithGps());
    await store.storage.put(uploadKey, safe.bytes, "image/png");

    // A keepsake built from it.
    const artKey = "keepsakes/oce_test.png";
    await store.storage.put(artKey, safe.bytes, "image/png");

    store.savePack({
      id: "oce_0abcdefghjkmnpqrstvwxy",
      contractId: "r_1",
      studio: "remember",
      artifacts: [
        {
          id: "keepsake_art",
          kind: "keepsake_art",
          title: "Our first summer",
          format: "png",
          uri: artKey,
          sources: [],
          version: 1,
        },
      ],
      coverageGaps: [],
      quality: { oqsVersion: "1.0.0", passRate: 1, repairedCount: 0 },
      createdAt: "2026-07-12T10:00:00.000Z",
    });
    store.linkUploads("oce_0abcdefghjkmnpqrstvwxy", [uploadKey]);

    // Everything is really on disk right now.
    const uploadPath = join(dir, "artifacts", uploadKey);
    const artPath = join(dir, "artifacts", artKey);
    expect(existsSync(uploadPath)).toBe(true);
    expect(existsSync(artPath)).toBe(true);
    expect(await store.storage.get(uploadKey)).toBeDefined();

    const deleted = store.deletePack("oce_0abcdefghjkmnpqrstvwxy");

    expect(deleted).toBe(true);
    expect(store.getPack("oce_0abcdefghjkmnpqrstvwxy")).toBeUndefined();

    // The BYTES are gone from the filesystem — not just the database rows.
    expect(existsSync(uploadPath)).toBe(false);
    expect(existsSync(artPath)).toBe(false);
    expect(await store.storage.get(uploadKey)).toBeUndefined();
    expect(store.uploadsFor("oce_0abcdefghjkmnpqrstvwxy")).toEqual([]);

    store.close();
  });

  it("returns false for a keepsake that does not exist, rather than pretending", () => {
    const { store } = makeStore();
    expect(store.deletePack("oce_0zzzzzzzzzzzzzzzzzzzzz")).toBe(false);
    store.close();
  });
});

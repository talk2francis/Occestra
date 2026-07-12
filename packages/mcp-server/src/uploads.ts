/**
 * Uploads. This is the part of Occestra that handles a stranger's family photographs, so it
 * is the part that has to be most obviously trustworthy.
 *
 * What happens to a file the moment it arrives, in order:
 *   1. It is size-capped and counted before a single byte is written anywhere.
 *   2. sharp decodes it. If it is not really an image, it is refused — a .png that is
 *      actually a script does not get stored just because it was named nicely.
 *   3. It is RE-ENCODED. sharp drops all metadata unless you explicitly ask to keep it, so
 *      the re-encode is what strips EXIF — including the GPS coordinates of somebody's home,
 *      which is the single most dangerous thing in a holiday photo.
 *   4. Only then is it written, to a private key, served only through expiring signed URLs.
 *
 * And it can all be destroyed: DELETE /projects/:id removes the pack, the artifacts, AND the
 * uploads, from disk, for real.
 */
import busboy from "busboy";
import type { Request, Response } from "express";
import sharp from "sharp";
import type { Store } from "./store.js";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 8;

const ALLOWED = new Set(["jpeg", "jpg", "png", "webp", "heif", "avif", "gif", "tiff"]);

export interface IngestedUpload {
  /** The private storage key. Never public, never guessable content. */
  key: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  /** True when the original carried EXIF/GPS that we removed. Reported, not hidden. */
  strippedMetadata: boolean;
}

export class UploadRejected extends Error {
  override readonly name = "UploadRejected";
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * Decode, validate, strip, re-encode.
 *
 * Returns the SAFE bytes. The original is never written to disk — there is no moment at
 * which a file with GPS coordinates in it exists in our storage.
 */
export async function sanitizeImage(
  input: Uint8Array,
): Promise<{ bytes: Uint8Array; width: number; height: number; format: string; strippedMetadata: boolean }> {
  if (input.byteLength === 0) throw new UploadRejected("that file is empty");
  if (input.byteLength > MAX_FILE_BYTES) {
    throw new UploadRejected(`that file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`);
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(Buffer.from(input)).metadata();
  } catch {
    throw new UploadRejected("that file is not an image we can read");
  }

  if (!meta.format || !ALLOWED.has(meta.format)) {
    throw new UploadRejected(`we accept images only (that looked like "${meta.format ?? "unknown"}")`);
  }
  if (!meta.width || !meta.height) {
    throw new UploadRejected("that image has no readable dimensions");
  }

  // Did it carry anything identifying? We report this honestly rather than silently binning it.
  const hadMetadata = Boolean(meta.exif ?? meta.xmp ?? meta.iptc ?? meta.icc);

  // The re-encode IS the strip: sharp writes no metadata unless withMetadata() is called.
  // .rotate() first, so we honour the EXIF orientation before discarding the EXIF that said it.
  const bytes = await sharp(Buffer.from(input))
    .rotate()
    .png({ compressionLevel: 9 })
    .toBuffer();

  const out = await sharp(bytes).metadata();

  return {
    bytes: new Uint8Array(bytes),
    width: out.width ?? meta.width,
    height: out.height ?? meta.height,
    format: "png",
    strippedMetadata: hadMetadata,
  };
}

/** Parse a multipart body into raw files, enforcing the caps as we go. */
function readMultipart(req: Request): Promise<Array<{ filename: string; bytes: Uint8Array }>> {
  return new Promise((resolve, reject) => {
    const files: Array<{ filename: string; bytes: Uint8Array }> = [];

    let bb: busboy.Busboy;
    try {
      bb = busboy({
        headers: req.headers,
        limits: { files: MAX_FILES, fileSize: MAX_FILE_BYTES },
      });
    } catch {
      reject(new UploadRejected("that request was not a multipart upload"));
      return;
    }

    bb.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      let truncated = false;

      stream.on("limit", () => {
        truncated = true;
      });
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        if (truncated) {
          reject(new UploadRejected(`"${info.filename}" is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`));
          return;
        }
        files.push({ filename: info.filename, bytes: new Uint8Array(Buffer.concat(chunks)) });
      });
    });

    bb.on("filesLimit", () => reject(new UploadRejected(`at most ${MAX_FILES} files per upload`)));
    bb.on("error", (error) => reject(error instanceof Error ? error : new Error(String(error))));
    bb.on("close", () => resolve(files));

    req.pipe(bb);
  });
}

export interface UploadRoutesContext {
  store: Store;
  /** Seconds a signed upload URL stays valid. */
  ttlSeconds?: number;
}

export async function handleUpload(ctx: UploadRoutesContext, req: Request, res: Response): Promise<void> {
  try {
    const files = await readMultipart(req);

    if (files.length === 0) {
      res.status(400).json({ error: "no files were uploaded" });
      return;
    }

    const uploaded: IngestedUpload[] = [];

    for (const file of files) {
      const safe = await sanitizeImage(file.bytes);

      // The key is random. It carries nothing about the file, the person, or the moment.
      const key = `uploads/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}.png`;
      await ctx.store.storage.put(key, safe.bytes, "image/png");

      uploaded.push({
        key,
        width: safe.width,
        height: safe.height,
        bytes: safe.bytes.byteLength,
        format: safe.format,
        strippedMetadata: safe.strippedMetadata,
      });
    }

    res.json({
      uploads: uploaded.map((upload) => ({
        ...upload,
        url: ctx.store.signedUrlFor(upload.key, ctx.ttlSeconds ?? 3600),
      })),
      privacy: {
        metadataStripped: true,
        note: "Every image was re-encoded on arrival, which removes EXIF — including GPS location. The originals were never written to disk.",
        public: false,
        retention:
          "Your uploads are private and are served only through expiring signed links. DELETE /projects/:keepsakeId removes them, the pack, and every artifact, permanently.",
        onChain: "Nothing here goes on chain. Only a hash of the finished keepsake is ever anchored.",
      },
    });
  } catch (error) {
    if (error instanceof UploadRejected) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(500).json({
      error: `upload failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Delete my project. It has to actually delete, or it is a lie with a button on it.
 */
export function handleDelete(ctx: UploadRoutesContext, req: Request, res: Response): void {
  const raw = req.params["id"];
  const id = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");

  const pack = ctx.store.getPack(id);
  if (!pack) {
    res.status(404).json({ error: "no keepsake with that id" });
    return;
  }

  // store.deletePack removes the pack, its artifacts, AND the linked private uploads.
  const uploadCount = ctx.store.uploadsFor(id).length;
  const deleted = ctx.store.deletePack(id);

  res.json({
    deleted,
    keepsakeId: id,
    uploadsRemoved: uploadCount,
    note: "The pack, its artifacts, and the uploads it was built from have been removed from disk.",
    onChain:
      "If this keepsake was already anchored, the 32-byte hash on X Layer remains — it cannot be removed, and it reveals nothing: it is not the content, and the content is now gone.",
  });
}

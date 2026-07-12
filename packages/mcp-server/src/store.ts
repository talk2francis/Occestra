/**
 * The store. SQLite, synchronous (gotcha #10) — kept behind a thin repo layer so the hot
 * async paths never block on it and swapping it out later is a one-file job.
 *
 * Artifact binaries live on disk, not in the database, and are served ONLY through
 * HMAC-signed, expiring URLs. Uploads are private by default: that is a hard rule, and it
 * is enforced here rather than trusted to the caller.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import type { Pack, StoragePort, StoredObject } from "@occestra/studio-core";

export type OrderStatus = "pending" | "paid" | "refused" | "failed" | "demo";

export interface OrderRow {
  id: string;
  tool: string;
  priceUsdt: number;
  payerRef: string;
  status: OrderStatus;
  txHash?: string;
  createdAt: number;
}

export interface PendingSeal {
  leaf: string;
  keepsakeId: string;
  attempts: number;
  txHash?: string;
  anchoredAt?: number;
}

export interface StoreConfig {
  dataDir?: string;
  /** Signs artifact URLs. Falls back to an ephemeral key, which is fine for dev. */
  urlSecret?: string;
  baseUrl?: string;
}

export class Store {
  private readonly db: Database.Database;
  private readonly dataDir: string;
  private readonly artifactDir: string;
  private readonly urlSecret: string;
  readonly baseUrl: string;

  constructor(config: StoreConfig = {}) {
    this.dataDir = resolve(config.dataDir ?? "data");
    this.artifactDir = join(this.dataDir, "artifacts");
    mkdirSync(this.artifactDir, { recursive: true });

    this.urlSecret = config.urlSecret ?? createHmac("sha256", "occestra").update(String(Math.random())).digest("hex");
    this.baseUrl = config.baseUrl ?? "http://localhost:8402";

    this.db = new Database(join(this.dataDir, "occestra.db"));
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS packs (
        id          TEXT PRIMARY KEY,
        studio      TEXT NOT NULL,
        contract_id TEXT NOT NULL,
        body        TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id         TEXT PRIMARY KEY,
        pack_id    TEXT NOT NULL,
        kind       TEXT NOT NULL,
        format     TEXT NOT NULL,
        path       TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id          TEXT PRIMARY KEY,
        tool        TEXT NOT NULL,
        price_usdt  REAL NOT NULL,
        payer_ref   TEXT NOT NULL,
        status      TEXT NOT NULL,
        tx_hash     TEXT,
        created_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS seals_pending (
        leaf        TEXT PRIMARY KEY,
        keepsake_id TEXT NOT NULL,
        attempts    INTEGER NOT NULL DEFAULT 0,
        tx_hash     TEXT,
        anchored_at INTEGER,
        created_at  INTEGER NOT NULL
      );

      -- Which private uploads a pack was built from. Without this, "delete my project"
      -- would remove the pack and quietly leave the person's photographs on disk.
      CREATE TABLE IF NOT EXISTS pack_uploads (
        pack_id    TEXT NOT NULL,
        key        TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (pack_id, key)
      );

      -- Replay protection for x402: an EIP-3009 nonce is single-use, forever.
      CREATE TABLE IF NOT EXISTS payment_nonces (
        nonce      TEXT PRIMARY KEY,
        payer      TEXT NOT NULL,
        tool       TEXT NOT NULL,
        used_at    INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_artifacts_pack ON artifacts(pack_id);
      CREATE INDEX IF NOT EXISTS idx_seals_unanchored ON seals_pending(anchored_at);
    `);
  }

  /* ------------------------------------------------------------------ packs */

  savePack(pack: Pack): void {
    const now = Date.now();
    const insertPack = this.db.prepare(
      "INSERT OR REPLACE INTO packs (id, studio, contract_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    const insertArtifact = this.db.prepare(
      "INSERT OR REPLACE INTO artifacts (id, pack_id, kind, format, path, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );

    this.db.transaction(() => {
      insertPack.run(pack.id, pack.studio, pack.contractId, JSON.stringify(pack), now);
      for (const artifact of pack.artifacts) {
        insertArtifact.run(
          `${pack.id}:${artifact.id}`,
          pack.id,
          artifact.kind,
          artifact.format,
          artifact.uri ?? null,
          now,
        );
      }
    })();
  }

  getPack(id: string): Pack | undefined {
    const row = this.db.prepare("SELECT body FROM packs WHERE id = ?").get(id) as
      | { body: string }
      | undefined;
    return row ? (JSON.parse(row.body) as Pack) : undefined;
  }

  /** What /k/:id serves: no private upload refs, no storage keys, no seal private data. */
  publicPack(id: string): Record<string, unknown> | undefined {
    const pack = this.getPack(id);
    if (!pack) return undefined;

    return {
      id: pack.id,
      studio: pack.studio,
      createdAt: pack.createdAt,
      quality: pack.quality,
      coverageGaps: pack.coverageGaps,
      artifacts: pack.artifacts.map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        title: artifact.title,
        format: artifact.format,
        ...(artifact.styleId ? { styleId: artifact.styleId } : {}),
        // Text ships inline; binaries ship as a signed URL, never as a raw storage key.
        ...(artifact.format === "png" || artifact.format === "svg"
          ? { url: artifact.uri ? this.signedUrlFor(artifact.uri, 86_400) : undefined }
          : { data: artifact.data }),
        sources: artifact.sources,
        tribunal: artifact.tribunal,
      })),
      seal: pack.seal,
    };
  }

  /** Record which private uploads a pack was built from, so delete can find them again. */
  linkUploads(packId: string, keys: string[]): void {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO pack_uploads (pack_id, key, created_at) VALUES (?, ?, ?)",
    );
    const now = Date.now();
    this.db.transaction(() => {
      for (const key of keys) insert.run(packId, key, now);
    })();
  }

  uploadsFor(packId: string): string[] {
    const rows = this.db
      .prepare("SELECT key FROM pack_uploads WHERE pack_id = ?")
      .all(packId) as Array<{ key: string }>;
    return rows.map((row) => row.key);
  }

  /**
   * Delete my project. It has to ACTUALLY delete — the pack, its artifacts, and the private
   * uploads it was built from — or it is a lie with a button on it.
   */
  deletePack(id: string): boolean {
    const pack = this.getPack(id);
    if (!pack) return false;

    // Bytes first, rows second: a crash halfway through must not leave orphaned photographs.
    for (const artifact of pack.artifacts) {
      if (artifact.uri) {
        try {
          rmSync(this.pathFor(artifact.uri), { force: true });
        } catch {
          // already gone
        }
      }
    }

    for (const key of this.uploadsFor(id)) {
      try {
        rmSync(this.pathFor(key), { force: true });
      } catch {
        // already gone
      }
    }

    this.db.transaction(() => {
      this.db.prepare("DELETE FROM artifacts WHERE pack_id = ?").run(id);
      this.db.prepare("DELETE FROM pack_uploads WHERE pack_id = ?").run(id);
      this.db.prepare("DELETE FROM packs WHERE id = ?").run(id);
    })();

    return true;
  }

  /* ----------------------------------------------------------------- orders */

  recordOrder(order: OrderRow): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO orders (id, tool, price_usdt, payer_ref, status, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        order.id,
        order.tool,
        order.priceUsdt,
        order.payerRef,
        order.status,
        order.txHash ?? null,
        order.createdAt,
      );
  }

  orders(limit = 50): OrderRow[] {
    const rows = this.db
      .prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?")
      .all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: row["id"] as string,
      tool: row["tool"] as string,
      priceUsdt: row["price_usdt"] as number,
      payerRef: row["payer_ref"] as string,
      status: row["status"] as OrderStatus,
      ...(row["tx_hash"] ? { txHash: row["tx_hash"] as string } : {}),
      createdAt: row["created_at"] as number,
    }));
  }

  /** Revenue actually settled — real orders only, never a fabricated number. */
  revenueUsdt(): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(price_usdt), 0) AS total FROM orders WHERE status = 'paid'")
      .get() as { total: number };
    return row.total;
  }

  /** Demo runs started since a timestamp — the per-day allowance check. */
  demoRunsSince(sinceMs: number): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'demo' AND created_at >= ?")
      .get(sinceMs) as { n: number };
    return row.n;
  }

  /**
   * Honest live counters for /stats. Every number is computed from what the
   * store actually holds; when they are small they are shown small.
   */
  stats(): {
    packsCreated: number;
    sealsAnchored: number;
    tribunalRepairs: number;
    coverageGapsDisclosed: number;
    paidOrders: number;
    revenueUsdt: number;
  } {
    const packs = this.db.prepare("SELECT body FROM packs").all() as Array<{ body: string }>;
    let repairs = 0;
    let gaps = 0;
    for (const row of packs) {
      try {
        const pack = JSON.parse(row.body) as {
          quality?: { repairedCount?: number };
          coverageGaps?: unknown[];
        };
        repairs += pack.quality?.repairedCount ?? 0;
        gaps += pack.coverageGaps?.length ?? 0;
      } catch {
        // an unreadable row must never take the stats page down
      }
    }

    const anchored = this.db
      .prepare("SELECT COUNT(*) AS n FROM seals_pending WHERE anchored_at IS NOT NULL")
      .get() as { n: number };
    const paid = this.db
      .prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'")
      .get() as { n: number };

    return {
      packsCreated: packs.length,
      sealsAnchored: anchored.n,
      tribunalRepairs: repairs,
      coverageGapsDisclosed: gaps,
      paidOrders: paid.n,
      revenueUsdt: this.revenueUsdt(),
    };
  }

  /* --------------------------------------------------------- payment nonces */

  /** True if this nonce is fresh (and claims it). An EIP-3009 nonce is single-use. */
  claimNonce(nonce: string, payer: string, tool: string): boolean {
    try {
      this.db
        .prepare("INSERT INTO payment_nonces (nonce, payer, tool, used_at) VALUES (?, ?, ?, ?)")
        .run(nonce.toLowerCase(), payer.toLowerCase(), tool, Date.now());
      return true;
    } catch {
      return false; // primary-key collision: it has been spent already
    }
  }

  /**
   * Give a nonce back.
   *
   * We claim the nonce BEFORE settling (so two concurrent requests cannot both spend it),
   * but if the settlement then reverts — insufficient balance, a bad RPC minute — no money
   * moved, and the buyer's signed authorization is still perfectly good. Burning it would
   * force them to re-sign for a payment they already authorised and we simply failed to take.
   */
  releaseNonce(nonce: string): void {
    this.db.prepare("DELETE FROM payment_nonces WHERE nonce = ?").run(nonce.toLowerCase());
  }

  /* ------------------------------------------------------------------ seals */

  queueSeal(leaf: string, keepsakeId: string): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO seals_pending (leaf, keepsake_id, attempts, created_at) VALUES (?, ?, 0, ?)",
      )
      .run(leaf, keepsakeId, Date.now());
  }

  pendingSeals(limit = 20): PendingSeal[] {
    const rows = this.db
      .prepare("SELECT * FROM seals_pending WHERE anchored_at IS NULL AND attempts < 5 ORDER BY created_at LIMIT ?")
      .all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      leaf: row["leaf"] as string,
      keepsakeId: row["keepsake_id"] as string,
      attempts: row["attempts"] as number,
      ...(row["tx_hash"] ? { txHash: row["tx_hash"] as string } : {}),
    }));
  }

  markAnchored(leaves: string[], txHash: string, anchoredAt: number): void {
    const update = this.db.prepare(
      "UPDATE seals_pending SET tx_hash = ?, anchored_at = ? WHERE leaf = ?",
    );
    this.db.transaction(() => {
      for (const leaf of leaves) update.run(txHash, anchoredAt, leaf);
    })();
  }

  markSealAttempt(leaves: string[]): void {
    const update = this.db.prepare(
      "UPDATE seals_pending SET attempts = attempts + 1 WHERE leaf = ?",
    );
    this.db.transaction(() => {
      for (const leaf of leaves) update.run(leaf);
    })();
  }

  anchorOf(keepsakeId: string): PendingSeal | undefined {
    const row = this.db
      .prepare("SELECT * FROM seals_pending WHERE keepsake_id = ?")
      .get(keepsakeId) as Record<string, unknown> | undefined;
    if (!row) return undefined;

    return {
      leaf: row["leaf"] as string,
      keepsakeId: row["keepsake_id"] as string,
      attempts: row["attempts"] as number,
      ...(row["tx_hash"] ? { txHash: row["tx_hash"] as string } : {}),
      ...(row["anchored_at"] ? { anchoredAt: row["anchored_at"] as number } : {}),
    };
  }

  /* ---------------------------------------------------------------- storage */

  private pathFor(key: string): string {
    // Storage keys are ours, but never trust one into a path without pinning it down.
    const safe = key.replace(/\.\./g, "").replace(/^\/+/, "");
    const path = resolve(join(this.artifactDir, safe));
    if (!path.startsWith(this.artifactDir)) {
      throw new Error(`refusing to write outside the artifact directory: ${key}`);
    }
    return path;
  }

  private tokenFor(key: string, expires: number): string {
    return createHmac("sha256", this.urlSecret).update(`${key}:${expires}`).digest("hex").slice(0, 32);
  }

  signedUrlFor(key: string, ttlSeconds: number): string {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const token = this.tokenFor(key, expires);
    return `${this.baseUrl}/a/${encodeURIComponent(key)}?exp=${expires}&tok=${token}`;
  }

  /** Constant-time check, and an expiry that is actually enforced. */
  verifyToken(key: string, expires: number, token: string): boolean {
    if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;

    const expected = Buffer.from(this.tokenFor(key, expires));
    const given = Buffer.from(token);
    if (expected.length !== given.length) return false;

    return timingSafeEqual(expected, given);
  }

  /** The StoragePort the studios write through. */
  get storage(): StoragePort {
    return {
      put: async (key, bytes, _contentType) => {
        const path = this.pathFor(key);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes);
        return key;
      },
      get: async (key): Promise<StoredObject | undefined> => {
        try {
          const bytes = new Uint8Array(readFileSync(this.pathFor(key)));
          const contentType = key.endsWith(".png")
            ? "image/png"
            : key.endsWith(".svg")
              ? "image/svg+xml"
              : "application/octet-stream";
          return { bytes, contentType };
        } catch {
          return undefined;
        }
      },
      delete: async (key) => {
        rmSync(this.pathFor(key), { force: true });
      },
      signedUrl: async (key, ttlSeconds) => this.signedUrlFor(key, ttlSeconds),
    };
  }

  close(): void {
    this.db.close();
  }
}

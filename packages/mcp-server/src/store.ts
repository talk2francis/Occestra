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
import { sanitizeGaps, sanitizeTribunal, type Pack, type StoragePort, type StoredObject } from "@occestra/studio-core";

export type OrderStatus = "pending" | "paid" | "refused" | "failed" | "demo";

export type JobState = "queued" | "running" | "done" | "failed" | "cancelled";

export interface JobRow {
  id: string;
  tool: string;
  args: unknown;
  state: JobState;
  packId?: string;
  error?: string;
  attempts: number;
  orderId?: string;
  payerRef: string;
  priceUsdt: number;
  progress: Array<{ at: number; body: unknown }>;
  cancelling: boolean;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export type DemoRunState = "running" | "done" | "failed";

export interface DemoRunRow {
  id: string;
  tokenHash: string;
  tool: string;
  state: DemoRunState;
  events: Array<{ at: number; body: unknown }>;
  packId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export interface RefundRow {
  orderId: string;
  payerRef: string;
  amountUsdt: number;
  tool: string;
  reason: string;
  txHash?: string;
  paidAt?: number;
  createdAt: number;
}

const toJobRow = (row: Record<string, unknown>): JobRow => ({
  id: row["id"] as string,
  tool: row["tool"] as string,
  args: JSON.parse(String(row["args"])) as unknown,
  state: row["state"] as JobState,
  ...(row["pack_id"] ? { packId: row["pack_id"] as string } : {}),
  ...(row["error"] ? { error: row["error"] as string } : {}),
  attempts: row["attempts"] as number,
  ...(row["order_id"] ? { orderId: row["order_id"] as string } : {}),
  payerRef: row["payer_ref"] as string,
  priceUsdt: row["price_usdt"] as number,
  progress: JSON.parse(String(row["progress"] ?? "[]")) as Array<{ at: number; body: unknown }>,
  cancelling: row["cancelling"] === 1,
  createdAt: row["created_at"] as number,
  ...(row["started_at"] ? { startedAt: row["started_at"] as number } : {}),
  ...(row["finished_at"] ? { finishedAt: row["finished_at"] as number } : {}),
});

const toDemoRunRow = (row: Record<string, unknown>): DemoRunRow => ({
  id: row["id"] as string,
  tokenHash: row["token_hash"] as string,
  tool: row["tool"] as string,
  state: row["state"] as DemoRunState,
  events: JSON.parse(String(row["events"] ?? "[]")) as Array<{ at: number; body: unknown }>,
  ...(row["pack_id"] ? { packId: row["pack_id"] as string } : {}),
  ...(row["error"] ? { error: row["error"] as string } : {}),
  createdAt: row["created_at"] as number,
  updatedAt: row["updated_at"] as number,
  ...(row["finished_at"] ? { finishedAt: row["finished_at"] as number } : {}),
});

const toRefundRow = (row: Record<string, unknown>): RefundRow => ({
  orderId: row["order_id"] as string,
  payerRef: row["payer_ref"] as string,
  amountUsdt: row["amount_usdt"] as number,
  tool: row["tool"] as string,
  reason: row["reason"] as string,
  ...(row["tx_hash"] ? { txHash: row["tx_hash"] as string } : {}),
  ...(row["paid_at"] ? { paidAt: row["paid_at"] as number } : {}),
  createdAt: row["created_at"] as number,
});

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

export interface GallerySubmissionRow {
  packId: string;
  sourcePackId: string;
  studio: Pack["studio"];
  displayTitle: string;
  coverArtifactId?: string;
  visibleArtifactIds: string[];
  createdAt: number;
  duplicateCount: number;
}

export interface GalleryActivity {
  privatePacks: number;
  anchoredPrivatePacks: number;
  publicShowcases: number;
}

export interface StoreConfig {
  dataDir?: string;
  /** Signs artifact URLs. Falls back to an ephemeral key, which is fine for dev. */
  urlSecret?: string;
  baseUrl?: string;
}

/** One consensus review, as stored. Evidence fields are write-once — see createConsensusReview. */
export interface ConsensusReviewRow {
  reviewId: string;
  artifactId: string;
  keepsakeId?: string;
  artifactHash: string;
  profile: string;
  oqsVersion: string;
  localVerdict: string;
  /** The exact bytes served at the evidence URL. Never regenerated. */
  evidenceJson: string;
  evidenceHash: string;
  network: string;
  contractAddress?: string;
  transactionHash?: string;
  status: string;
  decision?: string;
  scoreBand?: string;
  criticalFailure?: string;
  failureCodes: string[];
  submittedAt?: string;
  finalizedAt?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
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
    // WAL allows concurrent readers with one writer; busy_timeout makes a second writer WAIT for
    // the lock (up to 5s) instead of throwing SQLITE_BUSY. This matters whenever a second process
    // touches the store — the gallery reseed writing while the live ASP serves, for instance.
    this.db.pragma("busy_timeout = 5000");
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

      -- The event log of a run, kept so an operator can INSPECT what happened
      -- instead of paying to reproduce it. Written once, at the end of a run.
      CREATE TABLE IF NOT EXISTS pack_events (
        pack_id TEXT NOT NULL,
        seq     INTEGER NOT NULL,
        at      INTEGER NOT NULL,
        body    TEXT NOT NULL,
        PRIMARY KEY (pack_id, seq)
      );

      -- Who has spent the free Studio allowance. The daily cap alone is a shared pool:
      -- one visitor (or one script) can drain the whole day's demo budget before anyone
      -- else arrives, and every subsequent visitor sees a dead button. Capping per caller
      -- as well means one person can no longer spend everybody's allowance.
      CREATE TABLE IF NOT EXISTS demo_hits (
        ip TEXT NOT NULL,
        at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_demo_hits ON demo_hits(ip, at);

      -- Browser-recoverable Studio runs. The raw recovery token never reaches disk; a random
      -- capability held in localStorage is the only way to read the event log back. This is not
      -- keyed by IP: households share IPs, mobile networks rotate them, and neither is identity.
      CREATE TABLE IF NOT EXISTS demo_runs (
        id          TEXT PRIMARY KEY,
        token_hash  TEXT NOT NULL,
        tool        TEXT NOT NULL,
        state       TEXT NOT NULL,
        events      TEXT NOT NULL DEFAULT '[]',
        pack_id     TEXT,
        error       TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        finished_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_demo_runs_created ON demo_runs(created_at);

      -- Replay protection for x402: an EIP-3009 nonce is single-use, forever.
      CREATE TABLE IF NOT EXISTS payment_nonces (
        nonce      TEXT PRIMARY KEY,
        payer      TEXT NOT NULL,
        tool       TEXT NOT NULL,
        used_at    INTEGER NOT NULL
      );

      -- Async pack jobs. A launch kit takes minutes; a marketplace client that waits
      -- synchronously for it will time out, retry, and pay twice for work it already has.
      -- The job outlives the HTTP request AND the process: state lives here, not in memory.
      CREATE TABLE IF NOT EXISTS jobs (
        id           TEXT PRIMARY KEY,
        tool         TEXT NOT NULL,
        args         TEXT NOT NULL,
        state        TEXT NOT NULL,      -- queued | running | done | failed | cancelled
        pack_id      TEXT,
        error        TEXT,
        attempts     INTEGER NOT NULL DEFAULT 0,
        order_id     TEXT,
        payer_ref    TEXT NOT NULL DEFAULT 'unknown',
        price_usdt   REAL NOT NULL DEFAULT 0,
        progress     TEXT NOT NULL DEFAULT '[]',
        cancelling   INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL,
        started_at   INTEGER,
        finished_at  INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state, created_at);

      -- Idempotency. A buyer whose connection dropped will retry, and a retry must not be a
      -- second charge for a pack we already made. The response is stored under the key and
      -- replayed verbatim; the gate is never consulted a second time.
      CREATE TABLE IF NOT EXISTS idempotency (
        key          TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        tool         TEXT NOT NULL,
        state        TEXT NOT NULL,      -- in_flight | done
        response     TEXT,
        created_at   INTEGER NOT NULL,
        completed_at INTEGER
      );

      -- What we took and did not deliver.
      --
      -- Payment settles BEFORE the work runs — that is what x402 is. So a pipeline that
      -- throws leaves money in our treasury and nothing in the buyer's hands. Silence there
      -- would be theft with extra steps. Every such failure books a debt, in public, at
      -- /health and /stats, and it stays booked until it is paid back on chain.
      CREATE TABLE IF NOT EXISTS refunds (
        order_id    TEXT PRIMARY KEY,
        payer_ref   TEXT NOT NULL,
        amount_usdt REAL NOT NULL,
        tool        TEXT NOT NULL,
        reason      TEXT NOT NULL,
        tx_hash     TEXT,
        paid_at     INTEGER,
        created_at  INTEGER NOT NULL
      );

      -- Private keepsakes. The salt makes the on-chain commitment keccak256(salt || manifest),
      -- so the anchored leaf reveals nothing and links to nothing without it. The salt is stored
      -- HERE, never on chain and never in the public pack, and it is released only to a caller
      -- who presents the pack's owner token. The token itself is stored as a hash — a leak of
      -- this table must not hand someone the keys to every private pack.
      CREATE TABLE IF NOT EXISTS pack_private (
        pack_id          TEXT PRIMARY KEY,
        salt             TEXT NOT NULL,
        owner_token_hash TEXT NOT NULL,
        created_at       INTEGER NOT NULL
      );

      -- Owner-approved Gallery entries. A private Remember pack is NEVER referenced publicly:
      -- source_pack_id stays server-side and pack_id points at a separate redacted public
      -- showcase. Management tokens are hashed, just like private-pack owner tokens.
      CREATE TABLE IF NOT EXISTS gallery_submissions (
        pack_id              TEXT PRIMARY KEY,
        source_pack_id       TEXT NOT NULL UNIQUE,
        studio               TEXT NOT NULL,
        display_title        TEXT NOT NULL,
        cover_artifact_id    TEXT,
        visible_artifact_ids TEXT NOT NULL,
        management_hash      TEXT NOT NULL,
        created_at           INTEGER NOT NULL,
        withdrawn_at         INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_gallery_active ON gallery_submissions(withdrawn_at, created_at);

      -- Every upload, with when it arrived. Used to auto-purge uploads that were never turned
      -- into a keepsake: a stranger's photograph must not linger on our disk forever because
      -- they changed their mind after the /uploads call and never finished.
      CREATE TABLE IF NOT EXISTS uploads (
        key        TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_uploads_age ON uploads(created_at);

      -- Audit log for the events that touch private data or provenance: a private salt reveal,
      -- a deletion, a seal anchored. NO PRIVATE CONTENT lands here — only the event, the pack id,
      -- and a hash of the caller's address. It is the record of who touched what, kept so that a
      -- deletion or an access can be accounted for without itself becoming a privacy leak.
      CREATE TABLE IF NOT EXISTS audit_log (
        seq     INTEGER PRIMARY KEY AUTOINCREMENT,
        at      INTEGER NOT NULL,
        event   TEXT NOT NULL,
        pack_id TEXT,
        actor   TEXT,
        detail  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_pack ON audit_log(pack_id, at);

      -- GenLayer consensus reviews. The evidence columns are write-once by contract, not
      -- just by convention: validators fetched those exact bytes and ruled on them, so
      -- rewriting them would retroactively change what was adjudicated. A re-review after
      -- repair gets a NEW review_id and leaves this row alone.
      CREATE TABLE IF NOT EXISTS consensus_reviews (
        review_id            TEXT PRIMARY KEY,
        artifact_id          TEXT NOT NULL,
        keepsake_id          TEXT,
        artifact_hash        TEXT NOT NULL,
        profile              TEXT NOT NULL,
        oqs_version          TEXT NOT NULL,
        local_verdict        TEXT NOT NULL,
        evidence_json        TEXT NOT NULL,
        evidence_hash        TEXT NOT NULL,
        public_for_consensus INTEGER NOT NULL,
        network              TEXT NOT NULL,
        contract_address     TEXT,
        transaction_hash     TEXT,
        status               TEXT NOT NULL,
        decision             TEXT,
        score_band           TEXT,
        critical_failure     TEXT,
        failure_codes_json   TEXT,
        submitted_at         TEXT,
        finalized_at         TEXT,
        error_code           TEXT,
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_consensus_artifact ON consensus_reviews(artifact_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_consensus_status ON consensus_reviews(status);

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

  /* ------------------------------------------------------------ demo credits */

  /** Record that this caller spent one free run. Called only once the run is authorized. */
  recordDemoHit(ip: string, at = Date.now()): void {
    this.db.prepare("INSERT INTO demo_hits (ip, at) VALUES (?, ?)").run(ip, at);
  }

  /** How many free runs this caller has taken in the window. */
  demoRunsByIpSince(ip: string, sinceMs: number): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM demo_hits WHERE ip = ? AND at >= ?")
      .get(ip, sinceMs) as { n: number };
    return row.n;
  }

  /** Start a recoverable Studio run. Tokens are already SHA-256 hashed by the caller. */
  createDemoRun(input: { id: string; tokenHash: string; tool: string }, now = Date.now()): void {
    // A recovery window, not a new archive of somebody's occasion. Finished and abandoned
    // browser runs age out after 48 hours; the pack itself keeps its normal retention rules.
    this.db.prepare("DELETE FROM demo_runs WHERE created_at < ?").run(now - 48 * 60 * 60 * 1000);
    this.db
      .prepare(
        "INSERT INTO demo_runs (id, token_hash, tool, state, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, ?)",
      )
      .run(input.id, input.tokenHash, input.tool, now, now);
  }

  appendDemoRunEvent(id: string, body: unknown, at = Date.now()): void {
    const row = this.db.prepare("SELECT events FROM demo_runs WHERE id = ?").get(id) as
      | { events: string }
      | undefined;
    if (!row) return;
    const events = JSON.parse(row.events) as Array<{ at: number; body: unknown }>;
    events.push({ at, body });
    this.db
      .prepare("UPDATE demo_runs SET events = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(events.slice(-250)), at, id);
  }

  finishDemoRun(id: string, packId: string, now = Date.now()): void {
    this.db
      .prepare("UPDATE demo_runs SET state = 'done', pack_id = ?, updated_at = ?, finished_at = ? WHERE id = ?")
      .run(packId, now, now, id);
  }

  failDemoRun(id: string, error: string, now = Date.now()): void {
    this.db
      .prepare("UPDATE demo_runs SET state = 'failed', error = ?, updated_at = ?, finished_at = ? WHERE id = ?")
      .run(error, now, now, id);
  }

  recoverDemoRun(id: string, tokenHash: string): DemoRunRow | undefined {
    let row = this.db
      .prepare("SELECT * FROM demo_runs WHERE id = ? AND token_hash = ?")
      .get(id, tokenHash) as Record<string, unknown> | undefined;
    // A network interruption leaves the pipeline alive, but a process restart cannot. Do not
    // make a returning browser poll a ghost forever: 15 minutes without one persisted event is
    // safely beyond the documented one-to-three-minute run window.
    if (row?.["state"] === "running" && Date.now() - Number(row["updated_at"]) > 15 * 60 * 1000) {
      const now = Date.now();
      this.db
        .prepare(
          "UPDATE demo_runs SET state = 'failed', error = ?, updated_at = ?, finished_at = ? WHERE id = ?",
        )
        .run("The Studio service restarted before this run finished. Nothing was charged.", now, now, id);
      row = this.db
        .prepare("SELECT * FROM demo_runs WHERE id = ? AND token_hash = ?")
        .get(id, tokenHash) as Record<string, unknown> | undefined;
    }
    return row ? toDemoRunRow(row) : undefined;
  }

  /* ----------------------------------------------------------------- events */

  /** The run's event log, written once when the run ends. */
  saveEvents(packId: string, events: { at: number; body: unknown }[]): void {
    const insert = this.db.prepare(
      "INSERT OR REPLACE INTO pack_events (pack_id, seq, at, body) VALUES (?, ?, ?, ?)",
    );
    this.db.transaction(() => {
      events.forEach((event, seq) => {
        insert.run(packId, seq, event.at, JSON.stringify(event.body));
      });
    })();
  }

  eventsFor(packId: string): { seq: number; at: number; body: unknown }[] {
    const rows = this.db
      .prepare("SELECT seq, at, body FROM pack_events WHERE pack_id = ? ORDER BY seq")
      .all(packId) as { seq: number; at: number; body: string }[];
    return rows.map((row) => ({ seq: row.seq, at: row.at, body: JSON.parse(row.body) as unknown }));
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

    // A PRIVATE keepsake shows its provenance, not its contents. The point of the whole product
    // is that a memory can be PROVEN without being PUBLISHED: anyone can confirm it was sealed and
    // anchored, but the artifacts, the story, and the manifest belong to the owner alone. The
    // on-chain leaf is salted, so even the hash reveals nothing.
    if (this.isPrivate(id)) {
      return {
        id: pack.id,
        studio: pack.studio,
        createdAt: pack.createdAt,
        private: true,
        note: "This is a private keepsake. Its contents are shown only to its owner. Its seal, below, is anyone's to verify — the on-chain commitment is salted, so it proves the keepsake exists without revealing anything about it.",
        seal: pack.seal ? { ...pack.seal, salted: Boolean(pack.seal.salted) } : undefined,
      };
    }

    return {
      id: pack.id,
      studio: pack.studio,
      createdAt: pack.createdAt,
      quality: pack.quality,
      // Sanitized at RENDER time, not write time: packs already in the store were
      // written with raw provider errors inside them, and this stops republishing them.
      coverageGaps: sanitizeGaps(pack.coverageGaps),
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
        tribunal: sanitizeTribunal(artifact.tribunal),
        // Shown, never hidden: the buyer is told what we owed them and did not deliver.
        ...(artifact.undelivered ? { undelivered: artifact.undelivered } : {}),
      })),
      seal: pack.seal,
    };
  }

  /**
   * A privacy-safe pulse of recent finished work for the public landing page.
   *
   * Titles are deliberately NOT returned: even a public pack can contain a
   * person's name in its first artifact title, and a ticker is not the place
   * to republish it. The descriptor is derived from studio + delivered count;
   * private packs are excluded in SQL before their JSON is even parsed.
   */
  recentPublicSealedPacks(limit = 8): Array<{
    id: string;
    studio: Pack["studio"];
    createdAt: string;
    descriptor: string;
    deliveredCount: number;
  }> {
    const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
    const rows = this.db
      .prepare(
        `SELECT p.body FROM packs p
         WHERE NOT EXISTS (SELECT 1 FROM pack_private private WHERE private.pack_id = p.id)
         ORDER BY p.created_at DESC
         LIMIT ?`,
      )
      .all(safeLimit * 4) as Array<{ body: string }>;

    const recent: Array<{
      id: string;
      studio: Pack["studio"];
      createdAt: string;
      descriptor: string;
      deliveredCount: number;
    }> = [];

    for (const row of rows) {
      let pack: Pack;
      try {
        pack = JSON.parse(row.body) as Pack;
      } catch {
        continue;
      }
      if (!pack.seal) continue;
      const deliveredCount = pack.artifacts.filter((artifact) => !artifact.undelivered).length;
      const studioName = pack.studio[0]?.toUpperCase() + pack.studio.slice(1);
      recent.push({
        id: pack.id,
        studio: pack.studio,
        createdAt: pack.createdAt,
        descriptor: `${studioName} pack · ${deliveredCount} delivered artifact${deliveredCount === 1 ? "" : "s"}`,
        deliveredCount,
      });
      if (recent.length >= safeLimit) break;
    }

    return recent;
  }

  /* --------------------------------------------------------------- gallery */

  gallerySubmissionForSource(sourcePackId: string): GallerySubmissionRow | undefined {
    const row = this.db
      .prepare("SELECT * FROM gallery_submissions WHERE source_pack_id = ? AND withdrawn_at IS NULL")
      .get(sourcePackId) as Record<string, unknown> | undefined;
    return row ? this.toGallerySubmission(row, 1) : undefined;
  }

  saveGallerySubmission(input: {
    packId: string;
    sourcePackId: string;
    studio: Pack["studio"];
    displayTitle: string;
    coverArtifactId?: string;
    visibleArtifactIds: string[];
    managementToken: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO gallery_submissions
          (pack_id, source_pack_id, studio, display_title, cover_artifact_id,
           visible_artifact_ids, management_hash, created_at, withdrawn_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        input.packId,
        input.sourcePackId,
        input.studio,
        input.displayTitle,
        input.coverArtifactId ?? null,
        JSON.stringify(input.visibleArtifactIds),
        this.hashOwnerToken(input.managementToken),
        Date.now(),
      );
  }

  /** Active submissions, newest per normalized title. Older duplicates stay stored, not promoted. */
  gallerySubmissions(limit = 24): GallerySubmissionRow[] {
    const safeLimit = Math.max(1, Math.min(60, Math.trunc(limit)));
    const rows = this.db
      .prepare("SELECT * FROM gallery_submissions WHERE withdrawn_at IS NULL ORDER BY created_at DESC")
      .all() as Array<Record<string, unknown>>;
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const key = String(row["display_title"]).trim().toLocaleLowerCase();
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
    return [...groups.values()]
      .slice(0, safeLimit)
      .map((group) => this.toGallerySubmission(group[0]!, group.length));
  }

  withdrawGallerySubmission(packId: string, managementToken: string): boolean {
    const row = this.db
      .prepare("SELECT management_hash FROM gallery_submissions WHERE pack_id = ? AND withdrawn_at IS NULL")
      .get(packId) as { management_hash: string } | undefined;
    if (!row) return false;
    const expected = Buffer.from(row.management_hash);
    const given = Buffer.from(this.hashOwnerToken(managementToken));
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    const result = this.db
      .prepare("UPDATE gallery_submissions SET withdrawn_at = ? WHERE pack_id = ? AND withdrawn_at IS NULL")
      .run(Date.now(), packId);
    return result.changes === 1;
  }

  galleryActivity(): GalleryActivity {
    const counts = this.db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM pack_private) AS private_packs,
          (SELECT COUNT(*) FROM pack_private pp
             JOIN seals_pending sp ON sp.keepsake_id = pp.pack_id
            WHERE sp.anchored_at IS NOT NULL) AS anchored_private,
          (SELECT COUNT(*) FROM gallery_submissions gs
            WHERE gs.withdrawn_at IS NULL AND gs.pack_id <> gs.source_pack_id) AS public_showcases`,
      )
      .get() as { private_packs: number; anchored_private: number; public_showcases: number };
    return {
      privatePacks: counts.private_packs,
      anchoredPrivatePacks: counts.anchored_private,
      publicShowcases: counts.public_showcases,
    };
  }

  private toGallerySubmission(row: Record<string, unknown>, duplicateCount: number): GallerySubmissionRow {
    const visible = JSON.parse(String(row["visible_artifact_ids"] ?? "[]")) as unknown;
    return {
      packId: String(row["pack_id"]),
      sourcePackId: String(row["source_pack_id"]),
      studio: row["studio"] as Pack["studio"],
      displayTitle: String(row["display_title"]),
      ...(row["cover_artifact_id"] ? { coverArtifactId: String(row["cover_artifact_id"]) } : {}),
      visibleArtifactIds: Array.isArray(visible) ? visible.filter((id): id is string => typeof id === "string") : [],
      createdAt: Number(row["created_at"]),
      duplicateCount,
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
      this.db.prepare("DELETE FROM pack_private WHERE pack_id = ?").run(id);
      this.db.prepare("DELETE FROM packs WHERE id = ?").run(id);
    })();

    return true;
  }

  /* ---------------------------------------------------------------- styles */

  /**
   * A real, finished, PASSING example of each House Style — for the style catalog.
   *
   * Real work only. A catalog illustrated with the prettiest thing we ever made, cherry-picked
   * and unlabelled, is a portfolio; a catalog that shows you the most recent artifact that
   * actually passed the Tribunal is evidence. If a style has never produced a passing artifact,
   * it shows nothing — and says so — rather than borrowing one from a style that did.
   */
  styleExamples(): Record<string, { keepsakeId: string; kind: string; uri: string }> {
    const rows = this.db
      .prepare("SELECT body FROM packs ORDER BY created_at DESC LIMIT 200")
      .all() as Array<{ body: string }>;

    const found: Record<string, { keepsakeId: string; kind: string; uri: string }> = {};

    for (const row of rows) {
      let pack: Pack;
      try {
        pack = JSON.parse(row.body) as Pack;
      } catch {
        continue; // one unreadable row must never take the catalog down
      }

      for (const artifact of pack.artifacts) {
        if (!artifact.styleId || !artifact.uri || artifact.format !== "png") continue;
        if (found[artifact.styleId]) continue;
        if (artifact.undelivered) continue; // never illustrate a style with a failure
        // The pack's own tribunal report, as it was written. `pass` is the only field we need.
        const report = artifact.tribunal as { pass?: boolean } | undefined;
        if (report && report.pass === false) continue; // nor with a fail

        found[artifact.styleId] = {
          keepsakeId: pack.id,
          kind: artifact.kind,
          uri: artifact.uri,
        };
      }
    }

    return found;
  }

  /* -------------------------------------------------------------- uploads */

  /** Record an upload's arrival, so an abandoned one can be swept later. */
  recordUpload(key: string, at = Date.now()): void {
    this.db.prepare("INSERT OR REPLACE INTO uploads (key, created_at) VALUES (?, ?)").run(key, at);
  }

  /**
   * Purge uploads older than `olderThanMs` that were never linked to a pack. A finished keepsake
   * links its uploads (see linkUploads), so a linked key is safe; an unlinked key past the cutoff
   * is someone who uploaded and walked away, and it does not get to live on our disk indefinitely.
   * Returns the keys removed, for the audit log.
   */
  purgeAbandonedUploads(olderThanMs: number, now = Date.now()): string[] {
    const cutoff = now - olderThanMs;
    const rows = this.db
      .prepare(
        `SELECT u.key AS key FROM uploads u
         WHERE u.created_at < ?
           AND NOT EXISTS (SELECT 1 FROM pack_uploads p WHERE p.key = u.key)`,
      )
      .all(cutoff) as Array<{ key: string }>;

    const removed: string[] = [];
    for (const { key } of rows) {
      try {
        rmSync(this.pathFor(key), { force: true });
      } catch {
        // already gone
      }
      this.db.prepare("DELETE FROM uploads WHERE key = ?").run(key);
      removed.push(key);
    }
    return removed;
  }

  /* ---------------------------------------------------------------- audit */

  /**
   * Record an event that touched private data or provenance. `actor` is expected to be an
   * ALREADY-HASHED caller reference — this method never sees a raw address — and `detail` must
   * never carry private content: an id and a category, never a name or a photograph.
   */
  audit(event: string, opts: { packId?: string; actor?: string; detail?: string } = {}): void {
    this.db
      .prepare("INSERT INTO audit_log (at, event, pack_id, actor, detail) VALUES (?, ?, ?, ?, ?)")
      .run(Date.now(), event, opts.packId ?? null, opts.actor ?? null, opts.detail ?? null);
  }

  auditFor(packId: string): Array<{ at: number; event: string; detail?: string }> {
    const rows = this.db
      .prepare("SELECT at, event, detail FROM audit_log WHERE pack_id = ? ORDER BY at")
      .all(packId) as Array<{ at: number; event: string; detail: string | null }>;
    return rows.map((row) => ({ at: row.at, event: row.event, ...(row.detail ? { detail: row.detail } : {}) }));
  }

  /** A short hash of a caller reference, so the audit log records WHO without recording an address. */
  actorHash(reference: string): string {
    return createHmac("sha256", this.urlSecret).update(`actor:${reference}`).digest("hex").slice(0, 16);
  }

  /* ------------------------------------------------------------- privacy */

  /** Record a private pack's salt and the hash of its owner token. */
  savePrivate(packId: string, salt: string, ownerTokenHash: string): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO pack_private (pack_id, salt, owner_token_hash, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(packId, salt, ownerTokenHash, Date.now());
  }

  /** Is this pack private? True iff we are holding a salt for it. */
  isPrivate(packId: string): boolean {
    const row = this.db.prepare("SELECT 1 FROM pack_private WHERE pack_id = ?").get(packId);
    return Boolean(row);
  }

  /** The salt, for internal verification. Never returned over a public boundary. */
  saltFor(packId: string): string | undefined {
    const row = this.db.prepare("SELECT salt FROM pack_private WHERE pack_id = ?").get(packId) as
      | { salt: string }
      | undefined;
    return row?.salt;
  }

  /**
   * Does this token own this pack? Constant-time compare against the stored hash. The one gate
   * that stands between a stranger with a keepsake id and the salt (or, in V2-2.4, deletion).
   */
  ownsPack(packId: string, ownerToken: string): boolean {
    const row = this.db.prepare("SELECT owner_token_hash FROM pack_private WHERE pack_id = ?").get(packId) as
      | { owner_token_hash: string }
      | undefined;
    if (!row) return false;

    const expected = Buffer.from(row.owner_token_hash);
    const given = Buffer.from(createHmac("sha256", this.urlSecret).update(ownerToken).digest("hex"));
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  /** Hash an owner token the same way ownsPack checks it. */
  hashOwnerToken(token: string): string {
    return createHmac("sha256", this.urlSecret).update(token).digest("hex");
  }

  /** Release the salt to a caller who proves ownership. */
  revealSalt(packId: string, ownerToken: string): string | undefined {
    return this.ownsPack(packId, ownerToken) ? this.saltFor(packId) : undefined;
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

  /**
   * Demo runs started since a timestamp — the per-day allowance check.
   * Only payer_ref='demo' counts: internal gallery seeding is recorded with
   * payer_ref='seed' so it can never eat a visitor's allowance.
   */
  demoRunsSince(sinceMs: number): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'demo' AND payer_ref = 'demo' AND created_at >= ?")
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
    refundsOwed: number;
    refundsOwedUsdt: number;
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

    // Published because it is the number we would most like to hide.
    const owed = this.refundsOwed();

    return {
      packsCreated: packs.length,
      sealsAnchored: anchored.n,
      tribunalRepairs: repairs,
      coverageGapsDisclosed: gaps,
      paidOrders: paid.n,
      revenueUsdt: this.revenueUsdt(),
      refundsOwed: owed.length,
      refundsOwedUsdt: Number(owed.reduce((sum, r) => sum + r.amountUsdt, 0).toFixed(6)),
    };
  }

  /* ------------------------------------------------------------------- jobs */

  createJob(job: {
    id: string;
    tool: string;
    args: unknown;
    payerRef: string;
    priceUsdt: number;
    orderId?: string;
  }): void {
    this.db
      .prepare(
        "INSERT INTO jobs (id, tool, args, state, payer_ref, price_usdt, order_id, created_at) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)",
      )
      .run(
        job.id,
        job.tool,
        JSON.stringify(job.args),
        job.payerRef,
        job.priceUsdt,
        job.orderId ?? null,
        Date.now(),
      );
  }

  getJob(id: string): JobRow | undefined {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? toJobRow(row) : undefined;
  }

  /**
   * Take the next queued job, atomically.
   *
   * SELECT-then-UPDATE inside one transaction, and the UPDATE re-asserts state='queued' —
   * so if two workers race, exactly one sees changes===1 and the loser tries again. This is
   * the whole of the concurrency control, and it is enough because SQLite serialises writes.
   */
  claimJob(): JobRow | undefined {
    return this.db.transaction((): JobRow | undefined => {
      const row = this.db
        .prepare("SELECT * FROM jobs WHERE state = 'queued' ORDER BY created_at LIMIT 1")
        .get() as Record<string, unknown> | undefined;
      if (!row) return undefined;

      const claimed = this.db
        .prepare(
          "UPDATE jobs SET state = 'running', attempts = attempts + 1, started_at = ? WHERE id = ? AND state = 'queued'",
        )
        .run(Date.now(), row["id"]);

      if (claimed.changes !== 1) return undefined;
      return this.getJob(row["id"] as string);
    })();
  }

  /** Live counters for /health: how deep the queue is and how long the head has waited. */
  jobQueueHealth(now = Date.now()): { queued: number; running: number; oldestWaitSeconds: number } {
    const row = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(state = 'queued'), 0)  AS queued,
           COALESCE(SUM(state = 'running'), 0) AS running,
           MIN(CASE WHEN state = 'queued' THEN created_at END) AS oldest
         FROM jobs`,
      )
      .get() as { queued: number; running: number; oldest: number | null };

    return {
      queued: row.queued,
      running: row.running,
      oldestWaitSeconds: row.oldest ? Math.round((now - row.oldest) / 1000) : 0,
    };
  }

  appendJobProgress(id: string, event: unknown, at = Date.now()): void {
    const row = this.db.prepare("SELECT progress FROM jobs WHERE id = ?").get(id) as
      | { progress: string }
      | undefined;
    if (!row) return;

    const events = JSON.parse(row.progress) as unknown[];
    // A launch kit emits a few dozen events; a runaway loop must not grow the row without
    // bound. The newest are the ones anybody reads.
    events.push({ at, body: event });
    const trimmed = events.slice(-200);

    this.db.prepare("UPDATE jobs SET progress = ? WHERE id = ?").run(JSON.stringify(trimmed), id);
  }

  finishJob(id: string, packId: string): void {
    this.db
      .prepare("UPDATE jobs SET state = 'done', pack_id = ?, finished_at = ? WHERE id = ?")
      .run(packId, Date.now(), id);
  }

  failJob(id: string, error: string): void {
    this.db
      .prepare("UPDATE jobs SET state = 'failed', error = ?, finished_at = ? WHERE id = ?")
      .run(error, Date.now(), id);
  }

  /** Back into the queue for another attempt — used after a crash, and after a lost race. */
  requeueJob(id: string): void {
    this.db
      .prepare("UPDATE jobs SET state = 'queued', started_at = NULL WHERE id = ?")
      .run(id);
  }

  /**
   * Ask a running job to stop. It is a REQUEST, not a kill: the worker checks between
   * stages, because a half-torn-down pipeline would leave orphaned bytes on disk. A queued
   * job cancels immediately, since nothing has been spent on it yet.
   */
  requestCancel(id: string): "cancelled" | "cancelling" | "not_cancellable" | "unknown" {
    const job = this.getJob(id);
    if (!job) return "unknown";

    if (job.state === "queued") {
      this.db
        .prepare("UPDATE jobs SET state = 'cancelled', finished_at = ? WHERE id = ? AND state = 'queued'")
        .run(Date.now(), id);
      return "cancelled";
    }

    if (job.state === "running") {
      this.db.prepare("UPDATE jobs SET cancelling = 1 WHERE id = ?").run(id);
      return "cancelling";
    }

    return "not_cancellable"; // done, failed, or already cancelled — nothing left to stop
  }

  isCancelling(id: string): boolean {
    const row = this.db.prepare("SELECT cancelling FROM jobs WHERE id = ?").get(id) as
      | { cancelling: number }
      | undefined;
    return row?.cancelling === 1;
  }

  markCancelled(id: string): void {
    this.db
      .prepare("UPDATE jobs SET state = 'cancelled', finished_at = ? WHERE id = ?")
      .run(Date.now(), id);
  }

  /**
   * RESTART SURVIVAL. A job that was 'running' when the process died did not finish, and
   * nobody is coming back for it — the in-memory promise went with the process. It was paid
   * for, so it is requeued rather than dropped: re-running costs US the provider spend
   * again, which is the right party to charge for our own crash.
   *
   * Twice is enough. A job that dies twice is not unlucky, it is poisoned — a brief that
   * crashes the pipeline every time would otherwise loop forever, burning money on each
   * pass. It is failed honestly and the money is booked as owed.
   */
  recoverJobs(maxAttempts = 2): { requeued: string[]; abandoned: string[] } {
    const rows = this.db
      .prepare("SELECT * FROM jobs WHERE state = 'running'")
      .all() as Array<Record<string, unknown>>;

    const requeued: string[] = [];
    const abandoned: string[] = [];

    for (const row of rows) {
      const job = toJobRow(row);
      if (job.attempts >= maxAttempts) {
        this.failJob(job.id, "the run did not survive a restart, twice — it will not be retried again");
        abandoned.push(job.id);
      } else {
        this.requeueJob(job.id);
        requeued.push(job.id);
      }
    }

    return { requeued, abandoned };
  }

  /* ---------------------------------------------------------- idempotency */

  /**
   * Claim an idempotency key.
   *
   * "fresh"     — nobody has used this key; the caller may do the work.
   * "replay"    — the identical request already completed; hand back what it returned.
   * "in_flight" — the identical request is running right now; do NOT start a second one.
   * "conflict"  — the key was used for a DIFFERENT request. Refusing is the only safe
   *               answer: silently doing the new work would charge for it under an old key,
   *               and silently replaying the old response would answer a question nobody asked.
   */
  claimIdempotencyKey(
    key: string,
    requestHash: string,
    tool: string,
    options: { bindRequest?: boolean } = {},
  ):
    | { status: "fresh" }
    | { status: "replay"; response: unknown }
    | { status: "in_flight" }
    | { status: "conflict" } {
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT * FROM idempotency WHERE key = ?").get(key) as
        | Record<string, unknown>
        | undefined;

      if (!row) {
        this.db
          .prepare(
            "INSERT INTO idempotency (key, request_hash, tool, state, created_at) VALUES (?, ?, ?, 'in_flight', ?)",
          )
          .run(key, requestHash, tool, Date.now());
        return { status: "fresh" as const };
      }

      // A key the BUYER chose is bound to the request they chose it for: reusing it for
      // different work is their bug and refusing is the only safe answer. A key WE derived
      // from their payment nonce is bound to the payment instead, and must not be — the
      // nonce buys exactly one answer, and they are entitled to it however their client
      // re-serializes the body on retry. Binding it to a request hash is what made a dropped
      // response permanently unrecoverable in the 2026-07-28 test: same nonce, byte-different
      // body, 422, money gone.
      if (options.bindRequest !== false && row["request_hash"] !== requestHash) {
        return { status: "conflict" as const };
      }
      if (row["tool"] !== tool) return { status: "conflict" as const };

      if (row["state"] === "done") {
        return {
          status: "replay" as const,
          response: JSON.parse(String(row["response"] ?? "null")) as unknown,
        };
      }

      return { status: "in_flight" as const };
    })();
  }

  completeIdempotencyKey(key: string, response: unknown): void {
    this.db
      .prepare("UPDATE idempotency SET state = 'done', response = ?, completed_at = ? WHERE key = ?")
      .run(JSON.stringify(response), Date.now(), key);
  }

  /** The work never happened, so the key must not stick — the buyer is entitled to retry. */
  releaseIdempotencyKey(key: string): void {
    this.db.prepare("DELETE FROM idempotency WHERE key = ? AND state = 'in_flight'").run(key);
  }

  /* ---------------------------------------------------------------- refunds */

  /** Book a debt. Idempotent on the order: one failed order is owed exactly one refund. */
  oweRefund(refund: {
    orderId: string;
    payerRef: string;
    amountUsdt: number;
    tool: string;
    reason: string;
  }): void {
    if (refund.amountUsdt <= 0 || refund.payerRef === "dev" || refund.payerRef === "demo") return;

    this.db
      .prepare(
        "INSERT OR IGNORE INTO refunds (order_id, payer_ref, amount_usdt, tool, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(refund.orderId, refund.payerRef, refund.amountUsdt, refund.tool, refund.reason, Date.now());
  }

  refundsOwed(): RefundRow[] {
    const rows = this.db
      .prepare("SELECT * FROM refunds WHERE paid_at IS NULL ORDER BY created_at")
      .all() as Array<Record<string, unknown>>;
    return rows.map(toRefundRow);
  }

  refundFor(orderId: string): RefundRow | undefined {
    const row = this.db.prepare("SELECT * FROM refunds WHERE order_id = ?").get(orderId) as
      | Record<string, unknown>
      | undefined;
    return row ? toRefundRow(row) : undefined;
  }

  markRefunded(orderId: string, txHash: string): void {
    this.db
      .prepare("UPDATE refunds SET tx_hash = ?, paid_at = ? WHERE order_id = ?")
      .run(txHash, Date.now(), orderId);
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
    const packIdOf = this.db.prepare("SELECT keepsake_id FROM seals_pending WHERE leaf = ?");
    this.db.transaction(() => {
      for (const leaf of leaves) {
        update.run(txHash, anchoredAt, leaf);
        const row = packIdOf.get(leaf) as { keepsake_id: string } | undefined;
        // Provenance event — the tx and the pack id, nothing private.
        this.audit("seal_anchored", { ...(row ? { packId: row.keepsake_id } : {}), detail: txHash });
      }
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

  /**
   * How far behind the anchor worker is.
   *
   * A seal that sits in the queue is a promise we have made and not kept: the pack says
   * "anchoring queued" and the buyer is waiting for a chain record that may never land.
   * Silence is the failure mode, so the age of the OLDEST unanchored leaf is surfaced at
   * /health and alerted on.
   */
  anchorQueueHealth(now = Date.now()): { queued: number; oldestAgeMinutes: number } {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM seals_pending WHERE anchored_at IS NULL")
      .get() as { n: number; oldest: number | null };

    return {
      queued: row.n,
      oldestAgeMinutes: row.oldest ? Math.round((now - row.oldest) / 60_000) : 0,
    };
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

  /* ----------------------------------------------------- consensus reviews */

  /**
   * Freezes one review. Fails loudly if the id already exists.
   *
   * INSERT, never INSERT OR REPLACE. The whole guarantee of this feature is that the evidence
   * a validator read is the evidence we still serve, and an upsert here would silently break
   * that the first time a retry raced. A second opinion is a second review_id.
   */
  createConsensusReview(row: ConsensusReviewRow): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO consensus_reviews
           (review_id, artifact_id, keepsake_id, artifact_hash, profile, oqs_version,
            local_verdict, evidence_json, evidence_hash, public_for_consensus, network,
            contract_address, transaction_hash, status, decision, score_band, critical_failure,
            failure_codes_json, submitted_at, finalized_at, error_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.reviewId,
        row.artifactId,
        row.keepsakeId ?? null,
        row.artifactHash,
        row.profile,
        row.oqsVersion,
        row.localVerdict,
        row.evidenceJson,
        row.evidenceHash,
        1,
        row.network,
        row.contractAddress ?? null,
        null,
        "QUEUED",
        null,
        null,
        null,
        JSON.stringify([]),
        null,
        null,
        null,
        now,
        now,
      );
  }

  /**
   * Advances a review's lifecycle. Touches only the mutable columns.
   *
   * evidence_json, evidence_hash, artifact_hash and local_verdict are deliberately absent from
   * this statement — they are not updatable through any path in the codebase.
   */
  updateConsensusReview(
    reviewId: string,
    patch: {
      status?: string;
      transactionHash?: string;
      contractAddress?: string;
      decision?: string;
      scoreBand?: string;
      criticalFailure?: string;
      failureCodes?: readonly string[];
      submittedAt?: string;
      finalizedAt?: string;
      errorCode?: string;
    },
  ): void {
    const sets: string[] = [];
    const values: unknown[] = [];
    const put = (column: string, value: unknown) => {
      if (value === undefined) return;
      sets.push(`${column} = ?`);
      values.push(value);
    };

    put("status", patch.status);
    put("transaction_hash", patch.transactionHash);
    put("contract_address", patch.contractAddress);
    put("decision", patch.decision);
    put("score_band", patch.scoreBand);
    put("critical_failure", patch.criticalFailure);
    put("failure_codes_json", patch.failureCodes ? JSON.stringify([...patch.failureCodes]) : undefined);
    put("submitted_at", patch.submittedAt);
    put("finalized_at", patch.finalizedAt);
    put("error_code", patch.errorCode);
    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    values.push(new Date().toISOString(), reviewId);
    this.db.prepare(`UPDATE consensus_reviews SET ${sets.join(", ")} WHERE review_id = ?`).run(...values);
  }

  consensusReview(reviewId: string): ConsensusReviewRow | undefined {
    const row = this.db
      .prepare("SELECT * FROM consensus_reviews WHERE review_id = ?")
      .get(reviewId) as Record<string, unknown> | undefined;
    return row ? this.toConsensusReviewRow(row) : undefined;
  }

  /** Every review for one artifact, oldest first — this is the lineage a repair extends. */
  consensusReviewsForArtifact(artifactId: string): ConsensusReviewRow[] {
    const rows = this.db
      .prepare("SELECT * FROM consensus_reviews WHERE artifact_id = ? ORDER BY created_at ASC")
      .all(artifactId) as Record<string, unknown>[];
    return rows.map((row) => this.toConsensusReviewRow(row));
  }

  /** Real counts only — /consensus must never show a seeded number. */
  consensusStats(): Record<string, number> {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*)                                                          AS reviews,
           SUM(CASE WHEN status = 'FINALIZED' THEN 1 ELSE 0 END)             AS finalized,
           SUM(CASE WHEN decision = 'UPHELD' THEN 1 ELSE 0 END)              AS upheld,
           SUM(CASE WHEN decision = 'OVERTURNED' THEN 1 ELSE 0 END)          AS overturned,
           SUM(CASE WHEN decision = 'UNDETERMINED' THEN 1 ELSE 0 END)        AS undetermined,
           SUM(CASE WHEN status IN ('QUEUED','SUBMITTED','ACCEPTED') THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END)                AS failed
         FROM consensus_reviews`,
      )
      .get() as Record<string, number | null>;
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v ?? 0)]));
  }

  private toConsensusReviewRow(row: Record<string, unknown>): ConsensusReviewRow {
    return {
      reviewId: row["review_id"] as string,
      artifactId: row["artifact_id"] as string,
      ...(row["keepsake_id"] ? { keepsakeId: row["keepsake_id"] as string } : {}),
      artifactHash: row["artifact_hash"] as string,
      profile: row["profile"] as string,
      oqsVersion: row["oqs_version"] as string,
      localVerdict: row["local_verdict"] as string,
      evidenceJson: row["evidence_json"] as string,
      evidenceHash: row["evidence_hash"] as string,
      network: row["network"] as string,
      ...(row["contract_address"] ? { contractAddress: row["contract_address"] as string } : {}),
      ...(row["transaction_hash"] ? { transactionHash: row["transaction_hash"] as string } : {}),
      status: row["status"] as string,
      ...(row["decision"] ? { decision: row["decision"] as string } : {}),
      ...(row["score_band"] ? { scoreBand: row["score_band"] as string } : {}),
      ...(row["critical_failure"] ? { criticalFailure: row["critical_failure"] as string } : {}),
      failureCodes: JSON.parse(String(row["failure_codes_json"] ?? "[]")) as string[],
      ...(row["submitted_at"] ? { submittedAt: row["submitted_at"] as string } : {}),
      ...(row["finalized_at"] ? { finalizedAt: row["finalized_at"] as string } : {}),
      ...(row["error_code"] ? { errorCode: row["error_code"] as string } : {}),
      createdAt: row["created_at"] as string,
      updatedAt: row["updated_at"] as string,
    };
  }

  /* -------------------------------------------- frozen consensus artifacts */

  /**
   * Writes the immutable public copy a validator will render.
   *
   * A copy, not a reference. The pack's own artifact can be regenerated by a repair, and the
   * URL a validator fetched must keep showing the image that was actually judged.
   */
  putConsensusArtifact(reviewId: string, bytes: Uint8Array): string {
    const key = `genlayer/${reviewId}`;
    const path = this.pathFor(key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return key;
  }

  consensusArtifact(reviewId: string): Uint8Array | undefined {
    try {
      return new Uint8Array(readFileSync(this.pathFor(`genlayer/${reviewId}`)));
    } catch {
      return undefined;
    }
  }

  close(): void {
    this.db.close();
  }
}

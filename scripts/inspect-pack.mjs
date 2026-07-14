/**
 * The operator's log reader — read a past run instead of paying to reproduce it.
 *
 * Opens the store read-only and prints everything we know about a pack: its
 * artifacts and whether each one's binary ACTUALLY EXISTS on disk, the Tribunal's
 * grades and findings, the coverage gaps, the seal/anchor state, the order that
 * paid for it, and the run's event log.
 *
 *   node scripts/inspect-pack.mjs <keepsakeId>     # one pack, in full
 *   node scripts/inspect-pack.mjs --list [n]       # the most recent n packs
 *   node scripts/inspect-pack.mjs --orphans        # PASS artifacts with no file
 *
 * OCE_DATA_DIR defaults to the production path.
 */
import Database from "better-sqlite3";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = process.env.OCE_DATA_DIR ?? "/var/lib/occestra";
const db = new Database(join(DATA_DIR, "occestra.db"), { readonly: true, fileMustExist: true });

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const amber = (s) => `\x1b[33m${s}\x1b[0m`;

/** An artifact's bytes live under the storage key recorded in `uri`. */
const fileFor = (uri) => (uri ? join(DATA_DIR, "artifacts", uri) : undefined);

function fileState(uri) {
  const path = fileFor(uri);
  if (!path) return { present: false, why: "no uri recorded" };
  if (!existsSync(path)) return { present: false, why: "FILE MISSING ON DISK" };
  const size = statSync(path).size;
  return size === 0 ? { present: false, why: "file is zero bytes" } : { present: true, size };
}

const packs = (limit) =>
  db
    .prepare("SELECT id, studio, created_at FROM packs ORDER BY created_at DESC LIMIT ?")
    .all(limit);

function loadPack(id) {
  const row = db.prepare("SELECT body FROM packs WHERE id = ?").get(id);
  return row ? JSON.parse(row.body) : undefined;
}

const IMAGE_FORMATS = ["png", "jpg", "jpeg", "webp"];
const isImage = (a) => IMAGE_FORMATS.includes(a.format);

/**
 * Every artifact the store believes PASSED whose bytes are not actually there.
 * This is the integrity bug V2-0 exists to kill: a pack that reports a pass rate
 * it did not earn, and a /k page that renders a broken image.
 */
function orphans() {
  const found = [];
  for (const { id } of db.prepare("SELECT id FROM packs").all()) {
    const pack = loadPack(id);
    for (const a of pack.artifacts ?? []) {
      if (!isImage(a)) continue;
      const state = fileState(a.uri);
      if (!state.present && a.tribunal?.pass !== false) {
        found.push({
          pack: id,
          artifact: a.id,
          kind: a.kind,
          why: state.why,
          pass: a.tribunal?.pass,
        });
      }
    }
  }
  return found;
}

const arg = process.argv[2];

if (arg === "--list") {
  const n = Number(process.argv[3] ?? 15);
  console.log(bold(`\n  the ${n} most recent packs\n`));
  for (const p of packs(n)) {
    const pack = loadPack(p.id);
    const gaps = pack.coverageGaps?.length ?? 0;
    console.log(
      `  ${p.id}  ${dim(p.studio.padEnd(9))} ${new Date(p.created_at).toISOString().slice(0, 16)}` +
        `  artifacts=${pack.artifacts?.length ?? 0}` +
        `  passRate=${pack.quality?.passRate ?? "?"}` +
        (gaps ? amber(`  gaps=${gaps}`) : ""),
    );
  }
  console.log();
  process.exit(0);
}

if (arg === "--orphans") {
  const found = orphans();
  if (!found.length) {
    console.log(green("\n  no orphans: every graded image artifact has bytes on disk\n"));
    process.exit(0);
  }
  console.log(red(`\n  ${found.length} ORPHANED artifact(s) — graded, but no binary:\n`));
  for (const o of found) {
    console.log(`  ${o.pack}  ${o.artifact}  ${dim(o.kind)}  pass=${o.pass}  ${red(o.why)}`);
  }
  console.log();
  process.exit(1);
}

if (!arg) {
  console.error("usage: node scripts/inspect-pack.mjs <keepsakeId> | --list [n] | --orphans");
  process.exit(2);
}

const pack = loadPack(arg);
if (!pack) {
  console.error(`no pack ${arg} in ${DATA_DIR}/occestra.db`);
  process.exit(2);
}

console.log(bold(`\n  ${pack.id}`));
console.log(`  studio      ${pack.studio}`);
console.log(`  created     ${new Date(pack.createdAt ?? 0).toISOString()}`);
console.log(`  passRate    ${pack.quality?.passRate}`);
console.log(`  sealed      ${pack.seal ? green("yes") : dim("no")}`);

const anchor = db.prepare("SELECT * FROM seals_pending WHERE keepsake_id = ?").get(pack.id);
if (anchor) {
  console.log(
    `  anchor      ${anchor.anchored_at ? green(`anchored ${new Date(anchor.anchored_at * 1000).toISOString()}  tx ${anchor.tx_hash}`) : amber(`QUEUED (${anchor.attempts} attempts)`)}`,
  );
}

console.log(bold("\n  artifacts"));
for (const a of pack.artifacts ?? []) {
  const image = isImage(a);
  const state = image ? fileState(a.uri) : { present: true };
  const grade = a.tribunal;
  const verdict = !grade ? dim("ungraded") : grade.pass ? green("PASS") : red("FAIL");
  const bytes = image
    ? state.present
      ? dim(`${(state.size / 1024).toFixed(0)}kB`)
      : red(`✗ ${state.why}`)
    : "";

  // The integrity invariant, checked right here: a PASS with no bytes is a lie.
  const lying = image && !state.present && grade?.pass === true;

  console.log(
    `  ${verdict}  ${a.kind.padEnd(16)} ${dim(a.format.padEnd(5))} repairs=${grade?.repairs ?? 0}  ${bytes}` +
      (lying ? red("   ← PASS WITH NO BINARY") : ""),
  );
  for (const failed of (grade?.deterministic ?? []).filter((d) => !d.passed)) {
    console.log(`         ${failed.hard ? red("hard") : amber("soft")}  ${failed.id}  ${dim(failed.detail ?? "")}`);
  }
  for (const issue of grade?.issues ?? []) {
    console.log(dim(`         · ${issue}`));
  }
  if (grade?.axes) {
    console.log(
      dim(`         axes ${Object.entries(grade.axes).map(([k, v]) => `${k}=${v}`).join(" ")}`),
    );
  }
}

const gaps = pack.coverageGaps ?? [];
if (gaps.length) {
  console.log(bold("\n  coverage gaps"));
  for (const g of gaps) console.log(`  ${amber("•")} ${g}`);
}

const order = db.prepare("SELECT * FROM orders WHERE id = ? OR id LIKE ?").get(pack.id, `%${pack.id}%`);
if (order) {
  console.log(bold("\n  order"));
  console.log(`  ${order.tool}  ${order.price_usdt} USDT  ${order.status}  payer=${order.payer_ref}  ${order.tx_hash ?? ""}`);
}

const hasEvents = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pack_events'")
  .get();
const events = hasEvents
  ? db.prepare("SELECT seq, at, body FROM pack_events WHERE pack_id = ? ORDER BY seq").all(pack.id)
  : [];
if (events.length) {
  console.log(bold(`\n  event log (${events.length})`));
  const t0 = events[0].at;
  for (const e of events) {
    const body = JSON.parse(e.body);
    const detail = body.detail ?? body.what ?? body.message ?? "";
    console.log(
      `  ${dim(`+${String(e.at - t0).padStart(6)}ms`)}  ${body.type.padEnd(16)} ${dim(String(detail).slice(0, 90))}`,
    );
  }
} else {
  console.log(dim("\n  (no event log — this pack predates event capture, or ran outside the Studio)"));
}
console.log();

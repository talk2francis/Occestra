#!/usr/bin/env node
/**
 * The GenLayer build's memory and its seatbelt.
 *
 * This build runs across many sessions and several context compactions. Two things reliably
 * go wrong when that happens: the thread forgets which phase it is on and re-does or skips
 * work, and it quietly drifts into the production X Layer / OKX payment code that this feature
 * was never supposed to touch. Neither is caught by `npm run check`, because neither is a type
 * error — they are memory errors.
 *
 * So this file holds the memory (genlayer/state/progress.json) and enforces the boundary.
 *
 *   node scripts/genlayer.mjs status          resume brief: where we are, what's next
 *   node scripts/genlayer.mjs guard           invariant check; exits non-zero on a violation
 *   node scripts/genlayer.mjs start <P#>      mark a phase in_progress
 *   node scripts/genlayer.mjs done <P#>       mark a phase complete, stamping the HEAD commit
 *   node scripts/genlayer.mjs block <P#> <..> record a blocker
 *   node scripts/genlayer.mjs note <P#> <..>  record a finding worth surviving a compaction
 *
 * `guard` is the one that matters. Run it before every commit on this branch.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const STATE = new URL("../genlayer/state/progress.json", import.meta.url);
const BRANCH = "feat/genlayer-consensus-review";

/**
 * Files this feature must never modify. Occestra takes real money through the x402 gate and
 * anchors real provenance on X Layer; a GenLayer quality experiment has no business editing
 * either. If a phase genuinely needs to touch one of these, that is a conversation with the
 * owner, not a quiet diff — so this list is deliberately annoying to get around.
 */
const PROTECTED = [
  "packages/mcp-server/src/gate.ts",
  "packages/mcp-server/src/anchor.ts",
  "packages/receipts/src/seal.ts",
  "packages/receipts/src/registry.ts",
  "packages/contracts/src/KeepsakeRegistry.sol",
];

/**
 * A private key committed to a repo cannot be un-committed. These patterns are the shapes we
 * would actually produce by accident here: a raw 32-byte hex key, an OpenAI/OKX credential, or
 * the GenLayer submitter key pasted into an env file that is not the example.
 */
const SECRETS = [
  [/\b0x[0-9a-fA-F]{64}\b/, "raw 32-byte private key"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "OpenAI-style secret key"],
  [/GENLAYER_SUBMITTER_PRIVATE_KEY\s*=\s*["']?0x[0-9a-fA-F]{10,}/, "populated GenLayer submitter key"],
  [/NEXT_PUBLIC_[A-Z_]*(PRIVATE_KEY|SECRET|SEED)/, "secret exposed under NEXT_PUBLIC_"],
];

/** Things that read as real to a steward but are not. Fatal only from P7 on, when a real deployment exists. */
const PLACEHOLDERS = [/PLACEHOLDER/, /YOUR_[A-Z_]+/, /0x0{8,}/, /<REAL[ _]/];

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const load = () => JSON.parse(readFileSync(STATE, "utf8"));
const save = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2) + "\n");
const phaseOf = (s, id) => {
  const p = s.phases.find((x) => x.id === id.toUpperCase());
  if (!p) throw new Error(`no such phase: ${id}`);
  return p;
};

function status() {
  const s = load();
  const cur = s.phases.find((p) => p.id === s.currentPhase);
  const done = s.phases.filter((p) => p.status === "complete").length;

  console.log(`\n  Occestra × GenLayer — ${done}/${s.phases.length} phases complete\n`);
  console.log(`  ${s.mission}\n`);
  for (const p of s.phases) {
    const mark = { complete: "✓", in_progress: "▸", pending: "·", blocked: "✗" }[p.status] ?? "?";
    const at = p.commit ? `  ${p.commit.slice(0, 7)}` : "";
    console.log(`  ${mark} ${p.id}  ${p.title}${at}`);
  }

  if (!cur) return;
  console.log(`\n  CURRENT — ${cur.id}: ${cur.title}\n`);
  console.log("  Not done until all of these are true:");
  for (const a of cur.acceptance) console.log(`    ☐ ${a}`);
  if (cur.blockers.length) {
    console.log("\n  Blocked on:");
    for (const b of cur.blockers) console.log(`    ✗ ${b}`);
  }
  if (cur.notes.length) {
    console.log("\n  Carried forward:");
    for (const n of cur.notes) console.log(`    • ${n}`);
  }
  console.log(`\n  Commit as: ${cur.commitMessage}\n`);
}

function guard() {
  const s = load();
  const fail = [];
  const warn = [];

  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== BRANCH) fail.push(`on branch "${branch}", not "${BRANCH}" — this feature never lands directly on main`);

  // Everything below compares against the fork point, so a rebase onto a moved main does not
  // suddenly report main's own commits as our drift.
  let base = null;
  try {
    base = git("merge-base", "origin/main", "HEAD");
  } catch {
    warn.push("no origin/main to compare against; skipping drift and secret checks");
  }

  if (base) {
    const changed = git("diff", "--name-only", base, "HEAD").split("\n").filter(Boolean);
    const staged = git("diff", "--name-only", "HEAD").split("\n").filter(Boolean);
    const all = [...new Set([...changed, ...staged])];

    // A protected file may be touched only if the ledger says so, in writing, with a reason.
    // The point was never "never edit these" — it was "never edit these by accident".
    const allowed = new Map((s.allowedProtectedEdits ?? []).map((e) => [e.file, e.reason]));
    for (const f of all) {
      if (!PROTECTED.includes(f)) continue;
      const reason = allowed.get(f);
      if (reason) warn.push(`protected file ${f} edited under a recorded exception: ${reason}`);
      else fail.push(`modifies protected production file: ${f}`);
    }

    // Tests that prove a secret gets REJECTED must contain something secret-shaped. Those
    // lines carry an explicit marker, and the count is always printed — an escape hatch you
    // can see being used is very different from one that works silently.
    const ALLOW = "guard:allow-fixture";
    const added = git("diff", base, "--", ".")
      .split("\n")
      .filter((l) => l.startsWith("+"));
    let fixtures = 0;
    for (const [re, label] of SECRETS) {
      for (const line of added) {
        if (!re.test(line)) continue;
        if (line.includes(ALLOW)) {
          fixtures += 1;
          continue;
        }
        fail.push(`possible secret in the diff (${label})`);
        break;
      }
    }
    if (fixtures) warn.push(`${fixtures} secret-shaped line(s) exempted as test fixtures`);

    const gate = s.phases.findIndex((p) => p.id === "P7");
    const now = s.phases.findIndex((p) => p.id === s.currentPhase);
    const shipping = now >= gate;
    for (const f of all) {
      if (!/^(genlayer\/|packages\/genlayer\/|README|GENLAYER|CHANGELOG)/.test(f)) continue;
      // The ledger names these patterns as things to check for; it is not itself content.
      if (f === "genlayer/state/progress.json") continue;
      let body;
      try {
        body = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      } catch {
        continue; // deleted
      }
      for (const re of PLACEHOLDERS) {
        if (!re.test(body)) continue;
        const msg = `${f} still contains a placeholder (${re.source})`;
        (shipping ? fail : warn).push(msg);
      }
    }
  }

  // A phase cannot be complete without a commit recorded against it. This is what stops the
  // ledger from drifting into wishful thinking after a compaction.
  for (const p of s.phases) {
    if (p.status === "complete" && !p.commit) fail.push(`${p.id} is marked complete with no commit recorded`);
  }

  for (const w of warn) console.log(`  warn  ${w}`);
  for (const f of fail) console.log(`  FAIL  ${f}`);
  if (fail.length) {
    console.log(`\n  ${fail.length} invariant violation(s). Fix before committing.\n`);
    process.exit(1);
  }
  console.log(`  ok    branch, protected files, secrets, placeholders, ledger${warn.length ? ` (${warn.length} warning)` : ""}`);
}

const [cmd, id, ...rest] = process.argv.slice(2);
const text = rest.join(" ");

switch (cmd) {
  case "status":
  case undefined:
    status();
    break;
  case "guard":
    guard();
    break;
  case "start": {
    const s = load();
    phaseOf(s, id).status = "in_progress";
    s.currentPhase = id.toUpperCase();
    save(s);
    status();
    break;
  }
  case "done": {
    const s = load();
    const p = phaseOf(s, id);
    p.status = "complete";
    p.commit = git("rev-parse", "HEAD");
    const next = s.phases[s.phases.indexOf(p) + 1];
    if (next) {
      next.status = "in_progress";
      s.currentPhase = next.id;
    }
    save(s);
    status();
    break;
  }
  case "block": {
    const s = load();
    const p = phaseOf(s, id);
    p.blockers.push(text);
    p.status = "blocked";
    save(s);
    status();
    break;
  }
  case "note": {
    const s = load();
    phaseOf(s, id).notes.push(text);
    save(s);
    console.log(`  noted on ${id.toUpperCase()}: ${text}`);
    break;
  }
  default:
    console.error(`unknown command "${cmd}" — try: status | guard | start | done | block | note`);
    process.exit(1);
}

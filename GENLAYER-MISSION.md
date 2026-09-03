# Occestra × GenLayer — mission control

**Read this file first in any session touching the GenLayer work.** It is deliberately short.
`AGENTS.md` is the repository constitution; `GENLAYER-HANDOFF.md` is the feature spec; this is
the thing that survives a context compaction.

```
node scripts/genlayer.mjs status    # where we are, what "done" means for the current phase
node scripts/genlayer.mjs guard     # invariant check — run before every commit
```

State lives in `genlayer/state/progress.json`. The guard exits non-zero rather than warning,
so it can gate a commit.

## The one-paragraph story

Occestra grades its own work. The Tribunal is fast, versioned and public, but it is Occestra's
critic applying Occestra's rubric to Occestra's output — which never fully answers *of course
it passed*. GenLayer is the answer: an independent appellate layer where decentralized AI
validators inspect a frozen public evidence snapshot and rule whether the local PASS/FAIL
verdict should be **UPHELD**, **OVERTURNED** or left **UNDETERMINED**. An overturn can trigger
one bounded repair. Provenance stays separately anchored on X Layer.

## The three layers never collapse into each other

| Layer | Owns | Never |
|---|---|---|
| **Occestra Tribunal** | fast first-instance OQS grading + repair | being the final word |
| **GenLayer** | independent adjudication of that verdict | re-grading from scratch; seeing private material |
| **X Layer** | x402 settlement + KeepsakeRegistry provenance | judging quality |

## Invariants (the guard enforces the mechanical ones)

- Built on `feat/genlayer-consensus-review`. **Merged to `main` 2026-09-03 with the owner's
  explicit instruction, for the Builder submission.** Before that point the rule was: never
  merge. Further GenLayer work should branch again rather than commit to main directly.
- Never modify `gate.ts`, `anchor.ts`, `seal.ts`, `registry.ts`, `KeepsakeRegistry.sol`.
  Occestra takes real money and anchors real provenance through those.
- No secrets in git, ever. The GenLayer submitter key is server-only and separate from the
  X Layer sealer/treasury/deployer keys — separate credentials, separate trust domains.
- Evidence snapshots are immutable once published. A re-review after repair gets a **new**
  reviewId; it never rewrites the ruling it replaced.
- Only `publicForConsensus: true` artifacts are eligible. Remember material needs explicit
  owner consent and never travels as original photos, owner tokens, salts, emails, signed
  URLs or payment signatures.
- A failed or undetermined review never silently becomes UPHELD.
- Only normalized fields (decision, criticalFailure, failureCodes, score band) may reach the
  repair brief. Never free-form validator prose — that is an injection path into generation.
- Verify GenLayer APIs against the installed SDK source, not against memory or draft snippets.
- No fabricated transactions, benchmark numbers, addresses, or validator consensus.

## Live

| | |
|---|---|
| Contract | `0xd3baaBD39F6d83949803de0a62B84a04285Ef3d9` (Bradbury, 4221) |
| Deploy tx | `0x8dfe44cc2823bc5d0f230b3a342c2481c41958a1b1f9927661e262310e983d1b` |
| Deployer | `0x2C0DD61f5a4f1d5a7BAff79362641AfB6fBA3342` |
| Evidence | `https://api.occestra.xyz/genlayer/evidence/<reviewId>` |
| Results | `GENLAYER-EVALUATION.md` — 12 reviews, 6 ruled, 6 failed consensus, 0 overturns |

## Facts established by audit (2026-09-03, P1)

- **Bradbury and Asimov are the same chain.** Both RPCs report chain id `4221` and an
  identical block height. Asimov is the current name; `genlayer-py` ships both definitions.
- OQS in code is **`1.2.0`** (`packages/tribunal/src/rubric.ts`). `AGENTS.md` still says
  `1.0.1` — the file is stale, the code is right. Profiles: `visual`, `written`, `plan`, `pack`.
- Toolchain: `genlayer-test==0.29.2`, `genlayer-py==0.16.3`, `genvm-linter==0.11.0`, from
  **PyPI** — the branch's original git pins were mutually unresolvable.
- GenVM `v0.3.0-rc7` ships two `py-genlayer` runners: the legacy-API one the contract pins
  (`1jb45aa8…`, `from genlayer import *`) and a newer-API one (`1zr6nqk5…`,
  `import genlayer as gl` / `gl.contract.Contract`). Only the pinned one is runnable by
  gltest today. Migrating is a deliberate future decision, not a drive-by.

## Phase map

P1 audit/align SDK · P2 `packages/genlayer` client + schemas · P3 immutable evidence endpoints
+ persistence · P4 durable job submission · P5 overturn → bounded repair · P6 public UI ·
P7 Bradbury deployment + real smoke reviews · P8 honest benchmark · P9 Builder submission.

Full acceptance criteria per phase: `node scripts/genlayer.mjs status`.

## Working rhythm

Per phase: inspect what exists → smallest coherent change → tests → phase tests → repo-wide
`npm run check` → `node scripts/genlayer.mjs guard` → review the diff → commit → mark the
phase done. Phases run continuously; the two places to stop and ask are **P7** (spending real
funds from a real wallet) and any point where the design genuinely conflicts with the SDK.

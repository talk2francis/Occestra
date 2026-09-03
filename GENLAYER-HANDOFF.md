# Occestra × GenLayer — VPS Codex Handoff

Branch: `feat/genlayer-consensus-review`

Read `AGENTS.md`, `genlayer/README.md`, and this file before touching code.

## Objective

Add GenLayer Bradbury as Occestra's independent quality-adjudication layer without replacing the existing X Layer payment/provenance rails.

The product model is:

1. Occestra generates an artifact.
2. The local OQS Tribunal grades it quickly.
3. A public or explicitly consented artifact can be submitted to GenLayer.
4. `OccestraQualityAdjudicator` independently asks GenLayer validators whether the local verdict should be `UPHELD`, `OVERTURNED`, or `UNDETERMINED`.
5. Finalized results appear on the pack page.
6. An overturned verdict may feed the existing repair loop.
7. X Layer remains responsible for x402 settlement and KeepsakeRegistry provenance.

Do not add unrelated token, NFT, staking, voting, or duplicate provenance features.

## Non-negotiable safety rules

- Never commit secrets.
- Never send private Remember photographs/content to GenLayer by default.
- Never expose owner tokens, salts, emails, payment signatures, API keys, private reference links, or original uploads in consensus evidence.
- Evidence snapshots are immutable once published.
- Contract-facing evidence and artifact URLs are allowlisted to the exact `api.occestra.xyz/genlayer/...` origins used by the Intelligent Contract.
- A failed/undetermined GenLayer review must never silently become `UPHELD`.
- Do not change X Layer contract addresses or current payment logic as part of this feature.
- Do not deploy to Bradbury until local lint/direct tests pass and the deployer wallet is confirmed by the owner.

## First session — inspect before editing

Run:

```bash
git checkout feat/genlayer-consensus-review
git pull
node --version
npm ci
npm run typecheck
npm run build
npm test
```

Then inspect:

- `packages/tribunal/src/rubric.ts`
- `packages/tribunal/src/engine.ts`
- `packages/studio-core/src/types.ts`
- `packages/studio-core/src/manifest.ts`
- `packages/mcp-server/src/**`
- pack/public keepsake routes under `apps/web`
- existing SQLite job/store and workers
- `.env.example`
- `.github/workflows/ci.yml`

Report findings before large changes.

## Ticket GL-1 — GenLayer local toolchain

Use current official GenLayer documentation and boilerplate; do not guess stale versions.

Set up a Python environment under `genlayer/` for:

- Intelligent Contract linting;
- direct tests;
- optional Studio/localnet tests.

Pin versions after confirming the current supported releases. Record the exact versions and source URLs in `genlayer/README.md`.

The official reference contract already uses:

```python
from genlayer import *
```

and modern consensus code should use `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` for LLM judgments rather than strict equality on full prose/JSON.

## Ticket GL-2 — contract tests

Write direct-mode tests for `genlayer/contracts/OccestraQualityAdjudicator.py`.

At minimum cover:

1. valid local PASS + independent PASS reasoning -> `UPHELD`;
2. local PASS + validators judge FAIL -> `OVERTURNED`;
3. local FAIL + validators judge FAIL -> `UPHELD`;
4. unavailable evidence -> no false successful review;
5. artifact hash mismatch -> deterministic rejection;
6. profile mismatch -> deterministic rejection;
7. OQS version mismatch -> deterministic rejection;
8. `publicForConsensus=false` -> deterministic rejection;
9. duplicate `review_id` -> rejection;
10. invalid artifact/evidence origin -> rejection;
11. validator decision disagreement -> validator returns false / transaction cannot finalize normally;
12. visual profile exercises screenshot/image path with mocks.

Set strict mocks and pickling checks where supported by the current testing suite.

## Ticket GL-3 — immutable evidence model

Create TypeScript schemas in the existing domain layer or a narrowly scoped new file. Suggested public shape:

```ts
type GenLayerEvidence = {
  reviewId: string;
  artifactHash: `0x${string}`;
  artifactKind: ArtifactKind;
  profile: "visual" | "written" | "plan" | "pack";
  oqsVersion: string;
  localVerdict: "PASS" | "FAIL";
  publicForConsensus: true;
  createdAt: string;
  brief: Record<string, unknown>;
  artifact: Record<string, unknown>;
  localTribunal: Record<string, unknown>;
  artifactUrl?: string;
};
```

Do not blindly serialize the whole pack/customer record. Build an explicit allowlist serializer.

Create a canonical evidence hash and persist the exact body once. Subsequent GETs for the same review ID must return byte-equivalent canonical JSON.

## Ticket GL-4 — public evidence/artifact endpoints

Add server endpoints:

```text
GET /genlayer/evidence/:reviewId
GET /genlayer/artifacts/:reviewId
```

Requirements:

- immutable after creation;
- public only after explicit eligibility/consent check;
- correct cache headers for immutable content;
- artifact endpoint returns only the frozen derivative needed for consensus, never an original private upload;
- image derivatives are stripped/re-encoded just like other Occestra uploads;
- unknown IDs return 404;
- private/nonconsented IDs return 404 rather than leaking existence.

## Ticket GL-5 — GenLayer TypeScript adapter

After confirming the current `genlayer-js` package/version, add a small adapter (prefer `packages/genlayer` only if it can join the npm workspace without destabilizing builds; otherwise keep it inside `mcp-server` first).

Initial network:

```text
GenLayer Bradbury
chain id: 4221
RPC: https://rpc-bradbury.genlayer.com
```

Do not hardcode an Intelligent Contract address until deployment. Env:

```text
GENLAYER_NETWORK=bradbury
GENLAYER_RPC_URL=https://rpc-bradbury.genlayer.com
GENLAYER_QUALITY_CONTRACT_ADDRESS=
GENLAYER_SUBMITTER_PRIVATE_KEY=
```

Server-only private key. No `NEXT_PUBLIC_*` secret.

Adapter responsibilities:

- submit `request_review`;
- return tx hash;
- watch transaction state;
- distinguish accepted/finalized/undetermined/error;
- read `get_review` after finalization;
- normalize into Occestra's storage schema.

## Ticket GL-6 — durable review jobs

Reuse the current durable SQLite/job machinery. Do not build a second queue unless unavoidable.

State machine:

```text
CREATED
EVIDENCE_READY
SUBMITTED
ACCEPTED
FINALIZED
UNDETERMINED
FAILED
CANCELLED (before submission only)
```

Persist:

- review id;
- artifact id/hash;
- local Tribunal verdict;
- evidence hash/url;
- GenLayer tx hash;
- network;
- Intelligent Contract address;
- consensus decision;
- score band;
- failure codes;
- submitted/finalized timestamps.

Retries must be idempotent and must not create multiple reviews for the same review ID.

## Ticket GL-7 — product UI

On public pack/artifact pages add a compact section near the Tribunal/Seal information:

```text
INDEPENDENT REVIEW
Not requested
[ Ask GenLayer ]
```

Then:

```text
INDEPENDENT REVIEW
Pending · GenLayer Bradbury
```

And finally:

```text
INDEPENDENT REVIEW
UPHELD
GenLayer · finalized
[ Inspect transaction ]
```

or `OVERTURNED` / `UNDETERMINED`.

Never imply GenLayer validates X Layer provenance. Keep labels distinct:

- X Layer = provenance/settlement;
- GenLayer = subjective quality adjudication.

For Remember, show a clear consent gate before preparing public consensus evidence.

## Ticket GL-8 — repair loop consequence

For `OVERTURNED`, offer:

`Send back for repair`

Translate normalized GenLayer failure codes into an existing Tribunal-style repair brief. Do not accept free-form validator prose as executable instructions.

After repair, create a **new** consensus review ID; do not mutate the old finalized review.

## Ticket GL-9 — `/consensus`

Add a focused public page containing only real values:

- network;
- deployed contract address;
- explorer link;
- total finalized reviews;
- upheld;
- overturned;
- undetermined;
- OQS version;
- one or more real finalized example reviews.

Suggested headline:

> Our grader doesn't get the final word.

Explain the Tribunal → GenLayer → repair relationship in one diagram.

## Ticket GL-10 — MCP surface

Only after the web path works, add an agent-facing review capability.

Prefer one new paid/free tool plus existing job-status/result tools instead of proliferating endpoints.

Suggested tool:

`oce_consensus_review`

Input references an existing public/consented Occestra artifact. It must not accept arbitrary internet URLs.

## Ticket GL-11 — benchmark

Run a real benchmark corpus after Bradbury deployment:

- 5 clear-pass visuals;
- 5 clear-fail visuals;
- 5 written artifacts;
- 5 plan artifacts.

Publish `GENLAYER-EVALUATION.md` containing actual results only:

- local verdict;
- GenLayer verdict;
- agreement/overturn;
- tx/review reference;
- latency;
- undetermined cases;
- known limitations.

Do not fabricate network activity or points.

## Ticket GL-12 — Builder submission proof

Before submission, update:

- root `README.md` with GenLayer section;
- `genlayer/README.md` with exact deployed contract address;
- architecture SVG;
- `CHANGELOG.md`;
- `/consensus` live link;
- at least one finalized review link/tx;
- reproducible test/deploy commands.

A reviewer should be able to locate all GenLayer work in under five minutes.

## Commit discipline

Use small commits, approximately:

```text
feat(genlayer): add Bradbury network foundation
test(genlayer): add direct consensus coverage
feat(consensus): add immutable evidence snapshots
feat(consensus): submit and track GenLayer reviews
feat(web): surface independent consensus reviews
feat(mcp): expose consensus-backed artifact review
docs(genlayer): add deployment and builder proof
```

Do not squash locally until review.

## Stop conditions

Stop and report instead of guessing if:

- current GenLayer SDK APIs differ materially from this handoff;
- direct tests reveal the contract storage pattern is unsupported;
- Bradbury faucet/deployer balance is unavailable;
- production evidence requires exposing private material;
- deployment requires changing unrelated X Layer/payment code;
- existing Occestra tests regress and the cause is unclear.

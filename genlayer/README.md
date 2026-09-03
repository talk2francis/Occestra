# Occestra × GenLayer — Consensus Review

Occestra keeps its existing fast local Tribunal and X Layer provenance. GenLayer is added as an **independent decentralized adjudication layer** for public or explicitly consented artifacts.

## Trust split

- **Occestra Tribunal** — first-instance OQS grading + repair loop.
- **GenLayer** — independent validator consensus on whether the local verdict is justified.
- **X Layer** — EIP-712 pack provenance + KeepsakeRegistry anchoring.

GenLayer does **not** replace the Tribunal and does **not** receive private Remember uploads by default.

## Intelligent Contract

`contracts/OccestraQualityAdjudicator.py`

The contract accepts a frozen evidence URL prepared by Occestra and persists a normalized review:

- `UPHELD`
- `OVERTURNED`
- `UNDETERMINED`

It also stores a coarse score band plus normalized failure codes. Validators independently rerun the adjudication task and compare the stable decision fields rather than requiring matching prose.

Visual profiles are evaluated with a frozen screenshot supplied to vision-capable validator models. Text/plan profiles use the immutable JSON evidence snapshot.

## Evidence contract

Production evidence must be immutable after publication and served only from:

`https://api.occestra.xyz/genlayer/evidence/<review-id>`

Visual artifact render targets must be frozen and served only from:

`https://api.occestra.xyz/genlayer/artifacts/<review-id>`

Required evidence fields:

```json
{
  "reviewId": "oce_gl_example",
  "artifactHash": "0x...",
  "artifactKind": "launch_thread",
  "profile": "written",
  "oqsVersion": "1.2.0",
  "localVerdict": "PASS",
  "publicForConsensus": true,
  "brief": {},
  "artifact": {},
  "localTribunal": {},
  "artifactUrl": null
}
```

The contract rejects snapshots whose artifact hash, profile, OQS version, or local verdict do not match the transaction arguments.

## Privacy rule

Never publish private customer material solely to obtain GenLayer consensus.

Allowed by default:

- public Launch artifacts;
- public Celebrate artifacts;
- public Gallery packs;
- synthetic benchmark fixtures.

Require explicit owner consent before reviewing Remember material. Original private photos, voice notes, owner tokens, salts, emails, payment signatures, and private reference URLs must never appear in the GenLayer evidence snapshot.

## Network target

Initial deployment target: **GenLayer Bradbury testnet**.

Keep the deployed address and at least one finalized example review in this README after deployment. Do not invent addresses.

## Next implementation tickets

1. Add direct-mode contract tests with mocked web + LLM responses.
2. Add immutable evidence/artifact endpoints to `@occestra/mcp-server`.
3. Add a small TypeScript GenLayer client adapter after pinning the current `genlayer-js` release in the VPS environment.
4. Reuse Occestra's durable job store for pending/accepted/finalized review state.
5. Add pack-page UI: `Not requested → Pending → Upheld/Overturned/Undetermined`.
6. On `OVERTURNED`, optionally feed normalized failure codes into the existing repair loop.
7. Add `/consensus` with live contract address, review counts, and finalized examples.
8. Add MCP surface for consensus review after the web/product path is proven.
9. Run a benchmark corpus and publish `GENLAYER-EVALUATION.md` using real results only.

## Definition of done for the first Builder contribution

- contract lint passes;
- direct tests cover pass, overturn, unavailable evidence, identity mismatch and consensus disagreement;
- contract is deployed to Bradbury;
- Occestra can submit one real public artifact end-to-end;
- product exposes the finalized result and explorer link;
- no private content enters GenLayer;
- README includes deployed address, transaction(s), and reproducible test commands;
- all existing Occestra typecheck/build/tests remain green.

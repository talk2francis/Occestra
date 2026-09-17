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

## Deployed

| | |
| --- | --- |
| Network | GenLayer Studio-dev (Studio Next / Consensus v0.6) |
| Chain ID | 61997 |
| RPC | https://studio-dev.genlayer.com/api |
| Intelligent Contract | `OccestraQualityAdjudicator` |
| **Address** | **`0xaB13426A90CaF4eb9ee16440145A3239f7F4B8E0`** |
| Deploy transaction | `0x45c5f2a3e8e40e3ce70da9ca6ca3c108cba732f3db76e15b22fae194ac142bac` |
| Deployer | `0xb0B8cBEDf9f99FaE1c1D56D1266127B942cE055B` |
| Deployed | 2026-09-17T13:44:55Z |
| Explorer | https://explorer-studio-dev.genlayer.com |
| Deploy result | `FINALIZED` · execution `FINISHED_WITH_RETURN` |

The machine-readable manifest is `genlayer/deployments/studio-dev-61997.json`, and the live fee
policy the deployment and the application path actually paid is `genlayer/fee-profile.json` —
both recorded from the network, not hand-written.

Verify it yourself without cloning anything:

```js
import { createClient, chains } from "genlayer-js";
const client = createClient({ chain: chains.studioDevnet });
await client.readContract({
  address: "0xaB13426A90CaF4eb9ee16440145A3239f7F4B8E0",
  functionName: "review_count",
  args: [],
});
```

The deployer wallet is dedicated to GenLayer. It is not the X Layer sealer, the OKX payment
treasury, or the KeepsakeRegistry deployer — separate credential, separate trust domain.

### The real application-triggered review

Occestra generated a public Agent Tank pack through its own production pipeline
(`oce_01m2qtdbx3gexj81xav154`), then the production API — not a script — requested consensus on
its written plan artifact:

| | |
| --- | --- |
| Review | `oce_gl_cba4a6285a68463c8779` |
| Artifact | `plan` · OQS 1.2.0 · local verdict `PASS` |
| Transaction | `0xa301985462d5d2e99f521ebf0eaf5817d59baa097739d7bbe4cfdfdff31180e1` |
| Consensus | `FINALIZED` · `MAJORITY_AGREE` |
| Decision | **`UPHELD`** · band `70-84` · no failure codes |
| Finalized | 2026-09-17T14:07:20Z |
| Evidence | https://api.occestra.xyz/genlayer/evidence/oce_gl_cba4a6285a68463c8779 |
| Result | https://api.occestra.xyz/genlayer/reviews/oce_gl_cba4a6285a68463c8779 |
| Public page | https://occestra.xyz/consensus |

The first application-path review on this contract
(`0x6606b1f96dde64e76b6f895fb07fb39177f14b88f09df1e6508fe76816127e35`) came back
`MAJORITY_DISAGREE` — five validators all executed successfully, three rejected the leader's
ruling. Occestra stored that as failed and made **no** quality claim from it. That is the
designed behaviour, and it is left in the record rather than deleted.

## Network target and toolchain

Deployment target: **GenLayer Studio-dev, chain id 61997**, the Studio Next / Consensus v0.6
network. The earlier Bradbury/Asimov deployment (chain 4221) predates v0.6 and is superseded;
the v0.6 fee lifecycle (`estimateTransactionFees` → `fees` on the transaction) is mandatory and
does not exist on the old chain.

Verified toolchain (each independently reporting its own version on this VPS):

| Package | Version | Provides |
|---|---|---|
| `genlayer-js` | 2.0.0-rc.1 | deploy/read client, `chains.studioDevnet`, fee estimation |
| GenLayer CLI | 0.40.0-rc.3 | network/chain confirmation |
| `genlayer-py` | 0.19.0-rc.2 | Python client SDK |
| `genlayer-test` | 0.30.0-rc.2 | `gltest` — direct/integration contract testing |
| `genvm-linter` | 0.11.1-rc.2 | `genvm-lint` — AST safety checks, ABI schema |
| GenVM | 0.6.0-rc5 | runner the contract pins |
| `cloudpickle` | >=3.1.2 | required for the direct VM's pickling check to actually run |
| `Pillow` | >=11.0.0 | required for any screenshot-mode render to decode |

The RC pins live in `genlayer/requirements.txt` as exact Git tags: several of these RCs were
never published to PyPI, so a mutable branch name would silently drift.

## Running the checks

```bash
cd genlayer
python3 -m venv .venv-studio-next && .venv-studio-next/bin/pip install -r requirements.txt
.venv-studio-next/bin/genvm-lint lint contracts/OccestraQualityAdjudicator.py
.venv-studio-next/bin/gltest tests/direct/ -q
```

Direct tests are fully offline — every web fetch, page render and LLM call is mocked, and
`strict_mocks` turns an unmocked external call into a failure rather than a live request.

### Known harness limitation

gltest's direct VM answers `web.render(mode="screenshot")` with a hardcoded **empty**
image, which the SDK then fails to decode via PIL. The visual adjudication path is therefore
untestable as shipped. `tests/direct/conftest.py` patches the mock to return a real 1×1 PNG so
the contract's genuine visual branch runs. That patch touches only the mock's return value and
should be deleted when gltest gains first-class screenshot mocking.

## Next implementation tickets

Tracked in `genlayer/state/progress.json`; run `node scripts/genlayer.mjs status` from the
repo root for the current phase and its acceptance criteria.


## 90-second demo

| Time | On screen |
| --- | --- |
| 0:00–0:10 | An Occestra artifact — a launch thread, already made. |
| 0:10–0:20 | The Tribunal report: PASS, OQS v1.2.0, five axis scores. |
| 0:20–0:30 | Press **Ask GenLayer**. The consent line is read aloud: only a redacted public snapshot goes on chain. |
| 0:30–0:45 | `GET /genlayer/evidence/<reviewId>` — the exact frozen bytes validators fetch. Recompute the hash against the response header. |
| 0:45–1:00 | The transaction on the Studio-dev explorer: validators voting. |
| 1:00–1:15 | The panel updates: **UPHELD**, band 70-84, with the contract address and transaction beneath it. |
| 1:15–1:25 | Show a review that did NOT reach consensus. It reads *unavailable* and claims nothing about the artifact. |
| 1:25–1:30 | The three layers side by side: created by Occestra, adjudicated by GenLayer, proven on X Layer. |

Closing line: **"Created by Occestra. Adjudicated by GenLayer. Proven on X Layer."**

The honest version of this demo includes the failed review. The first application-path review on Studio-dev
came back MAJORITY_DISAGREE and claimed nothing, and a demo that hides that is selling
something the product does not do.

## Definition of done for the first Builder contribution

- contract lint passes;
- direct tests cover pass, overturn, unavailable evidence, identity mismatch and consensus disagreement;
- contract is deployed to Studio-dev (chain 61997);
- Occestra can submit one real public artifact end-to-end;
- product exposes the finalized result and explorer link;
- no private content enters GenLayer;
- README includes deployed address, transaction(s), and reproducible test commands;
- all existing Occestra typecheck/build/tests remain green.

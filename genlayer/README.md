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
| Network | GenLayer Bradbury testnet |
| Chain ID | 4221 |
| Intelligent Contract | `OccestraQualityAdjudicator` |
| **Address** | **`0xd3baaBD39F6d83949803de0a62B84a04285Ef3d9`** |
| Deploy transaction | `0x8dfe44cc2823bc5d0f230b3a342c2481c41958a1b1f9927661e262310e983d1b` |
| Deployer | `0x2C0DD61f5a4f1d5a7BAff79362641AfB6fBA3342` |
| Deployed | 2026-09-03 |
| Explorer | https://explorer-bradbury.genlayer.com/ |
| Validators | 3 initial · result `AGREE` · `FINISHED_WITH_RETURN` |
| GenVM runner | `py-genlayer:1jb45aa8…` (GenVM v0.3.0-rc7) |

Verify it yourself without cloning anything:

```js
import { createClient, chains } from "genlayer-js";
const client = createClient({ chain: chains.testnetBradbury });
await client.readContract({
  address: "0xd3baaBD39F6d83949803de0a62B84a04285Ef3d9",
  functionName: "review_count",
  args: [],
});
```

The deployer wallet is dedicated to GenLayer. It is not the X Layer sealer, the OKX payment
treasury, or the KeepsakeRegistry deployer — separate credential, separate trust domain.

## Network target and toolchain

Initial deployment target: **GenLayer Bradbury testnet, chain id 4221**.

Audited 2026-09-03: `rpc-bradbury.genlayer.com` and `rpc-asimov.genlayer.com` return the
**same** chain id (`0x107d` = 4221) and the same block height. They are one network under two
names; Asimov is the current one, and `genlayer-py` ships both chain definitions. Do not treat
them as two deployment targets.

Toolchain, installed from PyPI and pinned in `requirements.txt`:

| Package | Version | Provides |
|---|---|---|
| `genlayer-test` | 0.29.2 | `gltest` — direct/integration contract testing |
| `genlayer-py` | 0.16.3 | client SDK, chain definitions (`testnet_bradbury`, `testnet_asimov`) |
| `genvm-linter` | 0.11.0 | `genvm-lint` — AST safety checks, ABI schema |
| `cloudpickle` | >=3.1.2 | required for the direct VM's pickling check to actually run |
| `Pillow` | >=11.0.0 | required for any screenshot-mode render to decode |

The contract pins GenVM runner `py-genlayer:1jb45aa8…`, which ships in GenVM **v0.3.0-rc7**
and is the runner `gltest` resolves. That release also ships a newer-API runner
(`1zr6nqk5…`, `import genlayer as gl` with `gl.contract.Contract`); the current tooling cannot
run it, so migrating is a deliberate future decision rather than a drive-by change.

## Running the checks

```bash
cd genlayer
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/genvm-lint lint contracts/OccestraQualityAdjudicator.py
.venv/bin/gltest tests/direct/ -q
```

Direct tests are fully offline — every web fetch, page render and LLM call is mocked, and
`strict_mocks` turns an unmocked external call into a failure rather than a live request.

### Known harness limitation

gltest 0.29.2's direct VM answers `web.render(mode="screenshot")` with a hardcoded **empty**
image, which the SDK then fails to decode via PIL. The visual adjudication path is therefore
untestable as shipped. `tests/direct/conftest.py` patches the mock to return a real 1×1 PNG so
the contract's genuine visual branch runs. That patch touches only the mock's return value and
should be deleted when gltest gains first-class screenshot mocking.

## Next implementation tickets

Tracked in `genlayer/state/progress.json`; run `node scripts/genlayer.mjs status` from the
repo root for the current phase and its acceptance criteria.

## Definition of done for the first Builder contribution

- contract lint passes;
- direct tests cover pass, overturn, unavailable evidence, identity mismatch and consensus disagreement;
- contract is deployed to Bradbury;
- Occestra can submit one real public artifact end-to-end;
- product exposes the finalized result and explorer link;
- no private content enters GenLayer;
- README includes deployed address, transaction(s), and reproducible test commands;
- all existing Occestra typecheck/build/tests remain green.

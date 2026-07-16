# Occestra — Evaluation & Judge Verification

This file is a reproducible verification map. It separates deterministic guarantees from
measurements involving models, third-party providers, and the public internet. Nothing in the
second category is presented as an invariant.

## Live identity

| Surface | Value | Verify |
|---|---|---|
| Website | `https://occestra.xyz` | `curl -I https://occestra.xyz` |
| ASP | `https://api.occestra.xyz/mcp` | `curl -fsS https://api.occestra.xyz/health` |
| OKX.AI Agent | `#5213` | machine manifest below |
| X Layer registry | `0x1653509df702b45d67b3eb12ca37de9f5fc21f08` | [OKLink](https://www.oklink.com/x-layer/address/0x1653509df702b45d67b3eb12ca37de9f5fc21f08) |
| Machine manifest | `/.well-known/occestra.json` | `curl -fsS https://api.occestra.xyz/.well-known/occestra.json \| jq` |

## Reproducible-exact claims

| Claim | Proof |
|---|---|
| Published OQS equals shipped constants | `npm test --workspace @occestra/tribunal` and `curl -fsS https://api.occestra.xyz/standard.json` |
| Every delivered artifact carries a Tribunal report | `npm test --workspace @occestra/studio-core` |
| A hard deterministic failure can never exist inside a passing artifact | `npm test --workspace @occestra/tribunal` |
| A missing image cannot wear a PASS badge or improve pass rate | `npm test --workspace @occestra/mcp-server -- integrity.test.ts` |
| Paid retries are idempotent and jobs survive restart | `npm test --workspace @occestra/mcp-server -- jobs.test.ts` |
| Private keepsakes use salted commitments and require ownership for deletion | `npm test --workspace @occestra/mcp-server -- privacy-salt.test.ts privacy.test.ts` |
| TypeScript leaves execute against the real Solidity bytecode | `npm test --workspace @occestra/contracts` |
| The x402 plain-JSON route accepts a paid replay | `onchainos agent x402-check https://api.occestra.xyz/mcp --tool oce_write_toast` |
| The V2-6 checkpoint passes 418 automated tests | `npm test` |

## Measured-with-variance

The canonical dataset is [`docs/slo.json`](docs/slo.json), rendered at
[`/evaluation`](https://occestra.xyz/evaluation) and
[`/docs/evaluation`](https://occestra.xyz/docs/evaluation). It currently contains 14 paid-provider
runs and publishes the sample size, median, range, pass-rate range, and provider spend per tool.
Reproduce with:

```bash
node scripts/slo.mjs
node scripts/critic-variance.mjs
```

The current sample is deliberately not called a population SLO. Small `n` remains visible.

## Full verification sweep

```bash
npm test
npm run typecheck
npm run build
AUDIT_BASE=https://occestra.xyz node apps/web/scripts/audit.mjs
AUDIT_BASE=https://occestra.xyz AUDIT_REDUCED=1 node apps/web/scripts/audit.mjs
node examples/verify-seal.mjs
```

The audit covers both Daylight and Nocturne at desktop, tablet, and mobile viewports, including the
Studio and real `/k` pages. It fails on console errors, horizontal overflow, missing alternate text,
or route failures.

## Honesty boundaries

- Venue and weather results are candidates with source timestamps, never confirmed bookings.
- Provider failure is a public stable gap code; raw vendor errors remain server-side.
- Gallery and activity counters come from the real store. Demo runs are labelled and excluded from
  paid volume. Private pack names and contents never enter the public activity ticker.
- Every Remember pack is private. Only a salted manifest commitment reaches the chain.
- A model-dependent grade is measured with variance. Deterministic checks are stated as invariants
  because a failure forces the artifact to fail.

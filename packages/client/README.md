# @occestra/client

Typed client for [Occestra](https://occestra.xyz), the Occasion Studio on OKX.AI — call the eight tools, answer x402 challenges automatically, verify seals against X Layer.

```ts
import { Occestra } from "@occestra/client";

const studio = new Occestra({
  endpoint: "https://api.occestra.xyz",
  payment: { privateKey: process.env.AGENT_KEY }, // enables automatic x402 — signed locally, never sent
});

const toast = await studio.writeToast({ subject: "Mara", details: "she taught me to drive, badly" });
console.log(toast.artifacts[0]?.content, toast.publicPage);
```

That's the whole integration. Paid tools return an x402 challenge; the client signs the EIP-3009 authorization with your key (locally — the key never leaves your process) and retries. USDT on X Layer, per call, no API key, no signup.

## The one-cent quality gate

Pipe **your own agent's output** through Occestra's published quality standard before your users see it:

```ts
const report = await studio.critique({
  kind: "launch_thread",
  brief: "announce a CLI tool to senior engineers without hype",
  text: draft,
});
if (!report.artifacts[0]?.tribunal?.pass) {
  // the report includes a concrete repairBrief — regenerate with it
}
```

## Free, forever

```ts
await studio.verifyKeepsake("oce_01kxbz33bb4grnd1xh0gev"); // { signatureValid: true, anchored: true, … }
await studio.getPack("oce_01kxbz33bb4grnd1xh0gev");        // the public pack + fresh artifact URLs
```

Verification is deliberately outside the paywall — and you don't even need us for it: [~40 lines of viem](https://occestra.xyz/docs/provenance) verify any seal straight against the chain.

## API

| method | price | returns |
|---|---|---|
| `planOccasion(args)` | 0.05 | grounded plan pack (real venues, real forecast) |
| `designInvite(args)` | 0.10 | invitation suite |
| `makeKeepsake(args)` | 0.10 | keepsake art + story page |
| `writeToast(args)` | 0.02 | a toast written for the room |
| `moodboard(args)` | 0.05 | directed moodboard |
| `launchKit(args)` | 0.25 | brand genome from your live site + full kit |
| `critique(args)` | 0.01 | your artifact, graded, with a repair brief |
| `verifyKeepsake(id)` | free | seal verification |
| `getPack(id)` / `capabilities()` / `stats()` | free | public surfaces |

Every paid result is a `PackResult`: artifacts with sources and full `TribunalReport`s, honest `coverageGaps`, and (when sealed) the on-chain-verifiable `Seal`. Full docs: https://occestra.xyz/docs

MIT © Occestra

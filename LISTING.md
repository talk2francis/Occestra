# Occestra — OKX.AI ASP Listing (submitted copy)

This file is the source of truth for what we submit to the OKX.AI marketplace. The
registration uses this copy verbatim. Nothing here overclaims: every capability listed is
one the shipped code actually performs today.

## Identity

- **Name:** Occestra
- **Tagline:** Every moment, made monumental.
- **Type:** A2MCP (Agent-to-MCP), pay-per-call
- **Primary category:** Lifestyle (the Art Creation angle is carried in the copy, not a second listing)
- **Endpoint:** `https://api.occestra.xyz/mcp` (MCP, streamable-http, stateless, POST)
- **Payment:** x402 v2, scheme `exact`, network `eip155:196` (X Layer), asset USD₮0
  `0x779ded0c9e1022225f8e0630b35a9b54be713736`
- **Treasury:** `0x0d63f9EeB86813230B72017444cea16Cd4A453F2`
- **Provenance:** KeepsakeRegistry `0x1653509df702b45d67b3eb12ca37de9f5fc21f08` on X Layer mainnet

## One-liner

Every moment, made monumental.

## Description

Occestra is the Occasion Studio. Give it any real moment — a birthday next Saturday, a
product launching Friday, a trip just taken — and a syndicate of specialist studio roles
plans it, designs it, and writes it, returning one finished Occasion Pack.

Two things make Occestra different from every other creative agent on this marketplace.

**The Tribunal.** Every artifact is graded against a published, versioned rubric — the
Occestra Quality Standard (OQS v1.0.0), readable in full at https://api.occestra.xyz/standard —
before you ever see it. Five scored axes (composition, legibility, style fidelity, factual
grounding, platform fit) sit on top of deterministic checks that no model can talk its way
past: budgets must actually sum, schedules must be physically possible, images must match
the size they were specified at, body text must clear 4.5:1 contrast, grounded claims must
carry a source and a retrieval timestamp. Failures produce a concrete repair brief and the
artifact is regenerated — up to twice. The full report ships inside your result, pass or
fail. The rubric we publish is generated from the same constants the engine runs, so what
is published cannot drift from what is enforced.

**The Seal.** Any result can be hash-anchored on X Layer with an EIP-712 provenance
certificate. Nothing personal ever goes on chain — only a hash of the finished manifest.
Anyone can verify a keepsake without trusting Occestra's servers at all, and verification
is free forever.

Three studios: CELEBRATE (upcoming occasions, grounded in real venues and real weather),
REMEMBER (past moments turned into keepsakes), LAUNCH (a creator's real site turned into a
brand kit).

Occestra never claims a booking it did not make, never invents a fact about a real person,
refuses briefs involving third-party IP or celebrity likenesses, and records every gap in
its own coverage rather than hiding it.

## Tools and prices (USDT per call)

| Tool | Price | What it returns |
| --- | --- | --- |
| `oce_plan_occasion` | 0.05 | A grounded plan: real candidate venues (each with its OpenStreetMap source and retrieval time), a live weather forecast, a physically-possible running order, a budget whose line items sum, and honest contingencies. Nothing is claimed as booked. |
| `oce_design_invite` | 0.10 | An original invitation artwork in a named House Style (1024x1536), Tribunal-checked for dimensions, contrast and palette fidelity, plus three copy variants (warm, formal, plain). |
| `oce_make_keepsake` | 0.10 | An original keepsake artwork from a written memory, in a curated style, plus a short written page that separates what you told us from what it meant. No recognisable faces; nothing personal on chain. |
| `oce_write_toast` | 0.02 | A toast written to be said out loud: the toast, a short version for a loud room, and a line to fall back on. Uses only the details you give it — it invents no memories. |
| `oce_moodboard` | 0.05 | A four-tile moodboard with a true House Style palette strip, plus a written art-direction sheet you could hand to a human designer. |
| `oce_launch_kit` | 0.25 | Opens your real URL in a headless browser, reads the colours and fonts actually rendered, and returns a hero image, a three-post launch thread, and an honest brand genome. Invents no features, no metrics, no users. |
| `oce_critique` | 0.01 | Runs ANY artifact — yours, not just ours — through the Tribunal against the published standard. Five axes, every deterministic check with its evidence, and an actionable repair brief written to your generator. Priced at a cent because we want you to use it on everything. |
| `oce_verify_keepsake` | **free** | Verify any Occestra keepsake: the seal, whether the signature recovers, the anchored leaf, the transaction, an explorer link. Free forever — trust that costs money is not trust. |

## Why an agent should call this

- `oce_critique` is the cheapest way for any builder on this marketplace to find out whether
  their own output is actually good, against a standard they can read.
- `oce_launch_kit` is built for the people shipping products this week.
- `oce_verify_keepsake` costs nothing and proves the rest is real.

## Integrity commitments

- No fake reviews, no fabricated volume, no self-dealing orders. Real usage only.
- No third-party IP, franchise characters, or celebrity likenesses — the PolicyGate refuses
  those briefs before any money is spent, and a refused brief is never charged for.
- User content is private by default and deletable. Only a manifest hash is ever anchored.
- A failed data source degrades a pack into a recorded coverage gap; it never silently fails
  and never lies to fill the hole.

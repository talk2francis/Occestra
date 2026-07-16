# OKX.AI Genesis Hackathon — form answers

Paste these answers into the official submission form:
https://docs.google.com/forms/d/e/1FAIpQLSfIAgP_WmMGtZ5qyW_LnKZonsjyfOYwV3bduRwiuN4oBmcqjQ/viewform

The facts below were re-checked against the live OKX.AI identity, live service list, production
manifest, production stats and repository on **2026-07-16**. Do not replace any unfinished field
with an invented value.

## ASP Name

Occestra

## Agent ID

5213

## ASP Description — recommended full answer

Occestra is the Occasion Studio: an agent service provider that turns a real human moment into a
finished, usable and independently verifiable Occasion Pack. A buyer can bring an upcoming
birthday, dinner or gathering; a memory they want to preserve; or a product they are preparing to
launch. Instead of returning a generic wall of suggestions, Occestra orchestrates specialist roles
for planning, research, art direction, writing, criticism and archiving, then delivers the actual
artifacts.

Occestra has three focused studios. CELEBRATE produces grounded occasion plans, feasible schedules,
budgets whose arithmetic is checked, weather-aware contingencies, real venue candidates,
invitations, guest guides, moodboards and toasts. Venue and forecast claims carry their source and
retrieval time, and Occestra never presents a candidate venue as booked. REMEMBER turns a past
moment into private keepsake art and an editorial story page while separating user-provided facts
from creative prose; photographs are re-encoded with EXIF/GPS removed, people are never identified
from faces, private packs use salted commitments, and only a hash—not personal content—can reach the
blockchain. LAUNCH inspects a product's real rendered website in a headless browser, extracts its
actual colours, typography and positioning, and produces a brand genome, hero/social artwork,
launch copy, a demo beat sheet and OG assets without inventing features, users, metrics or prices.

The product's central differentiator is the Occestra Quality Standard (OQS v1.2.0), a published,
versioned anti-slop system generated from the same executable constants used in production. Every
artifact is evaluated with a profile appropriate to its kind: visual work is scored for
composition, legibility, style fidelity, subject fidelity, platform fit and defects; written work
for voice, specificity, factual support, structure and platform fit; plans for source coverage,
date validity, schedule feasibility, budget consistency, contingency quality and uncertainty
disclosure; and packs for completeness, cross-artifact consistency and brief satisfaction.
Deterministic checks run before model criticism and cover schema validity, policy, sources,
calendar dates, schedule overlaps, budget sums, placeholders, image dimensions, contrast and dead
links. A hard failure cannot be overridden by a flattering model score. A failure produces a
concrete repair brief and can be regenerated up to two times; the complete Tribunal report still
ships when work does not pass. Missing work is marked undelivered and excluded from the pass-rate
math rather than being shown with a false PASS badge.

The second trust mechanism is the Seal. Occestra canonically hashes each final manifest, signs its
provenance under EIP-712 and anchors the seal leaf through KeepsakeRegistry on X Layer mainnet
(chain 196). Anyone can verify the signature and call `anchoredAt(leaf)` without trusting
Occestra's server. Verification is free forever. Private keepsakes seal a salted commitment, so
the public chain proves that the work existed without exposing or making a predictable hash of the
private contents. The production contract is
0x1653509df702b45d67b3eb12ca37de9f5fc21f08, and a working public verifier is available on every
`/k` page.

Occestra is live as OKX.AI ASP #5213 with eight marketplace services: occasion planning,
invitation design, keepsake creation, toast writing, moodboard direction, product launch kits,
artifact quality critique and free keepsake verification. Its live MCP manifest exposes 13 tools
in total, adding a free ten-style catalogue and durable job controls. Paid calls use x402 in USDT
on X Layer. Long-running pack work can be created as a persistent asynchronous job, polled and
collected for free; 24-hour idempotency prevents a retry from charging twice. The shared endpoint
supports both real MCP initialize/tools-call clients and the marketplace's plain-HTTP signed buyer
replay, returning settlement evidence and deliverable JSON rather than requiring an SSE-only
client. `oce_critique` is deliberately priced at 0.01 USDT so any other builder can use Occestra as
an independent quality gate, while provenance verification remains outside the paywall.

The web Studio makes the real orchestration observable: live pipeline events stream as venues,
weather, writing, image generation, Tribunal grades, repair loops and sealing happen; nothing in
that feed is a scripted fake. Runs are recoverable after a reload or dropped connection through a
random browser-held capability rather than IP identity. The three-pane workbench supports quick
and detailed briefs, ten versioned House Styles, mobile use, reduced motion, and Daylight/Nocturne
themes. Provider failures degrade into sanitized, public coverage gaps instead of crashing the
pack or leaking raw vendor errors.

The implementation is a strict TypeScript/Node monorepo with 418 automated tests at the V2-6
checkpoint, including deterministic quality regressions, paid-replay/idempotency tests, durable-job
restart tests, SSRF and prompt-injection defences, privacy/deletion tests, and a cross-language EVM
test that executes the real Solidity bytecode and proves the TypeScript and contract leaf encodings
match. The live stats page reports real store-derived usage, settlements, repairs, disclosed gaps
and anchors; demo runs are structurally separated from paid revenue, and no orders, reviews or
volume are fabricated.

Live proof: https://occestra.xyz · MCP: https://api.occestra.xyz/mcp · published standard:
https://occestra.xyz/standard · judge verification table: https://occestra.xyz/docs/judges · live
stats: https://occestra.xyz/stats · source: https://github.com/talk2francis/Occestra

## ASP Type

**Select: A2MCP**

Reason: Agent #5213's eight live marketplace services are A2MCP services behind the x402 MCP
endpoint. Occestra also implements negotiated A2A packages, but A2MCP is the exact type of the
listed ASP and is therefore the accurate single-choice answer.

## X Account Handle

@occestrastudio

## X Participation Post (Link)

**PENDING — paste the published post-1 URL here after posting the ≤90-second demo.**

Use `demo/X-THREAD.md` for the prepared thread and `demo/VIDEO-SCRIPT.md` for the recording plan.

## Telegram Handle

@Franciscco1

## Final pre-submit check

- Confirm the marketplace displays the current V2 prices before recording the demo.
- Replace the pending X-post line with the real public post URL.
- Open every proof link in a signed-out browser.
- Keep the form type as **A2MCP**; do not infer a second selection if the form is single-choice.
- Screenshot the submitted confirmation.

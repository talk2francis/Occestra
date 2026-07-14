# Changelog

All notable changes to Occestra are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The Occestra Quality
Standard (OQS) is versioned **separately** from the software — a rubric change is a promise
change, and it says so in its own line.

## [Unreleased] — V2-0: triage

Integrity, honesty, and cost. Nothing in this release adds a feature; all of it stops the
product from misleading the person paying for it.

### Fixed

- **A pack could report a pass rate it never earned.** When an image provider failed, the
  artifact was dropped from the pack and only a coverage gap remained. The pass rate is
  `passed / delivered`, so dropping the failures **shrank the denominator** — a launch kit
  that produced one image of four could still report `passRate: 1.0`. The thinner the pack,
  the better it scored. A failed artifact now stays in the pack marked `undelivered`: never
  graded, never counted on either side of the pass rate, counted separately in
  `quality.undeliveredCount`, and rendered as an honest "not delivered" card next to the
  score it is excluded from.
- **A resolved storage write was treated as proof.** `ensureStored()` now reads every image
  back before the artifact may call itself delivered, so a full disk or a bad key can no
  longer produce a PASS with no bytes behind it.
- **Public surfaces were publishing our stack traces.** Coverage gaps ship in packs, on `/k`
  and in tool responses, and they were carrying the raw provider failure inline — vendor,
  endpoint, HTTP status and billing state, on a page handed to a customer. Every gap crossing
  a public boundary now passes `sanitizeGap()` and emerges as a stable code plus one plain
  sentence. It runs at **render** time, so the packs already in the store are cleaned up too.
- **The seal stamp read `EIP-71SEALED ON X LAYER`.** The ring text was ~308px of glyphs on a
  path 276px around, so the tail overprinted its own head. It is now fitted to the ring's
  exact circumference and reads `EIP-712 · SEALED ON X LAYER · OCCESTRA ·` at any size.
- **A broken image could render as the browser's torn-page glyph**, which reads as "this site
  is broken" rather than "this file is gone". Images now degrade to a plain statement.
- README claimed both 223 and 205 tests, in two places, and neither was right. It is 243.

### Changed

- **Degraded COPY is now `undelivered`, not vanished.** The image fix was only half the bug:
  when a *writer* failed, the artifact was dropped the same way, leaving a bare
  `launch_thread:degraded` gap — so a launch kit with no thread, no landing spec and no beat
  sheet still reported `passRate: 1.0` over the images that happened to survive. Found by
  watching a fake-mode run's event feed, not by a test.
- **Facts injection + a hard `PLACEHOLDER_TEXT` check** (OQS **1.0.1**). The writer is given
  the real product name, URL and — when the subject is Occestra — our actual price list, read
  from the same constants the paywall charges from. Unfinished text delivered to a buyer is
  now a hard failure.
- **The brand genome renders as design**, not as raw markdown with the underscores showing.
- **Event labels name the role and the artifact** ("The Writer · the launch thread") instead
  of repeating "drafting with the model router" on every beat.

- **Image quality tiers.** No `quality` was ever sent to the image provider, so it applied
  its DEFAULT — its most expensive tier — to every image, including moodboard thumbnails
  and repair drafts that get thrown away. Top tier is now bought only for work a person
  keeps (`og_image`, `keepsake_art`, `invitation`); everything else, and **every repair**,
  is mid tier. One of each tool: **$0.92, down from $1.55 — 40% cheaper**; the launch kit
  alone fell 53%.
- **The launch kit's share card is derived, not generated.** The artifact called `og_image`
  shipped at 1536×1024 — not the 1.91:1 an Open Graph card actually is — so every platform
  cropped it badly. A correctly-shaped 1200×630 card is now cut from the hero with sharp:
  it costs nothing, and it cannot drift from the hero the way a second generation would.
- **A per-caller cap on the free Studio**, alongside the shared daily pool.

### Added

- **`OCE_FAKE_PROVIDERS=1`** — assembles the deterministic fakes for every port, so the
  server, the Studio and the whole suite run for free. It refuses to boot alongside
  `OCE_PAYMENT_MODE=okx` (we will not take real money for fake work) and every pack it
  produces carries `FAKE_PROVIDERS` in its coverage gaps.
- **`scripts/inspect-pack.mjs`** — the operator's log reader. Reads a past run out of the
  store (artifacts, whether each binary actually exists on disk, grades, findings, gaps, seal
  and anchor state, the event log) so we stop paying to reproduce what we already know.
  `--orphans` audits the whole store for PASS artifacts with no bytes.
- **`scripts/smoke-cheap.mjs`** — one text-only artifact on the efficient model tier, to prove
  the real rail answers without commissioning a full pack.
- Run event logs are **persisted** rather than existing only on the SSE wire.
- **Anchor queue health** at `/health` (`queued`, `oldestAgeMinutes`, `stalled`) with an
  alert. It deliberately does **not** flip `ok`: the watchdog restarts the service on `!ok`,
  and a restart cannot un-stick a queue that is stuck for want of gas — it would only bounce
  a healthy ASP and drop paid requests mid-flight.

### Verified

- **The ONE real run found a bug, which is what it is for.** `PLACEHOLDER_TEXT` hard-failed a
  perfectly good plan because its bracket rule matched the JSON the plan is *made of*
  (`[{"text":"Aqui há Peixe — 18A Rua da Trindade..."`). Brackets are syntax in JSON and links
  in markdown; "shouting" is not evidence. The check now reads JSON *values*, never JSON
  *syntax*, and the exact string is pinned by a test. Re-run: plan and schedule pass.

- **Measured unit cost per tool** (`docs/pricing-rationale.md`, reproduce with
  `node scripts/cost-model.mjs`). **Three of the six paid tools sell below cost**: every
  `oce_launch_kit` loses ~$0.19, every `oce_design_invite` ~$0.15, every `oce_make_keepsake`
  ~$0.08. The more the ASP sells, the more it burns. This was invisible because the cost
  governor priced every image at a flat, invented $0.04. V2-1 reprices against that table.

- All **23** seals in the store confirmed anchored on X Layer mainnet by reading
  `KeepsakeRegistry.anchoredAt()` directly. Zero claiming an anchor the chain does not have.
- Zero orphaned artifacts in the live store.
- All 19 distinct coverage gaps in the live store now resolve to a clean code and a specific
  sentence — zero leaks, zero generic fallbacks.

---

*Earlier work (Phases 0–15: the studios, the Tribunal, the seal, the payment rail, the web
surface, docs, SDK and launch hardening) predates this file and is recorded in the
`AGENTS.md` deviations log and in git history.*

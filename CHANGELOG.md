# Changelog

All notable changes to Occestra are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The Occestra Quality
Standard (OQS) is versioned **separately** from the software — a rubric change is a promise
change, and it says so in its own line.

## [Unreleased] — V2-2.3: private keepsakes — proven without being published

A keepsake is made from a person's own photographs and their own memory. It should be provable
without being publishable, and until now it was not: the on-chain commitment was the bare manifest
hash, which is DETERMINISTIC — anyone who obtains the pack can confirm it is the thing on chain,
and two identical manifests commit to identical leaves, which is linkable.

**Every Remember pack is now sealed to a SALTED commitment:** `keccak256(salt || canonicalManifest)`,
the salt being 32 random bytes. The anchored leaf now proves the keepsake *exists* and was sealed
by us — while revealing nothing about it and linking to nothing. The salt is stored with the pack,
never on chain and never in the public page, and is released only to the owner, who presents an
**owner token** (stored as a hash) handed to them once at creation.

- **The public `/k` page for a private keepsake shows its seal, not its contents** — no artifacts,
  no story, no grade summary. A stranger can verify the signature and the anchor; only the owner,
  with the salt, can verify the commitment opens to their pack. `oce_verify_keepsake` takes an
  optional `ownerToken` to do exactly that.
- **Public packs are entirely unchanged** — deterministic hash, fully visible, verifiable by
  anyone against the pack alone. Existing sealed packs are unaffected; `salted` defaults to absent.
- **Deleting a keepsake destroys its salt too**, so a deleted private pack can never be verified
  against later — it is gone, for real.
- A showcase escape hatch (`_public`, internal-only, absent from the tool schema) lets the gallery
  seed public keepsakes; a real buyer has no way to make theirs public over MCP.

## [Unreleased] — V2-2.2: style gating, and a subject-first prompt

Two defences against the map incident, upstream of the critic that now catches it.

**Styles are gated to the work they suit.** Every House Style gains `appliesTo.studios`. atlas_ink
— map-and-ledger — is for celebrate itineraries and is **excluded from launch brand work**, where
its motifs would try to become the subject. Ask for atlas_ink on a software launch and the
pipeline substitutes a launch-appropriate style and **records the substitution** as a coverage
gap; it is never silent. The catalog and manifest now publish each style's `appliesTo`.

**The image prompt leads with the SUBJECT.** It used to lead with the House Style and append the
subject last — which is how a wordmark came back as a map: the style's recurring motifs drifted
into becoming the subject. `composeImagePrompt(subject, style)` now puts the subject first and
names the style explicitly as a *treatment* that must not replace it. Prevention at generation,
one layer before the grader.

## [Unreleased] — OQS 1.2: rubric profiles, and the axis the map incident needed

Grading everything on the same five axes was a category error, and it shipped a real defect: a
map rendered in a brand-mark House Style **passed**, because none of the five axes asked "is the
content what the brief commissioned?" An invitation is not judged like a budget, and a budget is
not judged like a toast.

**So the standard now has PROFILES.** An artifact is graded on the axes that mean something for
what it *is*:

- **visual** — composition, legibility, style_fidelity, **subject_fidelity**, platform_fit, defects
- **written** — voice, specificity, factual_support, structure, platform_fit
- **plan** — source_coverage, date_validity, schedule_feasibility, budget_consistency, contingency, uncertainty_disclosure
- **pack** — completeness, cross_artifact_consistency, brief_satisfaction (computed, not model-judged)

`subject_fidelity` is the map-incident fix, and it is a **correctness** axis: it asks, ignoring
how good the rendering looks, whether the artifact depicts the thing that was asked for. A map
where a software brand mark was commissioned now fails on it — and, being correctness, the critic
must be able to *quote* what it depicts instead.

The architecture keeps the critic ignorant of the standard: the engine chooses the profile from
the artifact and passes it, as plain data, across the critique port. The critic builds its schema
and its scoring anchors **from the profile it is handed**, so an off-profile answer is impossible
rather than merely discouraged, and the same anchors render at `/standard`. An invitation's PNG
plate is graded visual; its markdown copy, written — both from one `oce_design_invite` call.

**The pack profile** grades the delivery as a whole, deterministically: did every requested
deliverable ship, do the artifacts agree with each other on the date, did the delivered ones pass.
A set of individually-passing artifacts is not automatically a good pack, and now the standard can
say so.

**OQS → 1.2.0.** Note: this is 1.2.0, not the 1.1.0 the phase brief named — 1.1.0 was already
taken by the V2-1.0 determinism work (axis classes + the citation rule), and adding profiles and a
new axis on top is a real rubric change, so the honest semver is a further bump. Stored reports are
self-describing: each carries the version and profile it was graded under, and old packs display
exactly as they were graded. `/standard`, the docs, and the machine manifest regenerate from the
profiles — published is still shipped, by construction.

## [Unreleased] — V2-1.6/1.7: measure it, split the promise, and the bug that only measuring found

**The SLOs are measured, not asserted — and published split in two**, because a single table
would have been a quiet lie. There are two kinds of promise in this product:

- **Reproducible-exact** — enforced by a deterministic check. A budget sums or
  `BUDGET_SUM_MISMATCH` fails the artifact. There is no p95 here and no "usually": it is
  arithmetic, and it holds every time or the pack is marked failed and says so. Publishing these
  as a percentage would imply they could come out otherwise.
- **Measured-with-variance** — everything a model touches. Pass rate depends on a critic; latency
  depends on four providers and the internet. These get a **median and a range**, with the sample
  size stated, because a single figure would claim a precision we have not earned, and n=2 is not
  a distribution.

`node scripts/slo.mjs` runs the real tools, prints the estimated bill first, and writes
`docs/slo.json`, which the new **`/evaluation`** page renders. The critic-determinism work
(V2-1.0) came before this on purpose: there is no point publishing a spread you have not first
tried to shrink.

**Measuring caught a bug that failed every buyer of `oce_design_invite`.** It passed its unit
tests and failed 50–100% of real runs, for two reasons. The invitation *image* was scored
legibility 30 / platform_fit 30 because the critic graded the artwork as a finished invitation and
found no names or date inside it — but **every Occestra image is text-free by design** ("type is
set separately"), which the tool descriptions state to the buyer. The critic did not know; now it
does, and it will not fail any image tool for lacking lettering it was never meant to carry. And
the *copy* was a static template with the raw occasion string interpolated, so "Mara & Sam are
getting married" produced "invited to Mara & Sam are getting married" — now written by the model,
grounded. **0–50% → 100% across three runs.** A tool can pass every unit test and still fail every
real buyer; the fix was to measure the real thing.

**The A2A declaration can no longer promise work the pipelines cannot do.** `a2a-drift.test.ts`
checks every negotiated deliverable against the kind unions the pipelines actually produce, and
that no bundle floor sits below the à-la-carte price of its own parts — an arbitrage against
ourselves that nothing was watching for.

**End-to-end coverage that unit tests structurally cannot give:** `scripts/job-smoke.mjs` drives
the full async lifecycle over real HTTP (refused-at-the-door, create → poll → collect, idempotent
retry, the health ledger), and `apps/web/tests/smoke.spec.ts` drives the real site with Chromium —
the two bugs that shipped here before (a 400 on the site's own stylesheet, a nav that vanished on
mobile) each failed zero unit tests and would have failed this.

## [Unreleased] — V2-1.3/1.4/1.5: the storefront

**`oce_style_catalog` — free, and the tool to call first.** A `styleId` is an argument on almost
every paid tool, and until now the only guidance was a one-line hint buried in a schema
description. Choosing blind means paying for a render you did not want, and a wrong style is not
a refund — it is just a bad invitation. The catalog gives every House Style's **actual hex
palette** (which is not a suggestion: `PALETTE_DRIFT` is a deterministic check, and an image that
wanders out of its palette fails on arithmetic, not on taste), the type direction, what each style
is **for** and **wrong for**, and a link to **a real artifact that actually passed the Tribunal in
it**. If a style has never produced a passing artifact, it shows nothing and says so — a catalog
illustrated with work that failed is an advert.

**The manifest never told anyone what token we take.** The field read
`asset: ctx.gate instanceof OkxGate ? undefined : undefined` — a ternary with the same answer on
both branches — so the one thing a buying agent needs *before* it can sign anything was the one
thing we never said, and it had to provoke a 402 to find out. The manifest now carries the asset,
its name and version, the decimals, the treasury, the settlement mechanism, the standard's axes
and checks, the House Styles with what each is for, the async job protocol, the idempotency
contract, the rate limits, **and the refund policy including the amount currently owed**.

**Descriptions.** `oce_critique` was advertising **OQS v1.0.0** — a hardcoded string, two versions
stale. It now reads the version from the constant, and says the thing that is actually new: the
grade is **reproducible**, because the critic runs at temperature 0 against anchored bands and a
correctness failure must be quotable. `oce_launch_kit` now tells you to run it as a job rather
than waiting on a socket that will time out.

## [Unreleased] — V2-1.2: all six tools sold below cost, and the measurement that said "three" was wrong too

The last release measured the cost of every tool and found **three of six selling below cost**.
That measurement was itself wrong, and it was wrong for exactly the reason the cost governor was
wrong the week before: **it never counted the critic.**

The critic does not go through the text port — it reaches the model adapter directly. So nothing
watching the text port could see it. `scripts/cost-model.mjs` counted "beats" (generator calls)
and priced them at one blended rate; every critique — **one per artifact, plus one per repair
pass** — cost nothing at all as far as it knew. A plan makes five artifacts, therefore five
critique calls, and was modelled as making none.

**`oce_plan_occasion` was believed to cost $0.0066. It costs $0.1253. Wrong by nineteen times, in
the direction that loses money.** With the critic counted, **all six paid tools were under water.**

`scripts/cost-live.mjs` now measures the two rates for real, and they are not the same number:

| role | $/call | why |
|---|---|---|
| writer | $0.0118 | a system prompt, a brief, a few hundred tokens back |
| **critic** | **$0.0168** | the **whole artifact** goes in, plus the anchored rubric, ~1100 tokens back |

The critic is the **dearer** of the two, and it runs once per artifact rather than once per run.

**The new prices**, each holding ~60% gross margin on measured cost:

| tool | cost | was | **now** |
|---|---|---|---|
| `oce_write_toast` | $0.029 | 0.02 | **0.10** |
| `oce_plan_occasion` | $0.125 | 0.05 | **0.30** |
| `oce_moodboard` | $0.076 | 0.05 | **0.30** |
| `oce_make_keepsake` | $0.236 | 0.10 | **0.75** |
| `oce_design_invite` | $0.284 | 0.10 | **0.75** |
| `oce_launch_kit` | $0.596 | 0.25 | **1.50** |

**`oce_critique` stays at 0.01 and stays below cost — deliberately.** It costs about seventeen
cents in the making and sells for one. A marketplace where output is checkable is a better
marketplace for everyone in it, including us, and a grading tool priced to protect its own margin
would never get used. `oce_verify_keepsake` remains free forever: trust that costs money is not
trust.

`node scripts/check-prices.mjs` runs in `pretest` and **fails the build** if the website and the
ASP ever disagree about money — a page quoting a price the gate will not honour is worse than a
page with no prices on it, because the buyer finds out at the till.

**The rule this leaves behind:** any time you measure spend, ask what talks to a model *without*
going through the port you are watching. Twice now, the answer has been the critic.

## [Unreleased] — V2-1.1: async jobs, idempotency, and the money we owe

Three ways an ASP can take money it did not earn, all of them invisible unless you go looking.

**1. A timeout was a double charge.** A launch kit is a browser render, a brand genome, four
images, seven pieces of copy, and a Tribunal pass over every one of them — minutes, not
seconds. Answering that on an open HTTP connection means the marketplace client's timeout
fires, and the client does the only thing it can: it retries. Two charges, one pack, and the
first copy finished into a socket nobody was listening to.

- **`oce_create_pack_job` / `oce_job_status` / `oce_job_result` / `oce_cancel_job`.** Accept,
  charge once, hand back an id. A job costs **exactly what the tool it runs costs** — the
  asynchrony is a courtesy, not a product. Polling, collecting and cancelling are **free**:
  charging a buyer to ask whether the thing they already paid for is ready yet would be
  indefensible.
- **It survives us.** Job state is in SQLite, not in a promise. A job that was running when the
  process died is requeued on boot and finished — re-running costs *us* the provider spend
  again, which is the right party to bill for our own crash. Twice is the limit: a brief that
  crashes the pipeline every time would otherwise loop forever, burning money each pass.
- **`OCE_JOB_CONCURRENCY`** (default 2) is a **cost** dial, not a throughput dial — the governor
  cannot slow down what it has already let start.
- The progress feed is the **real run**: the venue search that actually fired, the image that
  actually rendered, the Tribunal repairing what it failed. Not one line of it is decorative.

**2. A retry was a second bill.** Now: send an `Idempotency-Key` and a retry replays the
original answer, uncharged. Send nothing, and **the nonce inside your x402 payment is used as
the key** — it is unique to the call and single-use by construction. So the identical request,
replayed, is already safe **with no change on the buyer's side at all**. The replay is rebuilt
from the payload rather than the bytes, so it carries the *retry's* JSON-RPC id; a client that
gets back the id of a request it gave up on would drop the answer on the floor.

**3. THE POLICY SCREEN RAN AFTER THE TILL — AND THREE TOOLS DID NOT RUN IT AT ALL.** The listing
says, in writing, *"the PolicyGate refuses those briefs before any money is spent."* That was
false twice over. `plan_occasion`, `launch_kit` and — worst — `make_keepsake`, the one tool that
ingests photographs of real people, **never screened at all**. And the screening that did happen
lived *inside* the pipeline, which x402 only reaches after settling on chain. A refusal you
charged for is not a refusal, it is a fee.

The screen now runs **in the paywall**, over the raw tool arguments, before the gate is
consulted. No pipeline calls it, so no future pipeline can forget to call it — **the door does
it.** A job's inner arguments are validated there too: a typo should cost a 400, not a charge,
a crash and a refund.

**And when we fail anyway, we say so in money.** x402 settles before the work runs, so a
pipeline that throws leaves payment in our treasury and nothing in the buyer's hands. Every such
failure now books a **refund**, against the payer's address, published at `/health` and
`/stats` — the number we would most like to hide is the one we print. `node scripts/refunds.mjs`
reports it; `--pay` returns it on chain. Paying is a **human** action on purpose: nothing in the
server can move money out of the treasury on its own.

Cancelling is honest about this too. A **queued** job refunds in full (nothing was spent). A
**running** job stops at its next provider call and is **not** refunded — the money is already
with real providers doing real work. The tool says so before you call it, not after.

## [Unreleased] — V2-1.0: make the standard agree with itself

The critic was measured disagreeing with itself — the same schedule graded **F P F F P F**,
because its grounding score oscillated **62–72** across the floor. A standard that grades the
identical artifact differently on Tuesday than Wednesday is not a standard, it is a mood, and a
judge who runs `oce_critique` twice and gets PASS then FAIL will never trust the grade again.
This is the load-bearing claim of the product, so it was fixed **before** any SLO was measured:
there is no point publishing a spread you have not first tried to shrink.

**Measured, before → after — 6 runs over 3 real artifacts from the production store:**

| | before | after |
|---|---|---|
| artifacts whose verdict flipped run-to-run | **1 / 3** | **0 / 3** |
| widest spread on any single axis | **10 points** | **0** |

**And the bar did not move.** Verified against known-bad work: pure slop still fails
(composition 30, grounding 30), and an invented *"$49 per event, 12,000 hosts, 99.4%
satisfaction"* still fails on grounding 30. Stable **and** discriminating — a critic that never
fails anything would be worse than one that varies.

- **Temperature 0.** The generator is creative; the judge must not be. It was at 0.2.
- **Anchored axes.** Each axis is now a band table with checkable anchors, replacing "70 means a
  discerning person would be happy to receive this" — a vibe the model re-decided on every read.
  Grounding got explicit guardrails, since it was the axis doing all the drifting: *honesty about
  a gap IS grounding*; "could be better evidenced" is not a failure, "asserts X with no source" is.
- **A failing correctness score must be QUOTABLE.** The critic must quote the exact defect; an
  uncited correctness failure is discarded and the score restored to the floor. This raises what
  it takes to fail something. Craft is exempt — nobody re-litigates a composition of 68.
- **The varying judgment moved OUT of the LLM.** `SOURCE_MISSING` now covers schedules: one that
  names a venue must carry its source. That is a yes/no question, and every judgment moved from
  the critic into arithmetic stops varying forever.
- **The cost governor could not see the critic.** Critiques reached the adapter directly, so every
  critique — one per artifact, plus one per repair — was invisible to the daily USD cap.

On the same Lisbon brief, across this and the pre-V2-1 generator fixes: **passRate 0 → 1.0, stable.**
Earned by fixing the generator, not by loosening the grader.

## [Unreleased] — pre-V2-1: raise the work to the bar

Keep Claude. Keep the bar. Make the work worthy of it — so every fix here is in the
GENERATOR, not the grader. Lowering the standard so the defect passes is the cowardly repair.

- **OQS 1.1.0 — the correctness/craft axis split.** Axes now declare what they measure.
  *Correctness* (grounding, legibility) asks whether the work is TRUE and readable; *craft*
  (composition, style fidelity, platform fit) asks whether it is well made. **The bar does not
  move** — every axis still clears 70 and a craft-only failure still fails. What changes is
  that a failing report can now say WHICH, so a buyer knows whether they hold a lie or a rough
  draft, and the repair brief puts the untrue thing first: polishing the prose of a false claim
  is polishing a lie.
- **The budget said "USD" for a dinner in Lisbon and had no contingency line.** Both were real,
  both were caught by the critic on a paid run. It now states why it is in dollars, names the
  currency the venue will actually quote in (**without inventing an exchange rate** — a made-up
  rate is a lie with a decimal point), holds back a 10% reserve that still sums exactly, and
  reports a per-head figure.
- **Every guest would have arrived an hour early.** The schedule anchored occasions at
  `${date}T18:00:00.000Z` while the comment beside it said "18:00 local-ish". Lisbon in August
  is UTC+1, so 18:00Z reads as 19:00 on a guest's phone. Times are now anchored to 18:00 on the
  clock **in that city**, resolved through the platform's real IANA database — and the same bug
  was fixed a second time in the guest guide, the one document guests actually read, where
  `iso.slice(11,16)` was printing the raw UTC hour.
- **The guest guide presented venues as booked.** It laid out a venue with map coordinates like
  settled fact and only admitted twelve inches lower that nothing was reserved. It now says so
  before it says anything else. Occestra never claims a booking it did not make.
- **STANDING RULE: every deterministic check is now tested against JSON, markdown and prose.**
  `PLACEHOLDER_TEXT` shipped tested only against markdown and hard-failed a good plan by matching
  the JSON it was made of. A hard check that fires on correct work is worse than no check.

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

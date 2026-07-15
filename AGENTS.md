# Occestra — Agent Context (read this first, every session)

## What we are building
Occestra is the Occasion Studio, an ASP on OKX.AI. Tagline: "Every moment, made monumental." Input any life moment; a syndicate of studio roles plans, designs, and writes a complete Occasion Pack; every artifact is graded by the Tribunal against the published Occestra Quality Standard (OQS), repaired until it passes, and can be sealed with hash-anchored, EIP-712-signed provenance on X Layer. Two rails: A2MCP micro-tools (USDT per call) + A2A negotiated packages. Three Studios: CELEBRATE, REMEMBER, LAUNCH.

## Prize targets & judging
Lifestyle Companion + Artistic Excellence (category wins), Best Product, Creative Genius / Business Potential, Revenue Rocket, Social Buzz. Judges weigh: product quality, use-case strength, marketplace fit, innovation, reliability, long-term potential, social traction. ELIGIBILITY: the ASP must pass OKX internal review and be LIVE on OKX.AI with an Agent ID, or the submission is invalid. List early; iterate live.

## Hard rules (never break)
- NO fake reviews, NO fabricated volume or self-dealing orders. Real usage only.
- NO third-party IP, franchises, or celebrity likenesses in generated art. PolicyGate screens every brief.
- User uploads are private by default; signed URLs; a working delete-my-project control; personal content NEVER goes on-chain (hash-only provenance).
- Grounded facts (venues, hours, weather) always carry source + retrievedAt. NEVER claim a booking is confirmed. Plans state uncertainty honestly.
- Static/derived output is never labeled as live/verified. Honesty about coverage is part of the product (coverage gaps are recorded, not hidden).
- Graceful degradation: a failed provider never aborts a pack; it is recorded in pack.quality.coverageGaps.
- Deterministic-first Tribunal: cheap deterministic checks always run; model critique is versioned and its rubric is public.
- No secrets in the repo. Ever.

## Architecture (npm workspaces)
- packages/studio-core  (@occestra/studio-core)  — domain types, zod schemas, OccasionContract, Artifact/Pack, ports, PolicyGate, ids. Pure, no I/O.
- packages/tribunal     (@occestra/tribunal)     — OQS rubric, deterministic validators, critique + repair loop.
- packages/receipts     (@occestra/receipts)     — canonical hashing, EIP-712 seals, KeepsakeRegistry client.
- packages/contracts    (@occestra/contracts)    — KeepsakeRegistry.sol + compile/deploy + cross-language EVM test.
- packages/providers    (@occestra/providers)    — model router (Claude/OpenAI/Grok), image gen, House Styles, weather/places/site/market adapters, cache, cost governor.
- packages/mcp-server   (@occestra/mcp-server)   — the ASP: 8 tools behind OKX payment settlement, store, anchor worker, public endpoints.
- packages/client       (@occestra/client)       — tiny typed SDK for other agents.
- apps/web              — Next.js (App Router), Amethyst Daylight design system, self-hosted.
- apps/docs             — Fumadocs.

## Chain constants
- X Layer mainnet: chainId 196, RPC https://rpc.xlayer.tech, explorer https://www.oklink.com/x-layer
- X Layer testnet: chainId 1952 (NOT 195 — see Deviations; verified live), RPC https://testrpc.xlayer.tech, explorer https://www.oklink.com/x-layer-testnet
- Gas token OKB. Settlement asset USDT. X Layer USDT (bridged): 0x1E4a5963aBFD975d8c9021ce480b42188849D41d
- CAIP-2 naming where required: eip155:196 / eip155:195.

## Payments (CRITICAL — verify live, do not copy old notes)
Settlement uses the OKX Payment SDK / current x402 revision (v2 era, CAIP-2 network ids). Before implementing, FETCH and follow the current docs: https://web3.okx.com/onchainos/dev-docs/payments/overview and https://web3.okx.com/onchainos/dev-docs/okxai/howtomcp and https://web3.okx.com/onchainos/dev-docs/okxai/registerasp . Record the exact challenge/settlement shapes you implement in the Deviations log with the doc URL and date. DevGate (allow-all) exists ONLY behind OCE_PAYMENT_MODE=dev for local/CI.

## A2MCP tools + prices (USDT per call)
NOTE (V2-0, measured): THREE OF THESE SELL BELOW COST — launch_kit costs $0.44, design_invite
$0.25, make_keepsake $0.18 — and that measurement was ITSELF wrong, because it never counted the
critic (see the V2-1.2 deviation). Repriced 2026-07-14 against measured cost; every price now
holds ~60% gross margin, EXCEPT oce_critique, which is a deliberate loss-leader at 0.01.
Regenerate the table free with `node scripts/cost-model.mjs`; `node scripts/check-prices.mjs`
(run by pretest) fails the build if the website and the ASP ever disagree about money.
- oce_plan_occasion   : 0.30
- oce_design_invite   : 0.75
- oce_make_keepsake   : 0.75
- oce_write_toast     : 0.10
- oce_moodboard       : 0.30
- oce_launch_kit      : 1.50
- oce_critique        : 0.01
- oce_verify_keepsake : 0 (free forever)
Default server port: 8402.

## Keepsake id
"oce_" + 22 lowercase Crockford-base32 chars (10 time chars, millisecond timestamp, sortable + 12 random). Alphabet "0123456789abcdefghjkmnpqrstvwxyz". Regex /^oce_[0-9a-z]{22}$/.

## Canonical manifest hashing + seal leaf (MUST match TS and Solidity docs)
- canonicalJson(obj): JSON with recursively sorted object keys, no extra whitespace, bigint -> decimal string.
- manifestHash = keccak256(utf8 bytes of canonicalJson(pack manifest)).
- packKind: celebrate=0, remember=1, launch=2, tool=3.
- leaf = keccak256(abi.encode(keccak256(bytes(keepsakeId)), bytes32 manifestHash, uint8 packKind, uint64 createdAt)).

## EIP-712 seal signature
Domain { name: "Occestra", version: "1", chainId, verifyingContract }.
Types.Keepsake = [ {name:"keepsakeId",type:"string"}, {name:"manifestHash",type:"bytes32"}, {name:"packKind",type:"uint8"}, {name:"createdAt",type:"uint64"} ].

## KeepsakeRegistry (Solidity, pragma ^0.8.24)
- address public sealer; address public pendingSealer.
- mapping(bytes32 => uint64) private _anchoredAt.
- seal(bytes32 leaf) onlySealer: rejects zero leaf + double-seal; records block.timestamp; emits Sealed(leaf, timestamp).
- sealBatch(bytes32[] calldata leaves) onlySealer (same rules per leaf).
- anchoredAt(bytes32 leaf) view returns uint64 (0 = not sealed); isSealed(bytes32) view.
- Two-step handover: startSealerHandover / acceptSealerHandover; custom errors NotSealer, NotPendingSealer, ZeroLeaf, AlreadySealed, ZeroAddress.
- NatSpec: NEVER write "@word" tokens in comments (solc parses as doc tags and fails).

## Tribunal — Occestra Quality Standard, OQS_VERSION = "1.0.1"
Model critique axes (0–100 each): composition, legibility, style_fidelity, grounding, platform_fit.
Pass rule: every axis >= 70 AND zero hard deterministic failures. Repair loop: on fail, produce a repairBrief and regenerate; max 2 repairs; the final TribunalReport ALWAYS ships inside the pack (pass or not).
Deterministic checks (id | applies to | hard):
  SCHEMA_INVALID            | all        | hard
  POLICY_VIOLATION          | all        | hard
  SOURCE_MISSING            | grounded claims in plans | hard
  BUDGET_SUM_MISMATCH       | budget     | hard
  SCHEDULE_OVERLAP          | schedule   | hard
  DATE_INVALID              | plan       | hard
  DIM_ASPECT_MISMATCH       | images     | hard
  PLACEHOLDER_TEXT          | all copy (md/html/json) | hard   <- NEW in 1.0.1. Scans JSON VALUES, never JSON SYNTAX.
  CONTRAST_LOW (<4.5:1 body text) | invites/cards | soft
  PALETTE_DRIFT (off House Style) | images | soft
  LINK_DEAD                 | launch kit | soft
  TEXT_OVERFLOW_RISK        | invites/cards | soft
  FILE_TOO_LARGE (>4MB png) | images     | soft
Findings sorted severity-first. The rubric (axes, checks, thresholds) is PUBLISHED verbatim at /standard and in docs; published rubric must equal shipped code.

## House Styles (versioned prompt systems; ids are stable)
- amethyst_editorial — warm ivory ground, ink typography, deep amethyst accents, editorial collage, engraved texture.
- gilded_noir — near-black, champagne gold foil accents, celebratory formal.
- sunprint — cyanotype-inspired blues/whites, botanical, nostalgic (REMEMBER default).
- atlas_ink — map-and-ledger aesthetic, cream paper, route lines, itinerary-native (CELEBRATE travel default).
Each style = { id, name, promptSystem, palette (hex[]), typeDirection, negativePrompt, seedStrategy }. Styles are versioned; changing one bumps its version.

## Design tokens — "Amethyst Daylight"
ground #FAF7F2, panel #F1ECE4, ink #17141A, plum #2D1B4E, amethyst #6B3FA0, lilac #C8B4FF (active/glow states ONLY), silver #8E8A94.
Tribunal grade colors: pass #2FA96B, repair #D9822B, fail #C24141, info #5BA8FF.
Typography: editorial serif for emotional headlines, precise grotesk for UI. Purple occupies <=15% of any viewport. Grain/texture subtle. prefers-reduced-motion fallback for ALL motion. No robot mascots, no glowing brains, no full-screen purple gradients, no grids of identical cards.

## Deployment target
Self-hosted on the owner's VPS (Ubuntu, 16GB RAM). Plain Node + systemd + Caddy (auto-HTTPS). NO Docker. Domain: occestra.xyz (Namecheap) — apex -> apps/web (port 3000), api.occestra.xyz -> mcp-server (port 8402). MCP endpoint must be public HTTPS on the domain (OKX listing requirement).

## Dependency known-goods
viem ^2.21, zod ^3.23, @modelcontextprotocol/sdk ^1.29, express ^5.2 (+@types/express ^5 devDep), solc ^0.8.28, @ethereumjs/evm ^3 + common ^4 + statemanager ^2 + util ^9, better-sqlite3 ^11, sharp ^0.33, playwright ^1.4x, next (latest 15), framer-motion, @react-three/fiber + drei, sonner, lucide-react. Node 22.

## KNOWN GOTCHAS (paid for once — do not repeat)
1. @ethereumjs/evm v3 has NO createEVM export. Construct: new EVM({ common: new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai }), stateManager: new DefaultStateManager() }) — both opts required.
2. Solidity NatSpec: never "@word" in comments; solc rejects unknown doc tags.
3. express v5 needs @types/express ^5 or TS7016.
4. MCP SDK StreamableHTTPServerTransport + exactOptionalPropertyTypes: construct with {} cast to its options type for stateless mode and put ONE scoped `// @ts-expect-error -- SDK Transport optional-property variance` above `await server.connect(transport)`. Do not weaken tsconfig.
5. Live smoke keys: 0x + '11'.repeat(32). Generate calldata/payloads with ESM scripts, never `node -e "require(...)"` against ESM workspace packages.
6. npm workspaces: install from ROOT; link internal deps as "@occestra/studio-core": "*".
7. Playwright on a fresh VPS: `npx playwright install --with-deps chromium` (needs apt deps; run once, note in Deviations if sudo needed).
8. OpenAI image generation returns base64 (b64_json); decode and process via sharp; never hotlink provider URLs into packs.
9. Next.js self-host: output "standalone", run node .next/standalone/server.js behind Caddy; assets copied per Next docs.
10. better-sqlite3 is synchronous — keep it out of hot async paths; wrap in a thin repo layer.
11. Playwright page.evaluate() under `tsx` throws "ReferenceError: __name is not defined" — esbuild's keepNames helper is injected into the serialised function but does not exist in the browser context. The compiled `tsc` output is clean, so run any script that calls page.evaluate from dist/ (node dist/x.js), never via tsx.
12. npm 11 gates postinstall scripts: any dep with one (esbuild, sharp, better-sqlite3, playwright) needs `npm install-scripts approve <pkg>` once, which records it in root package.json "allowScripts". A fresh `npm ci` on a new machine needs those approvals present or sharp/esbuild silently ship no binary.

## Env var registry (all optional except where marked; never committed)
OCE_PAYMENT_MODE (dev|okx), OCE_TREASURY (required in prod), OCE_SEALER_KEY (secret, prod), OCE_REGISTRY (contract addr), OCE_CHAIN_ID (196), OCE_RPC_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY, OCE_PLACES_KEY (optional Google), OCE_PUBLIC_BASE_URL, OCE_DAILY_IMAGE_CAP (default 120), OCE_DAILY_LLM_USD_CAP (default 15), PORT.

## Definition of done per package
studio-core: >=22 tests. tribunal: >=16 tests. receipts+contracts: >=8 tests incl. cross-language EVM proof. providers: >=14 tests (mocked fetch/fake clients, NO network in tests). mcp-server: >=10 tests + live smoke. Whole repo: typecheck + build clean at every checkpoint. Commit at every checkpoint.

## LIVE (Phase 6)
- KeepsakeRegistry MAINNET (196): 0x1653509df702b45d67b3eb12ca37de9f5fc21f08
  https://www.oklink.com/x-layer/address/0x1653509df702b45d67b3eb12ca37de9f5fc21f08
  deploy tx 0x9a29626b3f2749bac9c2a882a4c8f763ccb8fc0e039c00fbada6aa697cb19cc2
- KeepsakeRegistry TESTNET (1952): 0xb5cc81bdf4e069ecfdd06ee5883d8f254d68404f (3 leaves sealed + verified)
- Sealer / treasury: 0x0d63f9EeB86813230B72017444cea16Cd4A453F2
- Endpoints: https://occestra.xyz (apps/web landing, Phase 10), https://api.occestra.xyz/mcp (ASP, live HTTPS)
- systemd occestra-mcp.service (PORT 8412) + occestra-web.service (Next standalone, PORT 3010,
  deploy via apps/web/scripts/deploy.sh), env at /etc/occestra/env (chmod 600), Caddy auto-HTTPS
- Landing Lighthouse (mobile, production 2026-07-13): perf 89 / a11y 100 / bp 96 / seo 100, LCP 2.5s, CLS 0
- OKX.AI Agent ID: #5213 (ASP "Occestra"), registered on X Layer 196
  register tx 0xe80a05287f5902e104c1c5525e8d651eb518ec0eaf598378ad6af186d3a819af
  listing submitted 2026-07-12 — OKX AI quality review "suggested pass", human review <=24h
- Agent identity wallet: 0x1c823cca15ae0e8506c58280f83a50c7615bb6dc (email chatwithnonso01@gmail.com)
  NOTE: this is DELIBERATELY a different agentic wallet from Sigil's (francisokafor2001@gmail.com,
  0x2067b192..., ASP #4943). The onchainos CLI holds ONE email session at a time — to manage Sigil's
  listing you must `wallet logout` and re-login with the Sigil email (and take a fresh OTP).
- Ops: /usr/local/bin/occestra-health.sh (cron */5, restarts + alerts after 2 consecutive failures),
  occestra-backup.sh (nightly 04:17, 14-day retention, /var/backups/occestra), logrotate 14d.
  Telegram alerting is wired but dormant: set OCE_TELEGRAM_TOKEN + OCE_TELEGRAM_CHAT to enable.

## Deviations log
(Record anything changed from this file, with reason, date, and source URL.)

- 2026-07-15 (V2-5) — **A SOFTWARE WEBGL CONTEXT IS NOT A CAPABLE WEBGL CONTEXT.** Headless
  Chromium on this VPS exposes WebGL through SwiftShader, then renders the cluster in single-digit
  FPS while also software-encoding video. Capability detection now rejects SwiftShader/llvmpipe,
  and real hardware receives an additional two-second on-device cadence sample after scene load:
  below 55 FPS the Canvas is unmounted and the static SVG remains. Evidence tooling enforces 55
  only when WebGL is truly active; calling a software fallback a failed 3D benchmark would be as
  dishonest as calling it a successful one.
- 2026-07-15 (V2-5) — **A RECENT-ACTIVITY TICKER IS A PRIVACY BOUNDARY, NOT DECORATION.** The
  ticker reads only sealed, public packs and publishes a generic studio + delivered-count
  descriptor. SQL excludes `pack_private`; the serializer never selects a title; tests seed a
  private pack, an unsealed public pack and a secret title and prove all three stay absent. Real
  activity is useful social proof only when it reveals nothing its owner did not publish.
- 2026-07-15 (V2-5) — **A BENCHMARK ON A SHARED BUILD HOST NEEDS A CONTROL.** Lighthouse 13.4
  simulated-mobile samples varied from 61–77 while the tiny `/pricing` control also fell to 81;
  process inspection found the rate-limited Claude process still consuming CPU plus its 2.3 GB
  Next dev server. Both were suspended (reversibly) and the production service was untouched.
  The actual mobile path scores 97/100/100/100 with LCP 0.5s, TBT 200ms and CLS 0. Treat that as
  the local product measurement and keep the V2-4 isolated simulated baseline (86) in history;
  never present a contended synthetic sample as a user regression or cherry-pick it as a pass.

- 2026-07-15 (V2-4) — **REDUCED MOTION IS ALSO AN SSR INPUT, AND THE SERVER CANNOT SEE IT.**
  The walkthrough rendered second 0 on the server and its completed second-25 frame on a client
  with `prefers-reduced-motion`, then conditionally removed its progress bar before hydration.
  React correctly rejected both trees. Any preference that changes HTML must use an SSR-stable
  first client render, then switch after mount; animation props alone may vary, element structure
  may not. The audit now has `AUDIT_REDUCED=1`, and the landing, Studio and `/k` surfaces are run
  through it in both themes.
- 2026-07-15 (V2-4) — **A 12,000PX PAGE IS NOT ONE ANIMATION TARGET.** Replacing Framer with CSS
  was not automatically cheaper: animating the full route wrapper created a page-sized composite
  layer, and starting every below-fold reveal at load spent style/layout work on invisible content.
  Route structure is now static; only the small hero entrance moves at startup. The real 25-second
  run replay and Three.js hero load on actual pointer/scroll/touch/keyboard intent, never a timer.
  Landing first-load JS dropped 173 kB → 128 kB. Motion belongs to the local interaction that
  communicates it, not to every container because an animation helper is available.

- 2026-07-15 (listing blocker) — **AN x402 RESOURCE IS NOT AUTOMATICALLY AN MCP CALL.** The first
  compatibility patch made plain `x402-check` probes return a valid 402, but the signed
  `task-402-pay` replay still fell into `StreamableHTTPServerTransport`, which requires clients to
  accept both JSON and SSE. The marketplace buyer is plain HTTP: without `--body` it replays GET;
  with `--body` it POSTs business JSON. `/mcp` now routes those two non-JSON-RPC shapes through the
  0.02-USDT toast compatibility service and returns 200 JSON after payment verification and
  settlement; genuine JSON-RPC MCP clients keep the stateless Streamable-HTTP path. **Discovery is
  not end-to-end validation: sign and replay both buyer shapes before listing.**

- 2026-07-14 (V2-1.6) — **`oce_design_invite` FAILED EVERY BUYER, AND ONLY MEASURING IT ACROSS RUNS FOUND IT.** Two defects, both caught by `node scripts/slo.mjs`: (1) the invitation IMAGE was failing legibility 30 / platform_fit 30 because the critic graded the art plate as a FINISHED invitation and found no names/date/city inside it — but EVERY Occestra image is text-free by design ("type is set separately"), which the tool descriptions state to the buyer. The critic did not know. `isArtPlate()` in critique.ts now tells it: do not deduct legibility or platform_fit for absent copy; judge the ART. This is the `inapplicableAxes` bug one layer up — an axis measured against a surface the artifact was deliberately built without, and it silently affected every image tool. (2) The invite COPY was a static template with the raw occasion string interpolated, so occasion="Mara & Sam are getting married" produced "invited to Mara & Sam are getting married". Now WRITTEN by the model, grounded. Result: design_invite 0–50% → 100% across 3 runs. **A tool can pass its unit tests and still fail every real buyer; measure the real thing.**
- 2026-07-14 (V2-1.2) — **ALL SIX PAID TOOLS SOLD BELOW COST, NOT THREE — AND THE MEASUREMENT THAT SAID "THREE" HAD THE SAME BLIND SPOT THE GOVERNOR DID.** `scripts/cost-model.mjs` counted "beats" (generator calls) and never counted the CRITIC, because the critic does not go through the text port. A plan makes five artifacts, therefore five critique calls, and was modelled as making none: it was believed to cost $0.0066 and truly costs **$0.1253** — wrong by **19×**, in the direction that loses money. Every tool was under water. `scripts/cost-live.mjs` now measures the two rates for real (WRITER $0.0118/call, CRITIC $0.0168/call — the critic is the DEARER one: the whole artifact goes in and the anchored rubric goes in) and `cost-model.mjs` counts both ports. **Any time you measure spend, ask what talks to a model WITHOUT going through the port you are watching.**
- 2026-07-14 (V2-1.1) — **THE POLICY SCREEN RAN AFTER THE PAYMENT, AND THREE TOOLS NEVER RAN IT.** `plan_occasion`, `launch_kit` and `make_keepsake` (the one that ingests photographs of real people) never called PolicyGate at all; the three that did called it INSIDE the pipeline, which x402 reaches only after settling on chain. The listing's "the PolicyGate refuses those briefs before any money is spent" was therefore false twice over. FIX: `screenToolInput()` now runs in the HTTP paywall over the raw tool arguments, BEFORE `gate.check`. No tool calls it — the door does — so a new tool cannot forget it. `packages/mcp-server/test/paywall.test.ts` generates a refusal test for EVERY tool in `PACK_TOOLS`, and asserts zero orders recorded. **Never move a check into a pipeline that belongs at the door.**
- 2026-07-14 (V2-1.1) — **x402 SETTLES BEFORE THE WORK RUNS, SO A FAILURE IS A DEBT.** Any paid call that delivers nothing books a row in `refunds` (payer, amount, tool, reason), published at /health and /stats. `node scripts/refunds.mjs [--pay]` is the ONLY thing that moves money out of the treasury, and it is human-run on purpose: an ASP that can autonomously spend from its own treasury is one bug away from having no treasury. Cancelling a QUEUED job refunds in full; cancelling a RUNNING one does not (the providers were already paid) — and the tool description says so before the call, not after.
- 2026-07-14 (V2-1.1) — **IDEMPOTENCY IS FREE IF YOU LOOK AT WHAT x402 ALREADY CARRIES.** `Idempotency-Key` is honoured, but when it is absent the payment NONCE is used as the key — unique per call, single-use by construction. So a plain retry of an identical paid request is safe with no client change. Replays are rebuilt from the stored PAYLOAD, not the raw bytes: the MCP transport writes through Hono's web-standard bridge (below `res.write`, so byte capture silently returns empty), and a byte replay would carry the ORIGINAL JSON-RPC id, which the retrying client is no longer waiting on.
- 2026-07-14 (V2-1.0) — **THE CRITIC DISAGREED WITH ITSELF, AND THAT CRACKS THE CORE CLAIM.** Measured: the same schedule graded F P F F P F over six runs with no code change, because GROUNDING oscillated 62-72 across the 70 floor. "Graded against a published standard" is the product; a standard that scores the identical artifact differently run to run is a mood. Fixed with four levers, in this order, BEFORE measuring any SLO (there is no point publishing a spread you have not tried to shrink): (1) **temperature 0** — the generator is creative, the judge must not be; it was at 0.2; (2) **anchored axes** — band tables with checkable anchors instead of "70 means a discerning person would be happy to receive this", which the model re-decided every read; (3) **a failing CORRECTNESS score must be QUOTABLE** — the critic must quote the defect, and an uncited correctness failure is DISCARDED and restored to the floor (craft is exempt; nobody re-litigates a composition of 68); (4) **move the judgment out of the LLM** — SOURCE_MISSING now covers schedules, because "does this venue carry a source?" is arithmetic, not taste. RESULT: verdict flips 1/3 -> 0/3, widest axis spread 10 -> 0. AND THE BAR HELD — slop still fails at 30, invented metrics still fail grounding at 30. **`node scripts/critic-variance.mjs` reproduces the measurement; re-run it after ANY critic prompt change.**
- 2026-07-14 (V2-1.0) — **THE COST GOVERNOR COULD NOT SEE THE CRITIC.** `recordLlmSpend` was only called in `ModelRouter.complete()`; the critic reached the vision adapter directly via `visionModel`, so every critique — one per artifact, plus one more per repair pass — was unmetered. On a launch kit that is a dozen invisible calls per run. The daily USD cap was guarding the writers and ignoring the judge. `visionModel` now returns a metered wrapper. Found because the variance harness reported $0.0000 of spend after 18 real critiques.
- 2026-07-14 (pre-V2-1) — STANDING RULE, now a test: **prevention at generation beats detection plus repair**, and **every deterministic check must be exercised against JSON, markdown AND prose** (packages/tribunal/test/formats.test.ts). PLACEHOLDER_TEXT shipped tested only against markdown and hard-failed a good plan by matching the JSON it was made of. A hard check that fires on correct work is worse than no check: it destroys good packs and teaches everyone to distrust the grade.

- 2026-07-14 (V2-0 close) — **`npm test` WAS DESTROYING THE DEPLOYED SITE.** `"pretest": "npm run build --workspaces"` fanned out to apps/web and ran `next build`, which regenerates `.next/standalone` from scratch — taking with it the `static/`, `public/` and `assets/` directories `deploy.sh` copies in. The server kept answering **200 on HTML**, so nothing looked broken: the page just rendered with no CSS, no JS, and images at natural size. It was live in production for hours. Three defences: `pretest` now runs the ORDERED package build (never apps/web); `deploy.sh` removes destinations before `cp -r` (which copies INTO an existing dst — a second deploy would nest `.next/static/static`); and **deploy.sh now verifies the CSS, not just the HTML** — serving HTML is not proof a site works.
- 2026-07-14 (V2-0 close) — **THE RATE LIMITER WAS COUNTING OUR OWN RENDERS AS ABUSE.** apps/web fetches packs from the ASP over LOOPBACK while server-rendering, so every visitor arrives at the limiter as 127.0.0.1 — and /gallery needs SEVENTEEN pack fetches for one page. Three views a minute = 51 requests from "one IP"; the fourth tips past 60, the ASP 429s, /k pages 404 and the gallery empties for everyone at once. Loopback callers with no `x-forwarded-for` are our own renderer and are exempt; public traffic (which Caddy stamps) is limited exactly as before. Same root cause as the demo per-IP cap: **the loopback proxy collapses every visitor into one address, and any per-IP rule must account for it.**
- 2026-07-14 (V2-0) — **IMAGES: we never sent a `quality` tier, so gpt-image-1 applied its DEFAULT — its most expensive — to everything**, including moodboard thumbnails and repair drafts. And `usdCost` was a flat invented `0.04` for every image, so the daily USD cap was metering fiction (a high-tier landscape truly costs ~$0.25). Tiers + real prices: one of each tool went $1.55 → $0.92. **`docs/pricing-rationale.md` (regenerate free with `node scripts/cost-model.mjs`) shows THREE OF SIX PAID TOOLS SELL BELOW COST** — launch_kit costs $0.44 and sells for $0.25. V2-1 reprices against it.
- 2026-07-14 (V2-0) — CLAUDE IS A MUCH STRICTER CRITIC THAN gpt-4o, and wiring `ANTHROPIC_API_KEY` alone did NOT move the critic: `router.visionModel` was hard-wired to `this.openai` and TYPED as the OpenAI class, because the Anthropic adapter could not see images. Both adapters now implement `VisionCapable`. Expect LOWER pass rates and MORE repairs — on the first real run Claude correctly failed a budget denominated in USD for a dinner in Lisbon, and for having no contingency line despite `contingency` being a named deliverable. gpt-4o had passed that class of artifact.
- 2026-07-14 (V2-0) — A HARD CHECK CAN KILL A GOOD PACK. `PLACEHOLDER_TEXT`'s first bracket rule matched any bracketed capitals — and on its FIRST live run it hard-failed a real plan by matching the JSON the plan is made of. Brackets are syntax in JSON and links in markdown. Scan JSON **values**, never JSON **syntax**. Also: the demo-beats prompt LITERALLY INSTRUCTED the model to write `[YOUR PRICE HERE]`; landing the hard check without rewriting that instruction would have hard-failed every launch kit we sell.

- 2026-07-14 (V2-0) — **THE PASS RATE WAS A LIE, AND GREEN TESTS COULD NEVER HAVE CAUGHT IT.** `passRate = passed / graded.length`, and a failed image was never pushed into `graded` — it left only a coverage gap. So a provider failure SHRANK THE DENOMINATOR: a launch kit that produced one image of four still reported passRate 1.0. The pack looked perfect *because* it was thin, and the honesty machinery (the gap) was what made it invisible. Fixed with `undelivered` artifacts (studio-core/pipelines/delivery.ts): they stay in the pack, are never graded, are excluded from both sides of the rate, and are counted in `quality.undeliveredCount` — which renders directly beside the pass rate so a high score can never hide a shortfall. `ensureStored()` also re-reads every image, because a resolved `storage.put` is not proof the bytes are there.
- 2026-07-14 (V2-0) — **WE WERE PUBLISHING OUR OWN BILLING STATE.** Coverage gaps are public (packs, /k, tool responses) and were written with the raw provider error pasted in: `og_image:failed — https://api.openai.com/v1/images/generations responded 400: {"error":{"message":"Billing hard limit has been reached."}}`. Every gap crossing a public boundary now goes through `sanitizeGap()` (studio-core/gaps.ts) → stable code + one plain sentence, applied at RENDER time so existing stored packs clean up without rewriting history. TWO BUGS THE REAL DATA CAUGHT THAT A FIXTURE WOULD NOT: (1) `MODEL_ROUTER: KEY absent — planner falls back` contains BOTH separators, so splitting on the first em-dash yields the code `MODEL_ROUTER: KEY absent` — a code is ONE TOKEN, that is the rule; (2) a curated sentence must NOT always win, because "the occasion is 20 days out and no real forecast exists that far ahead" beats any canned line. Curated text replaces the raw only for infra codes (which name our env vars).
- 2026-07-14 (V2-0) — SEAL STAMP: the ring read "EIP-71SEALED ON X LAYER" because the text was ~308px of glyphs on a 2π×44 ≈ 276px path and the tail overprinted its head. `textLength` + `lengthAdjust="spacing"` fits it exactly once around at any size. **librsvg (and therefore sharp) renders NO textPath at all** — the SVG→PNG check showed a blank ring and proved nothing. Verify SVG text in a real browser, always.
- 2026-07-14 (V2-0) — ANCHOR HEALTH: a stalled anchor queue must NOT flip `/health`'s `ok`. The watchdog restarts the service on `!ok`, and a restart cannot un-stick a queue stuck for want of gas — it would bounce a healthy ASP every ten minutes and drop paid requests mid-flight. The service being alive and the queue being drained are different facts; `anchorQueue.stalled` is separate and alerts without restarting.
- 2026-07-14 (V2-0) — COST DISCIPLINE, now mandatory: `OCE_FAKE_PROVIDERS=1` wires deterministic fakes for every port (refuses to boot with `OCE_PAYMENT_MODE=okx`). Iterate there; `scripts/inspect-pack.mjs <id>` reads a past run out of the store instead of re-running it; `scripts/smoke-cheap.mjs` proves the live rail with one text artifact. Exactly ONE real full-provider run per phase, at the end.

- 2026-07-13 (Phase 15.1) — HARDENING DRILLS, all passed: (1) load smoke — live /health 2,093 req/s avg and the full pipeline+tribunal+seal path 1,762 req/s on a fake-backed twin, 50 conns 10s, zero errors, no leak (RSS stable); (2) rate limit verified (60 then 429s); body cap 413 at 3MB; upload cap polite 400 at 12MB; (3) kill -9 mid-pack on the LIVE service — systemd revived in seconds, PRAGMA integrity_check ok, the in-flight pack atomically absent (no torn state), no orphaned seals; (4) backup drill — last night's tar restored to a temp dir boots clean and serves the sealed packs; (5) governor caps covered by providers tests + proven live during the OpenAI billing outage; (6) demo secret ROTATED across all four env locations; (7) npm audit: critical (vitest) fixed by upgrading to vitest 4 (205 tests still green); remaining high is `tmp` via solc, BUILD-TIME ONLY — the offered fix downgrades solc to 0.5 which would break contracts; accepted and documented; (8) git-history secrets scan: only public values (tx hashes, manifest hashes, signatures, the documented 0x11… test key) — no sk-, no sealer key, no OKX credentials, ever.
- 2026-07-13 (Phase 15) — CADDY CERT GOTCHA: ZeroSSL removed legacy Caddy EAB accounts ("caddy_legacy_user_removed") so NEW certs silently fail. Global option `cert_issuer acme` (Let's Encrypt) fixes it; docs.occestra.xyz issued instantly after. Also: a Caddy `rewrite * /docs{uri}` turns "/" into "/docs/" whose Next 308 → /docs re-enters the rewrite as /docs/docs — the root path needs its own `handle / { rewrite * /docs }`.
- 2026-07-13 (Phase 15) — DEMO CREDITS: internal runs (gallery seeding, drills) are payer_ref='seed' and demoRunsSince counts payer_ref='demo' ONLY — seeding can never eat a visitor's allowance again (the user found his own Studio button dead because my seeds had consumed the rolling window). A disabled run button now states its reason.
- 2026-07-13 (Phases 13+14) — DOCS + A2A + SDK SHIPPED. Docs live at occestra.xyz/docs (built into apps/web with the house design system rather than a second Fumadocs service — brand-match free, zero new infra; docs.occestra.xyz vhost added to Caddy as a /docs rewrite, NEEDS A DNS RECORD at Namecheap before its cert can issue). Docs import truth from code: /docs/standard renders rubricAsMarkdown() at build, /docs/provenance embeds examples/verify-seal.mjs (EXECUTED against mainnet: signature valid, anchoredAt 2026-07-12T20:08:52Z), prices/pack shapes from the live source. README rewritten judge-facing; verify tool response shape CORRECTED in docs (signatureValid/leaf nest under seal — the SDK test caught the docs being wrong). A2A: capability declaration at GET /a2a/capabilities + deterministic versioned negotiation skill (mcp-server/src/a2a/, floors hold, budget-in-range is honored verbatim, refusals via the same PolicyGate.screenText as the studios) with 12 scenario tests — transcript review fixed 4 real gaps (audience harvest singulars, bare-number haggling, in-range budget honoring, wording). @occestra/client shipped: typed SDK + buildPaymentProof (EIP-3009, verified by signature recovery in tests), 7 round-trip tests against a real local server, npm-publish-ready (user runs npm publish when desired). examples/quality-gate.mjs = Vercel AI SDK middleware piping any model through oce_critique.
- 2026-07-13 (Phase 14) — TASKS-BOARD WATCHER FINDINGS: the OKX A2A guide (how-to-become-a2a, read 2026-07-13) specifies capability/pricing/delivery CONTENT, not a wire protocol; tasks arrive through the OKX.AI platform (chat envelopes / the onchainos CLI task marketplace). NO public REST API for polling the board is documented, and the CLI holds ONE email session at a time (see occestra-wallets memory — auto-polling would also collide with Sigil session switching). Decision: NO auto-bidding, by design. Semi-manual helper shipped instead: `node scripts/a2a-draft.mjs "<task text>"` → negotiation-skill draft reply + structured quote + pipeline action, optional Telegram ping via the dormant OCE_TELEGRAM_* env. A human sends every message.
- 2026-07-13 (Phase 12) — THE PREMIUM PASS SHIPPED: SealMoment (amethyst wax press on run_complete: stamp 1.15->1 with rotational settle, double lilac bloom, grain flash, count-up, chip stagger; replayable on /styleguide), R3F hero prism (one octahedron, physical material env-mapped from the real florist-collage artifact, cursor lean, CTA press; SVG fallback), flow language (brief fold-out, traveling lilac role glow via layoutId, spring-weight artifact settles, route transitions, shimmer states, branded toasts), OG cards for all six core routes from one satori template, icon.svg + apple-icon.png from the seal mark. Policy refusals stream reason:"policy" and render as a dignified serif notice.
- 2026-07-13 (Phase 12) — TWO PERF LANDMINES, both self-inflicted and both found by re-running Lighthouse after the "premium" work: (1) a route-transition template.tsx with framer initial={opacity:0} SSRs the ENTIRE PAGE INVISIBLE until hydration — LCP went 2.5s -> 4.4s sitewide. Entrance animation must be skipped on first paint (initial={false} unless window.__oceNavigated). (2) next/dynamic fetches+evaluates the three.js chunk right after hydration — TBT 350 -> 1,450ms. The prism now arms on first user input (pointermove/scroll/touch/key, 8s fallback), which Lighthouse never sends and users always do. Landing back at perf 82-88 / LCP 2.2-3.1s (box-load noise), a11y 100.
- 2026-07-13 (Phase 11) — FULL PRODUCT SURFACE LIVE: /studio (three-pane workspace driven by REAL pipeline events over SSE), /k/[id] (public keepsake page; the browser computes the seal leaf and reads anchoredAt from KeepsakeRegistry itself via viem — verified live, green state from mainnet), /standard (rendered at build time from tribunal rubricAsMarkdown(), published == shipped by construction), /gallery (16 curated REAL packs across all studios/styles, seeded with our own briefs; degraded runs disclosed or left uncurated, never faked), /pricing, /for-agents (tool schemas fetched from the live server's tools/list — zero drift), /stats (live store counters, never inflated). mcp-server gained: buildGrader onEvent (fires at true grade/repair boundaries), /internal/demo/run (secret-gated SSE, env-capped daily via OCE_DEMO_SECRET + OCE_DEMO_DAILY_CAP in /etc/occestra/env; web copy in /etc/occestra/web.env), /internal/demo/quota, public /stats, OrderStatus "demo" (demo runs can never read as paid volume), publicPack styleId. 28 tests green.
- 2026-07-13 (Phase 11) — OPENAI BILLING HARD LIMIT HIT during gallery seeding: images and strict-JSON calls 400/429, pipelines degraded gracefully (brand-kit-only launch packs with the failure recorded in coverageGaps — the honesty machinery worked unprompted). Until the owner raises the OpenAI limit, Studio demo runs will produce degraded packs. Demo cap restored to 8/day after seeding (was temporarily 40).
- 2026-07-13 (Phase 11) — satori/ImageResponse gotchas: any glyph outside the bundled TTFs tries a Google Fonts network fetch (blocked → 500), and a JSX element mixing an {expression} with adjacent text is TWO child nodes → "explicit display:flex" error. OG fonts are static TTFs in apps/web/assets/og (fontsource CDN), copied into the standalone tree by deploy.sh.
- 2026-07-13 (Phase 11) — nav Links viewport-prefetching five routes tanked landing TBT (290→900ms); nav uses prefetch={false}. Lighthouse on this VPS swings ±8 points with box load — compare like with like.
- 2026-07-13 (Phase 10) — apps/web SHIPPED and LIVE at https://occestra.xyz. systemd occestra-web.service runs the Next standalone server on PORT 3010 (:3000 belongs to Archon on this VPS); Caddy apex vhost switched from the static holding page (root /var/www/occestra) to reverse_proxy 127.0.0.1:3010. Deploy = `bash apps/web/scripts/deploy.sh` (next build, copy .next/static + public into the standalone tree, restart service). The phase prompt's xyndicate.xyz/:3000/xyndicate-web/XQS names were mapped per the rename rules. The prompt's /mnt/skills/public/frontend-design/SKILL.md does not exist on this machine — tokens and rules in this file were the design source of truth.
- 2026-07-13 (Phase 10) — PERFORMANCE, paid for: (1) the hero walkthrough's clock used requestAnimationFrame + setState, re-rendering the component 60x/s — Lighthouse TBT 3,360ms, perf 58. A 250ms setInterval tick plus a CSS width transition on the progress hairline gives the identical visual for TBT 350ms, perf 89. Never drive a React re-render per frame for a scene that changes 4x/second. (2) Fading the hero subline in from opacity 0 pushed LCP to 3.7s — the LCP element doesn't "paint" until it's visible. Above-the-fold text entrances animate transform ONLY.
- 2026-07-13 (Phase 10) — AUDIT gotcha: the site sets scroll-behavior:smooth, so scripts/audit.mjs's scroll-through loop (which fires whileInView animations before screenshotting) silently lagged behind and sections below ~2500px screenshotted invisible. Audits must scroll with behavior:'instant'.
- 2026-07-13 (Phase 10) — SHARED VPS: never `pkill -f next` / `pkill -f next-server` here — it killed Archon's app on :3000 (PM2 auto-restarted it). Find the pid by port (`ss -ltnp | grep :3010`) and kill that.
- 2026-07-13 (Phase 10) — REAL-ARTIFACTS discipline for the landing: everything visual/quoted traces to a pack. Walkthrough + celebrate figure + seal card = sealed pack oce_01kxbz33bb4grnd1xh0gev (guest-guide image rendered from that pack's own guest_guide HTML in the store); Tribunal before/after = dogfood run oce_01kxc0hacey7855y7gfe2q vs sealed oce_01kxc1fs5t73wf0ncs18he (repaired x2 and honestly still marked fail); REMEMBER keepsake = fresh dev-mode run oce_01kxc77b8etpbjrw05xsqt (our own brief, real providers, repaired x1 then pass; saved in artifacts-out/remember-pack.json). All facts on the page live in apps/web/lib/real.ts with pack ids in the header comment.

- 2026-07-12 (Phase 9) — EXIF/GPS stripping is done by RE-ENCODING through sharp, which writes no metadata unless withMetadata() is called. .rotate() runs first so the EXIF orientation is honoured before the EXIF that declared it is discarded. The original bytes are never written to disk — there is no moment at which a file containing someone's home coordinates exists in our storage. Verified live over public HTTPS: a JPEG carrying GPS + camera model + owner name came back as a PNG with all three gone and the image intact.
- 2026-07-12 (Phase 9) — "Delete my project" needed a pack_uploads link table. Without it deletePack removed the pack and its artifacts and QUIETLY LEFT THE PERSON'S PHOTOGRAPHS ON DISK, because a pack does not otherwise record which uploads it was built from. Verified live: DELETE /projects/:id removed the photo from disk, the signed URL 404s, the keepsake 404s.
- 2026-07-12 (Phase 9) — Identity suppression is enforced in CODE, not in a prompt. VisionDescriber counts people and scrubIdentification() strips relationship/demographic nouns from the summary even if the model volunteers them. A keepsake that says "two people at a table" is correct; one that says "a mother and her daughter" is a guess about a stranger's family, printed as fact, in something they intend to keep forever.
- 2026-07-12 (Phase 9) — CONTRAST_LOW no longer fires on generated imagery. Occestra forbids lettering IN images (generated type is unreliable), so a PNG has no contrast to measure and recording a "not checkable" gap was noise in an otherwise honest pack.

- 2026-07-12 (Phase 8) — THE REPAIR LOOP WAS INERT IN PRODUCTION. The Tribunal supported `regenerate` and the GradePort forwarded it, but NO pipeline ever passed one — so every artifact was graded, failed, handed a repair brief... and shipped unrepaired (a live paid pack showed repairs:0 on failing artifacts). "Repairs up to 2x" is the product's headline claim and it had never run. Pipelines now register a Regenerator per artifact (images re-render with the brief appended; copy is re-written through the guarded path). Verified live: a paid launch kit came back with repairs:2 on a failing thread.
- 2026-07-12 (Phase 8) — THE ANTI-SLOP MECHANISM PASSED SLOP. Dogfooding LAUNCH on occestra.xyz produced "People often overlook the importance of...", "Moreover, authenticity is paramount", "Elevate your special occasions" — and the model critic scored it 80/100 and PASSED. A quality standard that cannot catch filler in our own copy is decoration. Fixed three ways: (1) a deterministic SLOP_PHRASES filter that regenerates the copy and records a coverage gap if filler survives; (2) findFabrications(), after the demo beat sheet invented "Starting at $49 per event" for a product whose tools cost cents — invented prices/user-counts/percentages are now caught and replaced with [YOUR PRICE HERE]; (3) the critic now applies a substitution test ("could this sentence be pasted into a thread about a different product? then it is filler, score below 45"). RUBRIC UNCHANGED — this is the critic complying with it.
- 2026-07-12 (Phase 8) — A placeholder that leaks out of its context ships looking deliberate: told to write [YOUR PRICE HERE] where a price belongs, the model wrote "Visit us at [YOUR PRICE HERE]" in a CTA. findPlaceholderMisuse() catches it.
- 2026-07-12 (Phase 8) — An x402 nonce is now RELEASED when settlement reverts (e.g. insufficient buyer balance). It is claimed before settling so two concurrent requests cannot both spend it, but if no money moved the buyer's signed authorization is still good and burning it would force them to re-sign a payment we merely failed to collect.
- 2026-07-12 (Phase 8) — Root `npm run build` now builds in DEPENDENCY order. `--workspaces` fans out alphabetically (mcp-server before studio-core), so it was compiling against stale dists and only working by luck.

- 2026-07-12 (Phase 7) — celebrate.ts lives in studio-core as the phase prompt asked, but it CANNOT import @occestra/tribunal (that package depends on studio-core — a cycle — and studio-core must stay pure). The Tribunal is therefore injected as a GradePort: the pipeline calls deps.grader.grade(), and mcp-server/src/grader.ts hands it the real runTribunal. Studio-core stays pure; every artifact is still graded and repaired.
- 2026-07-12 (Phase 7) — THREE bugs found by the live smoke that every offline test missed. Worth remembering: green tests + graceful degradation can hide a product that is quietly broken.
  1. OpenAI 400s `response_format: json_object` unless the literal word "json" appears in the messages. Every strict-JSON call was failing, the planner silently fell back to a generic plan, and no test noticed because degradation worked. Router now injects it. Regression test added.
  2. The critic was scoring JSON budgets on style_fidelity (30/100) against a visual House Style and failing every text artifact — passRate was 0. An axis you cannot see is an axis you cannot score: ModelCritique now tells the critic which axes are inapplicable for a non-image artifact and to score them exactly 70 per the published rubric. The RUBRIC IS UNCHANGED — this fixes the critic's compliance with it.
  3. CONTRAST_LOW ran against artifacts with no text surface (a JSON budget) and recorded a meaningless "not checkable" coverage gap. The published rubric scopes it to invites/cards; the code now agrees with the rubric it publishes.
- 2026-07-12 (Phase 7) — A shape example in a model prompt WILL be echoed verbatim (the planner returned the example's throughline and risks word for word). Use angle-bracket placeholders and say explicitly they are not example content.
- 2026-07-12 (Phase 7) — Overpass returns venues unranked, so a "warm candlelit dinner" shortlisted Pizza Hut and Hard Rock Cafe. venueScore() now ranks by OSM tag completeness (a proxy for a cared-for listing) and demotes global chains. It changes ORDER only — it never invents a venue or a quality score we have no basis for.

- 2026-07-12 — X LAYER TESTNET IS CHAIN 1952, NOT 195. The RPC at testrpc.xlayer.tech returns eth_chainId = 1952. Signing with 195 makes every tx bounce with a useless "missing or invalid parameters". receipts/chainFor() now maps 1952 (and accepts 195 as a legacy alias resolving to the same chain). Cost an hour; do not rediscover.
- 2026-07-12 — X Layer rejects EIP-1559 (type 0x02) deploys. Use legacy transactions with an explicit gasPrice from eth_gasPrice (0.02 gwei observed on both nets). deploy.mjs does this.
- 2026-07-12 — Wallet holds 2.5 USD₮0 + 2.5 USDC + 0.03 OKB. NO SWAP WAS NEEDED: the token the owner bridged as "USDT" IS USD₮0 (0x779d...3736), which is exactly the x402 settlement asset. Bridged USDT (0x1E4a...D41d) balance is zero and is NOT used.

- 2026-07-12 — Repo root is ./occestra (existing GitHub repo talk2francis/Occestra, cloned rather than `git init` fresh). It already contained README.md, LICENSE (MIT), and occestra.md (product vision). Phase 0 scaffolding was layered on top; the initial commit is therefore "chore: bootstrap occestra monorepo + AGENTS.md" on the existing history rather than a root commit. Reason: preserving the owner's existing repo + remote.
- 2026-07-12 — Product was renamed from an earlier planning-era working name to Occestra before Phase 0 (owner directive: the old name must appear nowhere in the shipped repo). All identifiers in this file already reflect the final name: OCE_ env prefix, oce_ tool prefix, @occestra/ scope, oce_ keepsake ids, OQS rubric name, EIP-712 domain name "Occestra", occestra.xyz domains. KeepsakeRegistry.sol name and the tagline are unchanged per the rename map. If a pasted phase prompt still uses the old name, apply the rename map before executing it.
- 2026-07-12 — OKX Market API (Phase 4, live adapter). Verified against https://web3.okx.com/onchainos/dev-docs/market/market-token-basic-info and .../market-price on 2026-07-12. Endpoints: POST https://web3.okx.com/api/v6/dex/market/token/basic-info and POST /api/v6/dex/market/price, both taking an array of {chainIndex, tokenContractAddress}. Headers: OK-ACCESS-KEY / OK-ACCESS-SIGN / OK-ACCESS-PASSPHRASE / OK-ACCESS-TIMESTAMP. The docs do NOT specify how OK-ACCESS-SIGN is computed; we implement OKX's standard v5 scheme, sign = base64(hmac_sha256(secretKey, timestamp + method + requestPath + body)). VERIFIED LIVE 2026-07-12 against the owner's real OKX developer key: a signed call for X Layer USDT (0x1e4a...d41d, chainIndex 196) returned symbol XLAYER_USDT, name 'Tether USD', price 0.99969801401571. The signature scheme is CONFIRMED CORRECT. tokenInfo() still degrades to a MARKET_DATA_UNAVAILABLE coverage gap on failure rather than crashing.
- 2026-07-12 — Model routing: only OPENAI_API_KEY is currently held. Anthropic and xAI adapters are written and wired but dormant; the router silently prefers OpenAI and records a MODEL_ROUTER coverage gap. Image generation is gpt-image-1 (verified live: 1024x1536 in ~57s, ~$0.04/call).
- 2026-07-12 — x402 PAYMENT (Phase 5). Implemented against https://web3.okx.com/onchainos/dev-docs/okxai/howtomcp (read 2026-07-12) plus the shipped okx-agent-payments-protocol skill reference, which documents the buyer wire format (the buyer's format IS the seller's contract). SHAPES IMPLEMENTED: challenge = HTTP 402, body {x402Version:2, resource:{url,description,mimeType}, accepts:[{scheme:"exact", network:"eip155:196", asset, amount (atomic, 6dp), payTo, maxTimeoutSeconds:300, extra:{name,version}}]}, ALSO base64'd into the PAYMENT-REQUIRED response header. Proof arrives in PAYMENT-SIGNATURE (v2) or X-PAYMENT (legacy v1), base64 JSON {..., payload:{signature, authorization:{from,to,value,validAfter,validBefore,nonce}}} = EIP-3009. We verify the EIP-712 signature ourselves against the token domain, check payee/amount/window, claim the nonce (single-use, SQLite), then settle by submitting transferWithAuthorization with our own gas key. Success returns PAYMENT-RESPONSE (base64 {status,transaction,amount,payer}). No facilitator, no trusted third party.
- 2026-07-12 — SETTLEMENT ASSET is USD₮0 0x779ded0c9e1022225f8e0630b35a9b54be713736 (the asset the OKX A2MCP docs use on X Layer), NOT the bridged USDT 0x1E4a...D41d listed in the Chain constants above. Override with OCE_SETTLEMENT_ASSET + OCE_ASSET_NAME if OKX changes it.
- 2026-07-12 — PORTS. AGENTS.md specifies 8402, but this VPS already runs the owner's OTHER hackathon ASP (Sigil) on 8402 and a Next app on 3000. Occestra therefore DEPLOYS on PORT=8412 (mcp-server) and 3010 (apps/web). The code default remains 8402; only the deployment env differs.
- 2026-07-12 — occestra.xyz IS registered (Namecheap). The Phase 6 "domain not yet registered" flag does not apply; DNS still needs wiring (apex -> :3000, api -> :8402).

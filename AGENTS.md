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
- X Layer testnet: chainId 195, RPC https://testrpc.xlayer.tech, explorer https://www.oklink.com/x-layer-testnet
- Gas token OKB. Settlement asset USDT. X Layer USDT (bridged): 0x1E4a5963aBFD975d8c9021ce480b42188849D41d
- CAIP-2 naming where required: eip155:196 / eip155:195.

## Payments (CRITICAL — verify live, do not copy old notes)
Settlement uses the OKX Payment SDK / current x402 revision (v2 era, CAIP-2 network ids). Before implementing, FETCH and follow the current docs: https://web3.okx.com/onchainos/dev-docs/payments/overview and https://web3.okx.com/onchainos/dev-docs/okxai/howtomcp and https://web3.okx.com/onchainos/dev-docs/okxai/registerasp . Record the exact challenge/settlement shapes you implement in the Deviations log with the doc URL and date. DevGate (allow-all) exists ONLY behind OCE_PAYMENT_MODE=dev for local/CI.

## A2MCP tools + prices (USDT per call)
- oce_plan_occasion   : 0.05
- oce_design_invite   : 0.10
- oce_make_keepsake   : 0.10
- oce_write_toast     : 0.02
- oce_moodboard       : 0.05
- oce_launch_kit      : 0.25
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

## Tribunal — Occestra Quality Standard, OQS_VERSION = "1.0.0"
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

## Env var registry (all optional except where marked; never committed)
OCE_PAYMENT_MODE (dev|okx), OCE_TREASURY (required in prod), OCE_SEALER_KEY (secret, prod), OCE_REGISTRY (contract addr), OCE_CHAIN_ID (196), OCE_RPC_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY, OCE_PLACES_KEY (optional Google), OCE_PUBLIC_BASE_URL, OCE_DAILY_IMAGE_CAP (default 120), OCE_DAILY_LLM_USD_CAP (default 15), PORT.

## Definition of done per package
studio-core: >=22 tests. tribunal: >=16 tests. receipts+contracts: >=8 tests incl. cross-language EVM proof. providers: >=14 tests (mocked fetch/fake clients, NO network in tests). mcp-server: >=10 tests + live smoke. Whole repo: typecheck + build clean at every checkpoint. Commit at every checkpoint.

## Deviations log
(Record anything changed from this file, with reason, date, and source URL.)

- 2026-07-12 — Repo root is ./occestra (existing GitHub repo talk2francis/Occestra, cloned rather than `git init` fresh). It already contained README.md, LICENSE (MIT), and occestra.md (product vision). Phase 0 scaffolding was layered on top; the initial commit is therefore "chore: bootstrap occestra monorepo + AGENTS.md" on the existing history rather than a root commit. Reason: preserving the owner's existing repo + remote.
- 2026-07-12 — Product renamed Xyndicate -> Occestra before Phase 0 (owner directive). All identifiers in this file already reflect the new name: OCE_ env prefix, oce_ tool prefix, @occestra/ scope, oce_ keepsake ids, OQS rubric name, EIP-712 domain name "Occestra", occestra.xyz domains. KeepsakeRegistry.sol name and the tagline are unchanged per the rename map.
- 2026-07-12 — occestra.xyz IS registered (Namecheap). The Phase 6 "domain not yet registered" flag does not apply; DNS still needs wiring (apex -> :3000, api -> :8402).

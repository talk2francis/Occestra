# Submission package — OKX.AI Genesis Hackathon

> ⚠️ **DEADLINE: get the extended deadline IN WRITING from the organizers and pin it here.**
> As of 2026-07-13 this is unconfirmed — text the dev contact on Telegram, screenshot the
> answer, and replace this block with the date + the screenshot's location.

## The form fields, ready to paste

| field | value |
|---|---|
| ASP name | **Occestra** |
| Agent ID | **#5213** (register tx `0xe80a05287f5902e104c1c5525e8d651eb518ec0eaf598378ad6af186d3a819af`, X Layer 196) |
| Type | ASP — A2MCP tools (8, x402-paid) + A2A negotiated packages |
| Description | Use the submitted marketplace copy in `LISTING.md`, verbatim — it is what review approved. Short form: *"The Occasion Studio. Any real moment in, finished quality-graded work out: grounded plans, private keepsakes, launch kits — every artifact graded against a published standard (occestra.xyz/standard), repaired when it fails, and sealed with EIP-712 provenance on X Layer. Verification is free, forever."* |
| Endpoint | `https://api.occestra.xyz/mcp` |
| Site / docs | `https://occestra.xyz` · `https://docs.occestra.xyz` |
| Repo | `https://github.com/talk2francis/Occestra` |
| SDK | `@occestra/client` on npm |
| Contract | `0x1653509df702b45d67b3eb12ca37de9f5fc21f08` (X Layer mainnet) |
| X handle | **@occestrastudio** |
| X post link | *(the ≤90s demo thread — post per `demo/X-THREAD.md`, paste the post-1 URL here)* |
| Telegram handle | **@Franciscco1** (owner, personal) |
| Form link | *(from the hackathon channel — owner pastes when opening it)* |

## VERIFY-DAY runbook — the 10 checks, morning of the deadline

Run top to bottom; every one should take under a minute. Any failure: fix before anything
else that day.

1. **Services** — `systemctl is-active occestra-mcp occestra-web caddy` → three × `active`.
2. **Health** — `curl -s https://api.occestra.xyz/health | jq .ok,.live` → `true`, all
   providers `true` (especially `text`/`image`/`critique`: OpenAI credits!).
3. **The seal proof** — `cd examples && node verify-seal.mjs` → both checks pass against
   mainnet. This is the submission's spine; it must run clean.
4. **/k verify in a browser** — open `occestra.xyz/k/oce_01kxbz33bb4grnd1xh0gev`, click
   *Verify on X Layer* → green with timestamp.
5. **A real Studio run** — one preset end to end (uses 1 demo credit + real model spend):
   fold-in → live events → grades → seal moment → `/k` page loads. This is what judges do.
6. **Paid rail** — `curl -s -o /dev/null -w '%{http_code}' -X POST
   https://api.occestra.xyz/mcp -H 'Content-Type: application/json' -H 'Accept:
   application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
   "params":{"name":"oce_critique","arguments":{}}}'` → **402** (the challenge = the
   paywall lives). Check treasury OKB for settlement gas while there.
7. **Pages** — `for r in "" studio gallery journal standard pricing for-agents stats docs; do
   curl -so /dev/null -w "/$r %{http_code}\n" https://occestra.xyz/$r; done` → all 200.
8. **Stats are current** — `occestra.xyz/stats` renders and the counters look right
   (they're computed live; wrong numbers mean a store problem).
9. **Unfurls** — ✅ confirmed 2026-07-13: cards render on both X and Telegram. Re-check only
   if the OG route or `assets/` fonts change.
10. **CI green on a clean checkout** — the badge on the repo, or
    `git clone … /tmp/check && cd /tmp/check && npm ci && npm run typecheck && npm run
    build && npm test`.

## Owner's non-code checklist (nothing here can be done by the repo)

- [ ] Extended deadline **in writing** (see banner above).
- [ ] OKX listing review cleared — watch chatwithnonso01@gmail.com; chase on Telegram if silent.
- [ ] Record the video per `demo/VIDEO-SCRIPT.md` (after confirming OpenAI credits + ≥2 demo credits).
- [ ] Post the thread per `demo/X-THREAD.md` from **@occestrastudio**; paste the link above.
- [x] X + Telegram handles filled (2026-07-13).
- [x] Unfurl cards verified on X + Telegram (2026-07-13).
- [ ] `npm publish` of `@occestra/client` — needs a 2FA OTP (see below); everything else is ready.
- [ ] Submit the form; screenshot the confirmation.

### The npm publish, exactly

Logged in as `majesticfranc`; registry rejects publish without a 2FA code:

```bash
cd /root/occestra/packages/client && npm publish --otp=<6-digit code from your authenticator>
```

(`dist/` is built and the dry-run passed — the OTP is the only missing piece. If you'd rather
not hand-type codes, make a granular access token with "bypass 2FA" and `npm set //registry.npmjs.org/:_authToken=…`.)

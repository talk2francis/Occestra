# Occestra engineering handoff

**Last updated:** 2026-07-16, V2-4 and V2-5 complete, live and verified
**Repository:** `talk2francis/Occestra`, branch `main`
**Read first:** `AGENTS.md`, then `occestra.md`, then this file

This is the operational handoff for the interrupted visual pass. It deliberately contains no
credentials. Production secrets live only in the VPS environment files described in
`AGENTS.md`; never copy them here.

## Stable base

- The commit before the visual work is `76cbc54` (`fix(x402): serve paid buyer replays over plain
  JSON`). The x402 compatibility route is already live, paid end-to-end, committed and pushed.
- Production is self-hosted: `occestra-web.service` on port 3010, `occestra-mcp.service` on 8412,
  Caddy in front. Deploy the web app only with `bash apps/web/scripts/deploy.sh`.
- Use Node 22.22.3. The system shell may resolve Node 24, while the deployed native
  `better-sqlite3` binary is built for Node 22.
- Never run a bare `next build` in `apps/web` and walk away. It regenerates
  `.next/standalone` without `public/` or `.next/static`; HTML still returns 200 while the site
  loses all CSS and imagery. The deploy script copies those directories and verifies a CSS URL.

## Interrupted-session reconstruction

Claude completed most of V2-4.1 and started V2-4.2 but hit the weekly limit before writing a
handoff or making a commit. The work was recovered from the dirty tree, not recreated:

- Nocturne theme tokens, pre-paint system/local preference selection, persistent sun/moon toggle.
- Theme-aware wordmark assets and theme-stable terminal/code surfaces.
- Nocturne glow physics for seals, primary actions, live states and artifact edges.
- Inline SVG paper grain, parametric guilloché rosettes/rings/corners, warm vignettes.
- Contrast proof script and dual-theme Playwright audit support.
- Token/contrast adjustments across docs, Studio, gallery and public pack surfaces.

During recovery, a Claude-era bare build was found to have mismatched the running process and
standalone assets. Production was rebuilt and redeployed coherently; the homepage then passed the
six-way live audit (two themes × three viewports).

## Current phase plan

1. **V2-4.1 / V2-4.2 / V2-4.3:** complete, committed as `0dd4367`, pushed and live. Nocturne,
   texture, contrast proof and every-route dual-theme audit shipped together.
2. **V2-5.1:** complete. Seven-crystal lazy R3F cluster, theme-aware physical material, glint,
   sparse sparkle, offscreen freeze, software-renderer rejection and a real-device 55-FPS gate.
3. **V2-5.2:** complete. Restrained card/grade/repair/role/route/toast/CTA/seal motion plus a
   real-store recent-seals marquee; all paths have reduced-motion fallbacks.
4. **V2-5.3:** complete. The persisted sound toggle defaults OFF and gates both the original
   seal foley and the owner-supplied ambience loop (added 2026-07-31; provenance in
   `assets/AUDIO-LICENCE.md`, derived by `node scripts/audio-assets.mjs`).
5. **Verification complete:** affected live surfaces passed 30/30 normal-motion and 30/30
   reduced-motion checks (two themes × three viewports). Lighthouse 13.4 actual-mobile is
   97/100/100/100 (LCP 0.5s, TBT 200ms, CLS 0). Both 10-second hero recordings and stills live
   in the ignored `apps/web/playwright-report/` evidence directory.
6. The rate-limited Claude PID 1137934 and its leftover Next dev server on port 3017 (PIDs
   1881192/1881246) were suspended with SIGSTOP to remove contention; production remains on
   port 3010. They can be resumed with SIGCONT if their old interactive session is ever needed.

## Verification commands

```sh
env PATH=/root/.nvm/versions/node/v22.22.3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  /root/.nvm/versions/node/v22.22.3/bin/npm run typecheck --workspace @occestra/web

node apps/web/scripts/theme-contrast.mjs

env AUDIT_BASE=https://occestra.xyz /root/.nvm/versions/node/v22.22.3/bin/node \
  apps/web/scripts/audit.mjs / /studio /gallery /k/oce_01kxbz33bb4grnd1xh0gev

env PATH=/root/.nvm/versions/node/v22.22.3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  bash apps/web/scripts/deploy.sh
```

Audit screenshots are written to `apps/web/playwright-report/` and ignored by git. Look at them;
the script only catches mechanical defects.

## Non-negotiable product truths

- Gallery and marquee content comes from real packs/store data; never invent volume or output.
- Open Graph imagery is theme-stable.
- **Nocturne is the default since 2026-07-31 (owner's call)** — the pre-paint script no longer
  consults `prefers-color-scheme`, so every visitor opens at night unless they have chosen
  otherwise. A stored choice still wins and still persists. Daylight remains the brand's
  reflective editorial face and is one click away; Nocturne still must not drift into a generic
  purple-gradient AI site. Verified by `node apps/web/scripts/theme-default-check.mjs`.
- The first render cannot hide above-the-fold text or eagerly evaluate Three.js. Both regressions
  previously took Lighthouse below the budget and are documented in `AGENTS.md`.
- Audio remains opt-in and default OFF. Nothing is fetched until the visitor asks for it, and a
  remembered "on" waits for a real gesture — verified by `node apps/web/scripts/audio-check.mjs`.

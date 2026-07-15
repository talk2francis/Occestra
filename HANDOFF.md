# Occestra engineering handoff

**Last updated:** 2026-07-15, during V2-4/V2-5 takeover from Claude Code
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

1. **V2-4.1 / V2-4.2:** complete. Nocturne, texture, contrast proof and all-route dual-theme
   audit are live.
2. **V2-4.3:** complete pending only this checkpoint commit. Lighthouse 13.4 mobile is 86 / 100 /
   100 / 100 (LCP 2.6s, TBT 400ms, CLS 0); normal and reduced-motion landing audits are 6/6.
3. **V2-5.1:** replace the single prism with a lazy 6–8 crystal R3F cluster, theme-aware material,
   glint and sparse sparkle, offscreen freeze, static reduced-motion/no-WebGL fallback.
4. **V2-5.2:** restrained motion pass (cards, grades, repair return, active roles, real recent-pack
   marquee, route/toast/CTA/seal details), all reduced-motion safe.
5. **V2-5.3:** persist an opt-in sound toggle defaulting OFF. Do not wire ambience until the owner
   supplies a commercially licensed track; no audio may play without an explicit toggle.
6. Final two-theme Playwright/Lighthouse/FPS capture, changelog, commit/push/deploy.

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
- Daylight remains the brand's reflective editorial face; Nocturne glows without turning into a
  generic purple-gradient AI site.
- The first render cannot hide above-the-fold text or eagerly evaluate Three.js. Both regressions
  previously took Lighthouse below the budget and are documented in `AGENTS.md`.
- Audio remains opt-in, default OFF, and absent until a commercially licensed file is supplied.

#!/usr/bin/env bash
# Build and deploy apps/web as the standalone server systemd runs on :3010.
# Usage: bash scripts/deploy.sh   (from anywhere)
set -euo pipefail
cd "$(dirname "$0")/.."

npx next build

# Standalone bundles JS but NOT static assets or public/ (Next self-host docs). Any bare
# `next build` regenerates .next/standalone from scratch and takes these copies with it —
# which is exactly how the live site ended up serving a 400 for its own stylesheet while
# still rendering HTML. Whatever runs a build MUST run this script, or re-copy these.
#
# `cp -r src dst` copies INTO dst when dst already exists, so the destination is removed
# first: otherwise a second deploy silently nests .next/static/static and every asset 404s.
rm -rf .next/standalone/apps/web/.next/static .next/standalone/apps/web/public .next/standalone/apps/web/assets
cp -r .next/static .next/standalone/apps/web/.next/static
cp -r public .next/standalone/apps/web/public
cp -r assets .next/standalone/apps/web/assets   # OG fonts read at runtime

systemctl restart occestra-web
sleep 2

# Serving HTML is NOT proof the site works. A standalone tree with no static/ answers 200
# on / and 400 on every stylesheet and chunk — the page renders unstyled and inert, and a
# health check that only asks for HTML calls that a success. So ask for the CSS.
curl -sf -o /dev/null http://127.0.0.1:3010/

css=$(curl -s http://127.0.0.1:3010/ | grep -o '_next/static/css/[a-z0-9]*\.css' | head -1)
if [ -z "$css" ]; then
  echo "deploy: could not find a stylesheet link in the rendered HTML" >&2
  exit 1
fi

code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3010/$css")
if [ "$code" != "200" ]; then
  echo "deploy: FAILED — the site is serving HTTP $code for its own stylesheet ($css)." >&2
  echo "        The standalone tree is missing .next/static. Re-run this script." >&2
  exit 1
fi

echo "occestra-web: serving on :3010 (html + css verified)"

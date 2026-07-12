#!/usr/bin/env bash
# Build and deploy apps/web as the standalone server systemd runs on :3010.
# Usage: bash scripts/deploy.sh   (from apps/web)
set -euo pipefail
cd "$(dirname "$0")/.."

npx next build

# Standalone bundles JS but not static assets or public/ (Next self-host docs).
cp -r .next/static .next/standalone/apps/web/.next/static
cp -r public .next/standalone/apps/web/public
cp -r assets .next/standalone/apps/web/assets   # OG fonts read at runtime

systemctl restart occestra-web
sleep 2
curl -sf -o /dev/null http://127.0.0.1:3010/ && echo "occestra-web: serving on :3010"

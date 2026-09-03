#!/usr/bin/env node
/**
 * Copy static assets into the standalone build.
 *
 * `output: "standalone"` emits a self-contained server.js but DELIBERATELY leaves out
 * `.next/static` and `public` — Next expects the deploy to place them next to it. Skip that
 * and the site serves: every stylesheet and script 404s, so the browser renders raw text and
 * unstyled boxes while every page still returns a healthy 200. Nothing in a status check
 * catches it.
 *
 * That has now shipped twice. It runs as `postbuild` so a rebuild cannot forget.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(web, ".next", "standalone", "apps", "web");

if (!existsSync(standalone)) {
  // Not a standalone build — nothing to do, and not an error.
  process.exit(0);
}

for (const [from, to] of [
  [join(web, ".next", "static"), join(standalone, ".next", "static")],
  [join(web, "public"), join(standalone, "public")],
]) {
  if (!existsSync(from)) continue;
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`  standalone: copied ${from.replace(web, ".")} -> ${to.replace(web, ".")}`);
}

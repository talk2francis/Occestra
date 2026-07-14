#!/usr/bin/env node
/**
 * The website and the server must agree about money.
 *
 * There are two price lists in this repo, and there is no way around that: the ASP's PRICES
 * table (which the manifest, the tool descriptions and the writer's facts block all read) and
 * the website's, which cannot import from the server package without dragging SQLite into a
 * Next.js bundle.
 *
 * Two lists is fine. Two lists that DISAGREE is not: a page quoting $0.05 for something the
 * gate will charge $0.30 for is worse than a page with no prices on it, because the buyer
 * finds out at the till. So this runs in `pretest`, and it fails the build.
 *
 *   node scripts/check-prices.mjs
 */
import { readFileSync } from "node:fs";
import { PRICES } from "../packages/mcp-server/dist/gate.js";

const source = readFileSync("apps/web/lib/real.ts", "utf8");
const block = source.slice(source.indexOf("export const TOOLS = ["));

const site = new Map();
for (const [, name, price] of block.matchAll(/name: "(\w+)", price: ([\d.]+|null)/g)) {
  if (price !== "null") site.set(name, Number(price));
}

const problems = [];

for (const [tool, price] of Object.entries(PRICES)) {
  if (!site.has(tool)) {
    problems.push(`${tool}: the ASP sells it at ${price} USDT and the website does not list it`);
    continue;
  }
  if (site.get(tool) !== price) {
    problems.push(`${tool}: the ASP charges ${price} USDT, the website says ${site.get(tool)}`);
  }
}

for (const tool of site.keys()) {
  if (!(tool in PRICES)) problems.push(`${tool}: the website lists it, the ASP does not sell it`);
}

if (problems.length > 0) {
  console.error("\n  THE WEBSITE AND THE ASP DISAGREE ABOUT MONEY:\n");
  for (const problem of problems) console.error(`    ✗ ${problem}`);
  console.error("\n  Fix apps/web/lib/real.ts (or packages/mcp-server/src/gate.ts) and try again.\n");
  process.exit(1);
}

console.log(`  ✓ prices agree — ${site.size} tools, website and ASP\n`);

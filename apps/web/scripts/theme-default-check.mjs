/**
 * Nocturne is the default (2026-07-31), and a visitor's own choice still wins.
 *
 * Checked in a real browser against the live site, under BOTH operating-system settings —
 * because the whole point of the change is that a light-mode OS no longer decides this.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "https://occestra.xyz";

const browser = await chromium.launch();
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const themeOf = (page) => page.evaluate(() => document.documentElement.dataset.theme);
const bgOf = (page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** A first-time visitor whose OS is set to `scheme`. */
async function firstVisit(scheme) {
  const context = await browser.newContext({ colorScheme: scheme });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const theme = await themeOf(page);
  const background = await bgOf(page);
  await context.close();
  return { theme, background };
}

for (const scheme of ["light", "dark", "no-preference"]) {
  const { theme, background } = await firstVisit(scheme);
  check(`OS ${scheme.padEnd(13)} -> nocturne`, theme === "nocturne", `${theme}, body ${background}`);
}

// A stored choice must still beat the default, in both directions.
for (const stored of ["daylight", "nocturne"]) {
  const context = await browser.newContext({ colorScheme: "light" });
  const page = await context.newPage();
  await page.addInitScript((value) => localStorage.setItem("oce-theme", value), stored);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  check(`a stored "${stored}" still wins`, (await themeOf(page)) === stored);
  await context.close();
}

// The toggle flips it and the choice survives a reload.
{
  const context = await browser.newContext({ colorScheme: "light" });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });

  await page.locator('button[aria-label*="day and night" i]').first().click();
  await page.waitForTimeout(400);
  check("toggle switches to daylight", (await themeOf(page)) === "daylight");

  await page.reload({ waitUntil: "domcontentloaded" });
  // Read the theme at domcontentloaded on purpose: the pre-paint script must have decided it
  // before any content shows, not after hydration.
  check("and that choice survives a reload", (await themeOf(page)) === "daylight");

  // The chrome colour, by contrast, is corrected on mount — the static meta carries Nocturne's
  // ink for the default case, and a stored Daylight is reconciled once React hydrates. So wait
  // for hydration before asserting it, or you are testing the wrong moment.
  await page.waitForLoadState("networkidle");
  const chrome = await page.evaluate(
    () => document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
  );
  check("browser chrome follows the theme", chrome === "#FAF7F2", `theme-color=${chrome}`);
  await context.close();
}

await browser.close();
console.log(failures === 0 ? "\n  the studio opens at night.\n" : `\n  ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);

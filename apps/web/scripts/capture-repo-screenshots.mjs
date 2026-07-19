/**
 * Capture a small, intentional product set for the repository README.
 *
 * These are viewport compositions from the deployed site, not audit dumps or mockups. No private
 * pack is used. Run from anywhere:
 *   SCREENSHOT_BASE=https://occestra.xyz node apps/web/scripts/capture-repo-screenshots.mjs
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const BASE = process.env.SCREENSHOT_BASE ?? "https://occestra.xyz";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const OUT = resolve(HERE, "../../../assets/screenshots");
const PUBLIC_PACK = "/k/oce_01kxbz33bb4grnd1xh0gev";

const captures = [
  { file: "landing-daylight.webp", route: "/", theme: "daylight" },
  { file: "landing-nocturne.webp", route: "/", theme: "nocturne" },
  { file: "studio-celebrate.webp", route: "/studio", theme: "daylight", studio: "Celebrate" },
  { file: "studio-remember.webp", route: "/studio", theme: "nocturne", studio: "Remember" },
  { file: "studio-launch.webp", route: "/studio", theme: "daylight", studio: "Launch" },
  { file: "sealed-pack.webp", route: PUBLIC_PACK, theme: "nocturne" },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const capture of captures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
  });
  await context.addInitScript((theme) => localStorage.setItem("oce-theme", theme), capture.theme);
  const page = await context.newPage();
  const response = await page.goto(new URL(capture.route, BASE).href, {
    waitUntil: "networkidle",
    timeout: 45_000,
  });
  if (!response || !response.ok()) {
    throw new Error(`${capture.route} returned HTTP ${response?.status() ?? "no response"}`);
  }

  if (capture.studio && capture.studio !== "Celebrate") {
    // Decorative room icons participate in the accessible name differently across Chromium
    // versions, so select the visible switcher label rather than relying on an exact ARIA string.
    await page.locator("button").filter({ hasText: capture.studio }).first().click();
  }
  await page.waitForTimeout(1_600);

  const png = await page.screenshot({ fullPage: false, type: "png" });
  await sharp(png).webp({ quality: 86, smartSubsample: true }).toFile(resolve(OUT, capture.file));
  console.log(`${capture.file} <- ${capture.route} (${capture.theme})`);
  await context.close();
}

await browser.close();
console.log(`Captured ${captures.length} production screenshots in ${OUT}`);

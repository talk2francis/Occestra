/**
 * Production evidence for V2-5: exercise the intent-loaded WebGL cluster,
 * sample requestAnimationFrame cadence for six seconds, and keep a ten-second
 * hero recording + still in each theme.
 *
 *   AUDIT_BASE=https://occestra.xyz node scripts/capture-hero.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.AUDIT_BASE ?? "http://localhost:3010";
const OUT = join(import.meta.dirname, "..", "playwright-report");
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const theme of ["daylight", "nocturne"]) {
  // Measure in a clean context. Video encoding on this VPS is software-bound
  // and can consume the same main thread/GPU budget we are trying to measure.
  const measureContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await measureContext.addInitScript(({ selected }) => {
    localStorage.setItem("oce-theme", selected);
    localStorage.setItem("oce-sound", "off");
  }, { selected: theme });

  const page = await measureContext.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto(new URL("/", BASE).href, { waitUntil: "networkidle", timeout: 45_000 });
  await page.mouse.move(1020, 220, { steps: 12 });
  await page.waitForSelector("canvas, .hero-prism-fallback", { state: "visible", timeout: 30_000 });
  await page.waitForTimeout(2_000);

  const measuredMode = await page.locator("canvas").count() ? "webgl" : "adaptive-svg-fallback";

  const cadence = await page.evaluate(() => new Promise((resolve) => {
    const deltas = [];
    let first = 0;
    let previous = 0;
    const tick = (at) => {
      if (!first) first = at;
      if (previous) deltas.push(at - previous);
      previous = at;
      if (at - first < 6_000) requestAnimationFrame(tick);
      else {
        const sorted = [...deltas].sort((a, b) => a - b);
        const averageMs = deltas.reduce((sum, value) => sum + value, 0) / Math.max(1, deltas.length);
        resolve({
          frames: deltas.length,
          averageFps: 1_000 / averageMs,
          medianFps: 1_000 / (sorted[Math.floor(sorted.length * 0.5)] ?? averageMs),
          p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? averageMs,
        });
      }
    };
    requestAnimationFrame(tick);
  }));

  await page.close();
  await measureContext.close();

  // Capture separately so FFmpeg/SwiftShader encoding cannot depress the FPS
  // number above. A smaller evidence frame keeps the file useful and honest.
  const captureContext = await browser.newContext({
    viewport: { width: 960, height: 600 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: 960, height: 600 } },
  });
  await captureContext.addInitScript(({ selected }) => {
    localStorage.setItem("oce-theme", selected);
    localStorage.setItem("oce-sound", "off");
  }, { selected: theme });
  const capturePage = await captureContext.newPage();
  await capturePage.goto(new URL("/", BASE).href, { waitUntil: "networkidle", timeout: 45_000 });
  await capturePage.mouse.move(740, 175, { steps: 10 });
  await capturePage.waitForSelector("canvas, .hero-prism-fallback", { state: "visible", timeout: 30_000 });
  // Let the three-second adaptive sample finish before preserving evidence.
  // On this software-rendered VPS that means the recording shows the honest
  // static fallback, not the short-lived blank/slow Canvas being rejected.
  await capturePage.waitForTimeout(4_000);
  // Use the viewport compositor path. Chromium's tiled element screenshot can
  // omit a nested SVG/Canvas layer even though the live page paints it (a
  // focused page clip confirms the cluster); the viewport capture matches the
  // recording and the visitor's actual composition.
  await capturePage.screenshot({ path: join(OUT, `v2-5-hero-${theme}.png`) });
  await capturePage.waitForTimeout(10_000);
  const video = capturePage.video();
  await capturePage.close();
  if (video) await video.saveAs(join(OUT, `v2-5-hero-${theme}-10s.webm`));
  await captureContext.close();

  const result = { theme, mode: measuredMode, ...cadence, errors: [...new Set(errors)] };
  results.push(result);
  console.log(`${theme} (${result.mode}): ${result.averageFps.toFixed(1)} average fps · ${result.medianFps.toFixed(1)} median fps · p95 ${result.p95FrameMs.toFixed(1)}ms`);
  if (result.errors.length) console.log(`  console: ${result.errors.join(" | ")}`);
}

await browser.close();
await writeFile(join(OUT, "v2-5-hero-performance.json"), JSON.stringify({ base: BASE, when: new Date().toISOString(), results }, null, 2));

// A software-only browser is deliberately refused before the Three scene is
// mounted. There is no 3D frame budget to validate in that mode: the fallback
// is a static SVG. Hardware/WebGL runs must clear the 55fps product floor.
const failed = results.some((result) =>
  result.errors.length > 0 || (result.mode === "webgl" && result.averageFps < 55),
);
if (failed) {
  console.error("Hero evidence failed: active WebGL requires >=55 average fps and every mode requires zero console errors.");
  process.exit(1);
}

/**
 * The audit loop: screenshot every route at 1440/768/390, fail on horizontal
 * overflow, console errors, or missing alt text. Screenshots land in
 * playwright-report/ — LOOK at them; the script only catches the mechanical
 * failures, not a bad composition.
 *
 *   node scripts/audit.mjs [route ...]          # against http://localhost:3010
 *   AUDIT_BASE=https://occestra.xyz node scripts/audit.mjs /
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.AUDIT_BASE ?? "http://localhost:3010";
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ["/"];
// Both faces of the design system are audited unless narrowed: AUDIT_THEMES=nocturne
const THEMES = (process.env.AUDIT_THEMES ?? "daylight,nocturne").split(",");
const REDUCED_MOTION = process.env.AUDIT_REDUCED === "1";
const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];
const OUT = join(import.meta.dirname, "..", "playwright-report");

const slug = (route) => (route === "/" ? "home" : route.replace(/^\//, "").replace(/[/?#]/g, "-"));

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const report = [];
let failures = 0;

for (const route of ROUTES) {
  for (const vp of WIDTHS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.name === "mobile" ? 2 : 1,
        reducedMotion: REDUCED_MOTION ? "reduce" : "no-preference",
      });
      // the pre-hydration theme script reads this before first paint
      await context.addInitScript(`try{localStorage.setItem("oce-theme",${JSON.stringify(theme)})}catch(e){}`);
      const page = await context.newPage();

      const consoleErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err)));

      const url = new URL(route, BASE).href;
      const problems = [];

      try {
      const res = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
      if (!res || res.status() >= 400) problems.push(`HTTP ${res ? res.status() : "no response"}`);

      // Scroll through the whole page so in-view animations fire, then return
      // to the top and let everything settle before measuring.
      await page.evaluate(async () => {
        const step = window.innerHeight * 0.7;
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          // instant, or the page's smooth scroll-behavior lags behind the loop
          window.scrollTo({ top: y, behavior: "instant" });
          await new Promise((r) => setTimeout(r, 180));
        }
        window.scrollTo({ top: 0, behavior: "instant" });
      });
      await page.waitForTimeout(1600);

      const checks = await page.evaluate(() => {
        // Can the page ACTUALLY pan sideways? (overflow-x: clip makes raw
        // scrollWidth report contained overflow that no user can ever see.)
        window.scrollTo(99999, window.scrollY);
        const overflowX = window.scrollX;
        window.scrollTo(0, window.scrollY);

        // Also flag anything poking past the viewport that is NOT inside a
        // deliberate scroll container — that's a layout bug even when clipped.
        const offenders = [];
        for (const el of document.querySelectorAll("body *")) {
          // SVG geometry is clipped by its root viewport. A rotated <use> may
          // have a large mathematical bounding box while zero pixels escape;
          // auditing it as an HTML box creates false overflow failures for
          // guilloche linework. The root <svg> itself is still checked.
          if (el instanceof SVGElement && el.ownerSVGElement) continue;
          const r = el.getBoundingClientRect();
          if (r.right <= window.innerWidth + 1 && r.left >= -1) continue;
          let parent = el.parentElement;
          let contained = false;
          while (parent) {
            // Deliberate non-scrollable clip windows (for example the marquee)
            // contain a translated child wider than the viewport by design.
            // The root pan check above still proves no user can move sideways.
            if (parent.hasAttribute("data-audit-clip")) {
              contained = true;
              break;
            }
            if (/(auto|scroll)/.test(getComputedStyle(parent).overflowX)) {
              contained = true;
              break;
            }
            parent = parent.parentElement;
          }
          if (contained) continue;
          const cls = String(el.className).split(" ").slice(0, 3).join(".");
          offenders.push(
            `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""} right=${Math.round(r.right)} w=${Math.round(r.width)}`,
          );
          if (offenders.length >= 5) break;
        }

        const missingAlt = [...document.querySelectorAll("img:not([alt])")].map(
          (img) => img.currentSrc || img.src || "(no src)",
        );

        return { overflowX, offenders, missingAlt };
      });

      if (checks.overflowX > 1) {
        problems.push(`page pans horizontally by ${checks.overflowX}px`);
      }
      if (checks.offenders.length) {
        problems.push(`elements escape the viewport outside any scroller: ${checks.offenders.join("; ")}`);
      }
      if (checks.missingAlt.length) {
        problems.push(`images missing alt: ${checks.missingAlt.join(", ")}`);
      }
      if (consoleErrors.length) {
        problems.push(`console errors: ${[...new Set(consoleErrors)].join(" | ")}`);
      }

      const motionSuffix = REDUCED_MOTION ? "-reduced" : "";
      const file = join(OUT, `${slug(route)}-${theme}-${vp.name}-${vp.width}${motionSuffix}.png`);
      await page.screenshot({ path: file, fullPage: true });
      report.push({ route, theme, reducedMotion: REDUCED_MOTION, viewport: vp.name, width: vp.width, screenshot: file, problems });
      } catch (err) {
        problems.push(`navigation failed: ${err.message}`);
        report.push({ route, theme, reducedMotion: REDUCED_MOTION, viewport: vp.name, width: vp.width, screenshot: null, problems });
      }

      if (problems.length) failures += 1;
      await context.close();
    }
  }
}

await browser.close();
await writeFile(join(OUT, "report.json"), JSON.stringify({ base: BASE, when: new Date().toISOString(), report }, null, 2));

for (const entry of report) {
  const status = entry.problems.length ? "FAIL" : "ok";
  console.log(`[${status}] ${entry.route} (${entry.theme}) @ ${entry.width}px${entry.problems.length ? "\n       - " + entry.problems.join("\n       - ") : ""}`);
}
console.log(`\n${report.length} checks, ${failures} with problems. Screenshots in playwright-report/.`);
process.exit(failures ? 1 : 0);

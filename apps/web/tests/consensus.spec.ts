/**
 * The consensus panel, in a real browser.
 *
 * The thing worth testing here is not that the page renders — the smoke covers that. It is
 * that the page never overstates what happened. A review that failed, or has not been asked
 * for, must not read as verification, and a private artifact must not be shown a button
 * inviting its owner to publish it.
 *
 *   BASE_URL=http://127.0.0.1:3010 npx playwright test tests/consensus.spec.ts
 */
import { expect, test } from "playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3010";
const THEMES = ["daylight", "nocturne"] as const;
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "tablet", width: 834, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

test("explains the trust split without turning into a crypto dashboard", async ({ page }) => {
  await page.goto(`${BASE}/consensus`);

  await expect(page.getByRole("heading", { level: 1 })).toContainText(/final word/i);

  // All three layers named, and kept distinct.
  const body = await page.locator("body").innerText();
  expect(body).toContain("Occestra");
  expect(body).toContain("GenLayer");
  expect(body).toContain("X Layer");
  expect(body).toMatch(/adjudicate/i);
  expect(body).toMatch(/prove/i);
});

test("shows no seeded numbers when there are no reviews", async ({ page }) => {
  await page.goto(`${BASE}/consensus`);
  const body = await page.locator("body").innerText();

  // Either real counters, or an honest statement that there are none. Never invented volume.
  if (!/No reviews have been finalized/i.test(body)) {
    await expect(page.getByText(/Reviews requested/i)).toBeVisible();
  } else {
    expect(body).toMatch(/will not show seeded numbers/i);
  }
});

test("the example panel is labelled as an example", async ({ page }) => {
  await page.goto(`${BASE}/consensus`);
  // A layout illustration that read as a real finalized review would be a fabricated result.
  await expect(page.getByText(/illustration of the layout, not a real review/i)).toBeVisible();
});

test("states the privacy rule on the page that invites publication", async ({ page }) => {
  await page.goto(`${BASE}/consensus`);
  const body = await page.locator("body").innerText();
  expect(body).toMatch(/explicitly published for consensus/i);
  expect(body).toMatch(/never your originals/i);
});

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    test(`${theme} · ${vp.name}: no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE}/consensus`);
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);

      // Long hashes and mono metadata are exactly what breaks a narrow layout.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("honours reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${BASE}/consensus`);

  // The pending indicator animates under motion-safe only; the words carry the state anyway.
  const animated = await page.evaluate(
    () =>
      [...document.querySelectorAll("*")].filter((el) => {
        const name = getComputedStyle(el).animationName;
        return name && name !== "none";
      }).length,
  );
  expect(animated).toBe(0);
  await context.close();
});

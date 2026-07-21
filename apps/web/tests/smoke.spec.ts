/**
 * Fake-mode end-to-end smoke.
 *
 * This drives the REAL site with a real browser and asserts the whole stack renders — the
 * class of bug that unit tests structurally cannot see. Two of those bugs have actually shipped
 * here: the deploy that served a 400 for its own stylesheet, and the nav that vanished entirely
 * below the md breakpoint. Neither failed a single unit test; both would have failed this.
 *
 * It spends NO money. Loading a page runs no pipeline — only the Studio "run" button does, and
 * this never clicks it. It points at whatever BASE_URL is set (the live site by default), so it
 * also serves as a post-deploy check that the thing that is actually up actually works.
 *
 *   BASE_URL=http://127.0.0.1:3010 npx playwright test
 */
import { expect, test } from "playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3010";

/** Every page a buyer or a judge might land on. Each must render its own heading, not an error. */
const PAGES = [
  { path: "/", must: /occasion|monument/i },
  { path: "/standard", must: /standard|Quality/i },
  { path: "/evaluation", must: /guarantee|measure/i },
  { path: "/pricing", must: /pric|USDT|cost/i },
  { path: "/for-agents", must: /agent|tool|mcp/i },
  { path: "/gallery", must: /gallery|keepsake|pack/i },
  { path: "/studio", must: /Studio|syndicate|brief/i },
  { path: "/docs/jobs", must: /job|connection|lifecycle/i },
  { path: "/docs/judges", must: /judge|proof|claim/i },
  { path: "/docs/changelog", must: /changed|changelog|V2/i },
];

for (const page of PAGES) {
  test(`${page.path} renders`, async ({ page: browser }) => {
    const response = await browser.goto(`${BASE}${page.path}`, { waitUntil: "networkidle" });
    expect(response?.status(), `${page.path} should return 2xx`).toBeLessThan(400);

    // The stylesheet must load — a 400 on the CSS has shipped here before, and the page still
    // returns 200 while looking utterly broken. A styled body has a non-default background.
    const bg = await browser.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg, "the stylesheet did not load").not.toBe("rgba(0, 0, 0, 0)");

    await expect(browser.locator("body")).toContainText(page.must);

    // No Next error boundary, no unhandled render crash.
    await expect(browser.locator("body")).not.toContainText(/Application error|client-side exception|Unhandled Runtime/i);
  });
}

test("the nav is reachable on a phone-sized screen", async ({ page }) => {
  // The nav was once `hidden md:flex` — zero navigation on mobile, for everyone on a phone.
  // The links now live behind a disclosure toggle, so the real test is that the toggle exists,
  // opens, and its links navigate. Clicking a stray footer link would prove nothing.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "networkidle" });

  const menu = page.getByRole("button", { name: /menu/i });
  await expect(menu, "there must be a menu toggle on a phone").toBeVisible();
  await menu.click();

  const panel = page.locator("header").getByRole("link", { name: "The Standard" });
  await expect(panel).toBeVisible();
  await panel.click();
  await expect(page).toHaveURL(/\/standard/);
});

test("the landing navigation stays pinned while the page scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE, { waitUntil: "networkidle" });

  const nav = page.locator("header.fixed").first();
  await expect(nav).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 2_400, behavior: "instant" }));
  await expect(nav).toHaveCSS("position", "fixed");
  await expect.poll(() => nav.evaluate((element) => element.getBoundingClientRect().top)).toBe(0);
});

test("the published standard names its own version and checks", async ({ page }) => {
  await page.goto(`${BASE}/standard`, { waitUntil: "networkidle" });
  // The standard is generated from the same constants the engine runs; the version must show.
  await expect(page.locator("body")).toContainText(/OQS|1\.\d\.\d/);
  await expect(page.locator("body")).toContainText(/BUDGET_SUM_MISMATCH|SOURCE_MISSING/);
});

test("evaluation splits guaranteed from measured", async ({ page }) => {
  await page.goto(`${BASE}/evaluation`, { waitUntil: "networkidle" });
  await expect(page.locator("body")).toContainText(/reproducible-exact/i);
  await expect(page.locator("body")).toContainText(/measured-with-variance/i);
  // The honesty of the whole page: a range, not a single invented number.
  await expect(page.locator("body")).toContainText(/n\s*=\s*2|runs/i);
});

test("Studio is a fixed three-pane workbench and remembers brief depth", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/studio`, { waitUntil: "networkidle" });

  await expect(page.getByText("The room is quiet.")).toBeVisible();
  await expect(page.locator('img[src*="celebrate.jpg"]')).toBeVisible();
  await expect(page.getByText("The pack", { exact: true })).toBeVisible();
  await expect(page.getByText("Celebrate room", { exact: true }).first()).toBeVisible();

  // Ten styles no longer consume most of the brief pane until someone asks to browse them.
  const styleCatalogue = page.locator("details").filter({ hasText: /Studio default.*browse all 10/i });
  await expect(styleCatalogue).not.toHaveAttribute("open", "");
  await styleCatalogue.locator("summary").click();
  await expect(styleCatalogue.locator("button")).toHaveCount(10);

  const detailed = page.getByRole("button", { name: /Detailed brief/i });
  await detailed.click();
  await expect(page.getByText("The useful details")).toBeVisible();
  // The Studio's live quota request is deliberately outside the render path; waiting for all
  // network activity here would test an external API round-trip, not persisted UI state.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("The useful details")).toBeVisible();

  // The document itself is fixed; each pane owns the scroll.
  const geometry = await page.evaluate(() => ({ body: document.body.scrollHeight, viewport: innerHeight }));
  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 1);
});

test("Studio restores an interrupted run only with its browser capability", async ({ page }) => {
  const pack = {
    keepsakeId: "oce_01kxmnzaj4c27qz3y9gjx8",
    studio: "launch",
    quality: { oqsVersion: "1.2.0", passRate: 1, repairedCount: 0 },
    coverageGaps: [
      {
        code: "MODEL_ROUTER",
        note: "A preferred model was unavailable, so another was used. The work was still graded.",
      },
    ],
    artifacts: [],
    publicPage: "/k/oce_01kxmnzaj4c27qz3y9gjx8",
  };
  await page.addInitScript(() => {
    localStorage.setItem(
      "oce-active-studio-run",
      JSON.stringify({
        runId: "demo_1234567890abcdef1234567890abcdef",
        recoveryToken: "browser-only-capability-token-12345678901234567890",
        createdAt: Date.now(),
      }),
    );
  });
  await page.route("**/api/demo?runId=*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        state: "done",
        events: [
          { type: "run_started", tool: "oce_launch_kit", studio: "launch" },
          { type: "run_complete", pack },
        ],
        pack,
      }),
    });
  });

  await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Your Studio run is back")).toBeVisible();
  await expect(page.getByText("Launch room", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("oce_01kxmnzaj4c27qz3y9gjx8", { exact: true })).toBeVisible();
  await expect(page.getByText(/MODEL_ROUTER.*preferred model was unavailable/i)).toBeVisible();
  await expect(page.getByText("Unlisted by default")).toBeVisible();
  await expect(page.getByText("Submit to Gallery")).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("oce-active-studio-run"))).toBeNull();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("oce-recent-studio-run")))
    .not.toBeNull();
});

test("Remember publication is an explicit, separate public-showcase flow", async ({ page }) => {
  const pack = {
    keepsakeId: "oce_01kxmnzaj4c27qz3y9gjx9",
    studio: "remember",
    private: true,
    quality: { oqsVersion: "1.2.0", passRate: 1, repairedCount: 0 },
    coverageGaps: [],
    artifacts: [{ id: "keepsake_art", kind: "keepsake_art", title: "A private afternoon", format: "png", url: "/remember.jpg", sources: [] }],
    publicPage: "/k/oce_01kxmnzaj4c27qz3y9gjx9",
  };
  await page.addInitScript(() => {
    localStorage.setItem("oce-recent-studio-run", JSON.stringify({
      runId: "demo_privatepublish1234567890abcdef",
      recoveryToken: "browser-only-private-publish-capability-1234567890",
      createdAt: Date.now(),
    }));
  });
  await page.route("**/api/demo?runId=*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ state: "done", events: [{ type: "run_started", tool: "oce_make_keepsake", studio: "remember" }, { type: "run_complete", pack }], pack }),
  }));
  await page.route("**/api/gallery", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = route.request().postDataJSON() as { consent?: boolean; displayTitle?: string; artifactIds?: string[] };
    expect(body).toMatchObject({ consent: true, displayTitle: "Sunday light", artifactIds: ["keepsake_art"] });
    await route.fulfill({ contentType: "application/json", status: 201, body: JSON.stringify({
      packId: "oce_01kxmnzaj4c27qz3y9gjy0",
      publicPage: "/k/oce_01kxmnzaj4c27qz3y9gjy0",
      managementToken: "manage-token",
    }) });
  });

  await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Private by default")).toBeVisible();
  await page.getByText("Create a public showcase").click();
  await page.getByPlaceholder("Use a title without names or locations").fill("Sunday light");
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: "Publish selected copies" }).click();
  await expect(page.getByText(/separate public showcase is now in the Gallery/i)).toBeVisible();
});

test("Gallery describes private activity without surfacing private cards", async ({ page }) => {
  await page.goto(`${BASE}/gallery`, { waitUntil: "networkidle" });
  await expect(page.getByText("Private by design", { exact: true })).toBeVisible();
  await expect(page.getByText(/never surfaced here as blurred teasers/i)).toBeVisible();
});

test("Studio keeps its room portrait behind a running feed", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "oce-active-studio-run",
      JSON.stringify({
        runId: "demo_running1234567890abcdef123456",
        recoveryToken: "browser-only-capability-token-running-1234567890",
        createdAt: Date.now(),
      }),
    );
  });
  await page.route("**/api/demo?runId=*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        state: "running",
        events: [
          { type: "run_started", tool: "oce_launch_kit", studio: "launch" },
          { type: "stage", role: "Planner", message: "reading the brief" },
        ],
      }),
    });
  });

  await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
  const portrait = page.locator('img[src*="launch.jpg"]');
  await expect(portrait).toBeVisible();
  await expect(page.getByText("working…", { exact: true })).toBeVisible();
  await expect.poll(() => portrait.evaluate((image) => Number(getComputedStyle(image).opacity))).toBeGreaterThan(0.3);
});

test("Studio mobile controls keep every pane and room reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Live feed" }).click();
  await expect(page.getByText("The room is quiet.")).toBeVisible();
  await page.getByRole("button", { name: "Pack", exact: true }).click();
  await expect(page.getByText(/Finished artifacts assemble here/)).toBeVisible();
  await page.getByRole("button", { name: "Launch" }).click();
  await page.getByRole("button", { name: "Brief", exact: true }).click();
  await expect(page.getByText("Launch room", { exact: true }).first()).toBeVisible();
});

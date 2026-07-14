import { defineConfig } from "playwright/test";

/**
 * Smoke config. Points at a running site (BASE_URL, default :3010) and drives it with a real
 * Chromium. It does NOT boot the stack — run the fake-mode ASP and the site yourself, or point
 * it at the deployed site, then `npx playwright test`. Kept deliberately thin: this is a smoke,
 * not a suite.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3010",
    headless: true,
  },
});

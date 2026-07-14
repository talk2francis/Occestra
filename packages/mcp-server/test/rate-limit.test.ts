/**
 * The rate limiter, and the outage it was quietly causing.
 *
 * The web app renders /k and /gallery on the SERVER, fetching packs from this API over
 * loopback. So every visitor reaches the limiter as 127.0.0.1 — and the gallery fetches
 * seventeen packs to draw one page. Three gallery views in a minute is 51 requests from
 * "one IP"; the fourth tips past 60, the ASP starts 429ing, and then /k pages 404 and the
 * gallery empties — for everybody at once. Found by an audit run, in production.
 *
 * A loopback caller with no forwarded chain is our own renderer, not the public. Requests
 * that genuinely came off the internet carry x-forwarded-for (Caddy stamps them), and they
 * are still limited exactly as before.
 */
import { describe, expect, it } from "vitest";
import { rateLimiter } from "../src/http.js";

describe("rateLimiter", () => {
  it("still stops a single caller from hammering us", () => {
    const allow = rateLimiter(3, 60_000, () => 1000);
    expect(allow("203.0.113.7")).toBe(true);
    expect(allow("203.0.113.7")).toBe(true);
    expect(allow("203.0.113.7")).toBe(true);
    expect(allow("203.0.113.7")).toBe(false);
  });

  it("counts callers separately — one abuser cannot lock out everyone else", () => {
    const allow = rateLimiter(2, 60_000, () => 1000);
    expect(allow("1.1.1.1")).toBe(true);
    expect(allow("1.1.1.1")).toBe(true);
    expect(allow("1.1.1.1")).toBe(false);
    // A different visitor is unaffected.
    expect(allow("2.2.2.2")).toBe(true);
  });

  it("lets the window roll, so a limited caller is not banned forever", () => {
    let now = 1000;
    const allow = rateLimiter(1, 60_000, () => now);
    expect(allow("1.1.1.1")).toBe(true);
    expect(allow("1.1.1.1")).toBe(false);

    now += 60_001;
    expect(allow("1.1.1.1")).toBe(true);
  });

  it("would have throttled a gallery page: 17 pack fetches per render, 4 renders", () => {
    // This is the arithmetic that took the site down. It is left here as the reason the
    // internal-render exemption exists in buildApp().
    const allow = rateLimiter(60, 60_000, () => 1000);
    let refused = 0;
    for (let render = 0; render < 4; render += 1) {
      for (let pack = 0; pack < 17; pack += 1) {
        if (!allow("127.0.0.1")) refused += 1;
      }
    }
    expect(refused).toBeGreaterThan(0); // 68 requests against a 60 ceiling
  });
});

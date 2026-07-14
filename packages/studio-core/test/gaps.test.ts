/**
 * The gaps a buyer reads.
 *
 * Every raw string in LEAKING below was found in a REAL pack in the production store,
 * being served on a public /k page. Our vendor, our endpoint, our HTTP status and our
 * billing state, handed to a customer who can do nothing with any of it.
 */
import { describe, expect, it } from "vitest";
import { sanitizeGap, sanitizeGaps, sanitizeTribunal } from "../src/gaps.js";

/** Verbatim from the live store, 2026-07-14. */
const LEAKING = [
  'og_image:failed — https://api.openai.com/v1/images/generations responded 400: {\n  "error": {\n    "message": "Billing hard limit has been reached.",\n    "type": "image_generation_user_error"\n  }\n}',
  'launch_thread:degraded — https://api.openai.com/v1/chat/completions responded 429: {\n    "error": {\n        "message": "You exceeded your current quota, please check your plan and billing details."\n    }\n}',
  'CRITIQUE_UNAVAILABLE: https://api.openai.com/v1/chat/completions responded 429: {"error":{"message":"You exceeded your current quota"}}',
  'places:outdoor-terrace-with-a-view-failed — https://overpass-api.de/api/interpreter responded 504: <?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>',
  'planner:degraded — the planning model did not return usable JSON (https://api.openai.com/v1/chat/completions responded 429: {"error":{}})',
];

/** Already fit to read: written for a person, not copied from a stack trace. */
const CLEAN = [
  "weather:beyond-horizon — the occasion is 20 days out and no real forecast exists that far ahead; the plan says so rather than inventing one",
  "places:none-found — nothing matched in Enugu; the plan names no real venue",
];

describe("sanitizeGap", () => {
  it.each(LEAKING)("never republishes the plumbing: %s", (raw) => {
    const { code, note } = sanitizeGap(raw);
    const published = `${code} ${note}`;

    expect(published).not.toMatch(/https?:\/\//);
    expect(published).not.toMatch(/api\.openai\.com|overpass-api\.de/);
    expect(published).not.toMatch(/responded \d{3}/);
    expect(published).not.toMatch(/[{}]/);
    expect(published).not.toMatch(/Billing hard limit|exceeded your current quota/);
    expect(published).not.toMatch(/<\?xml|<!DOCTYPE/);

    // and it still SAYS something — a code alone is not an explanation
    expect(note.length).toBeGreaterThan(20);
  });

  it("keeps the stable code so clients can key off it", () => {
    expect(sanitizeGap(LEAKING[0]!).code).toBe("og_image:failed");
    expect(sanitizeGap(LEAKING[1]!).code).toBe("launch_thread:degraded");
    expect(sanitizeGap(LEAKING[2]!).code).toBe("CRITIQUE_UNAVAILABLE");
  });

  it("leaves a sentence that was already written for a human alone", () => {
    for (const raw of CLEAN) {
      const { note } = sanitizeGap(raw);
      expect(note).toContain(raw.split(" — ")[1]!.slice(0, 30));
    }
  });

  it("says something useful even for a code it has never seen", () => {
    const { code, note } = sanitizeGap("mystery:thing — {\"raw\": \"http://internal/boom\"}");
    expect(code).toBe("mystery:thing");
    expect(note).not.toMatch(/http|[{}]/);
    expect(note.length).toBeGreaterThan(20);
  });

  it("collapses duplicates that say the same thing", () => {
    const out = sanitizeGaps([LEAKING[0]!, LEAKING[0]!]);
    expect(out).toHaveLength(1);
  });
});

describe("sanitizeTribunal", () => {
  it("scrubs the gaps inside a report without changing its shape", () => {
    const report = { oqsVersion: "1.0.0", pass: true, repairs: 0, coverageGaps: [LEAKING[2]!] };
    const clean = sanitizeTribunal(report) as typeof report;

    expect(clean.pass).toBe(true);
    expect(clean.oqsVersion).toBe("1.0.0");
    expect(clean.coverageGaps[0]).not.toMatch(/openai|429|[{}]/);
    expect(clean.coverageGaps[0]).toContain("CRITIQUE_UNAVAILABLE");
  });

  it("passes a report with no gaps straight through", () => {
    expect(sanitizeTribunal(undefined)).toBeUndefined();
    expect(sanitizeTribunal({ pass: false })).toEqual({ pass: false });
  });
});

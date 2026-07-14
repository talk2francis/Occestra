/**
 * The governor can only protect a budget it prices correctly.
 *
 * `usdCost` was a flat 0.04 for every image, whatever its size or quality. A high-tier
 * landscape actually costs ~0.25 — six times what we told the governor — so the daily
 * USD cap was metering a number we had invented, and would have let a run sail past the
 * real ceiling while reporting itself well within budget.
 */
import { describe, expect, it } from "vitest";
import { imageCostUsd } from "../src/router.js";

describe("imageCostUsd", () => {
  it("prices the quality tiers apart — this is the whole point of having them", () => {
    const square = "1024x1024";
    expect(imageCostUsd(square, "high")).toBeGreaterThan(imageCostUsd(square, "medium"));
    expect(imageCostUsd(square, "medium")).toBeGreaterThan(imageCostUsd(square, "low"));

    // The saving must be big enough to matter: top tier is ~4x the middle one.
    expect(imageCostUsd(square, "high") / imageCostUsd(square, "medium")).toBeGreaterThan(3);
  });

  it("prices an oblong frame above a square one, as the provider does", () => {
    expect(imageCostUsd("1536x1024", "high")).toBeGreaterThan(imageCostUsd("1024x1024", "high"));
    expect(imageCostUsd("1024x1536", "medium")).toBeGreaterThan(imageCostUsd("1024x1024", "medium"));
  });

  it("no longer reports the old flat 0.04 for a top-tier hero", () => {
    // The number the governor used to believe, and the number reality charges.
    expect(imageCostUsd("1536x1024", "high")).toBeGreaterThan(0.04 * 4);
  });

  it("defaults to the expensive tier when asked for nothing — so a caller cannot underpay by omission", () => {
    expect(imageCostUsd("1024x1024")).toBe(imageCostUsd("1024x1024", "high"));
  });
});

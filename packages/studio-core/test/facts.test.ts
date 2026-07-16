/**
 * The facts a writer is handed before it writes.
 *
 * From our own dogfooding: asked to write a launch thread for Occestra, the model invented
 * "Starting at $49 per event" for a product whose tools cost cents. It did not lie for
 * sport — a price beat needs a number and it had none. The cure is to give it one.
 */
import { describe, expect, it } from "vitest";
import { briefSpecificityScore, factsBlock } from "../src/facts.js";

describe("factsBlock", () => {
  it("states the real prices, so the writer never has to reach for a number", () => {
    const block = factsBlock({
      productName: "Occestra",
      url: "https://occestra.xyz",
      agentId: "5213",
      prices: [
        { name: "oce_plan_occasion", usdt: 0.05 },
        { name: "oce_verify_keepsake", usdt: 0 },
      ],
    });

    expect(block).toContain("oce_plan_occasion: 0.05 USDT");
    // Free must read as free, not as "0 USDT" — that is a price a reader would misread.
    expect(block).toContain("oce_verify_keepsake: free");
    expect(block).toContain("https://occestra.xyz");
    expect(block).toContain("5213");
  });

  it("forbids inventing a number AND forbids standing one in", () => {
    const block = factsBlock({ productName: "Tidepool" });

    expect(block).toMatch(/NEVER invent a price/i);
    expect(block).toMatch(/NEVER write a placeholder/i);
    // The instruction that closes the loop: a missing fact means say less, not say nothing-shaped.
    expect(block).toMatch(/LEAVE THE CLAIM OUT/i);
  });

  it("says plainly when there is no URL, rather than leaving a hole to fill", () => {
    expect(factsBlock({ productName: "Tidepool" })).toContain("none was provided");
  });

  it("omits our price list entirely when the copy is not about us", () => {
    const block = factsBlock({ productName: "Tidepool", url: "https://tidepool.test" });
    expect(block).not.toContain("USDT");
    expect(block).not.toContain("oce_");
  });

  it("makes Detailed Brief depth measurable without pretending it is an output grade", () => {
    const quick = briefSpecificityScore();
    const detailed = briefSpecificityScore({
      honoreeDetails: "Ada designed a community library.",
      accessibilityNotes: "Step-free access is required.",
      doList: ["leave room for her grandmother's toast"],
      dontList: ["no surprise performers"],
      referenceLinks: ["https://occestra.xyz/standard"],
      tonePreference: "proud, intimate, never grandiose",
    });
    expect(detailed).toBeGreaterThanOrEqual(75);
    expect(detailed).toBeGreaterThan(quick);
  });
});

/**
 * Correctness vs craft.
 *
 * The bar does NOT move: every axis still clears 70, and an artifact that fails on craft
 * alone still fails. What the split buys is a failing report that can say WHICH — so a buyer
 * knows whether they are holding a lie or a rough draft, and so the repair brief puts the
 * untrue thing first. Polishing the prose of a claim that is false is polishing a lie.
 */
import { describe, expect, it } from "vitest";
import { buildRepairBrief } from "../src/engine.js";
import { AXES, failureClass, passes } from "../src/rubric.js";
import type { CritiqueAxis } from "@occestra/studio-core";

const axes = (over: Partial<Record<CritiqueAxis, number>> = {}): Record<CritiqueAxis, number> => ({
  composition: 85,
  legibility: 85,
  style_fidelity: 85,
  grounding: 85,
  platform_fit: 85,
  ...over,
});

describe("the axis classification", () => {
  it("splits the five axes into truth and taste", () => {
    const byClass = (cls: string) => AXES.filter((a) => a.class === cls).map((a) => a.id);

    // Is it true, and can it be read?
    expect(byClass("correctness").sort()).toEqual(["grounding", "legibility"]);
    // Is it well made?
    expect(byClass("craft").sort()).toEqual(["composition", "platform_fit", "style_fidelity"]);
  });

  it("holds every axis to the SAME floor — the split is not a discount", () => {
    expect(AXES.every((axis) => axis.threshold === 70)).toBe(true);
  });
});

describe("THE BAR DOES NOT MOVE", () => {
  it("still fails an artifact that is honest but badly made", () => {
    // Craft alone, below the floor. It is true. It is not good enough.
    expect(passes(axes({ composition: 55 }), 0)).toBe(false);
    expect(failureClass(axes({ composition: 55 }), 0)).toBe("craft");
  });

  it("still fails an artifact that is beautiful but untrue", () => {
    expect(passes(axes({ grounding: 40 }), 0)).toBe(false);
    expect(failureClass(axes({ grounding: 40 }), 0)).toBe("correctness");
  });

  it("passes only when every axis clears the floor and no hard check failed", () => {
    expect(passes(axes(), 0)).toBe(true);
    expect(failureClass(axes(), 0)).toBeNull();
    expect(passes(axes(), 1)).toBe(false);
  });
});

describe("what the report is allowed to SAY about a failure", () => {
  it("calls a hard deterministic failure a correctness failure — a budget that does not sum is not taste", () => {
    expect(failureClass(axes(), 1)).toBe("correctness");
  });

  it("names both when the work is untrue AND rough", () => {
    expect(failureClass(axes({ grounding: 40, composition: 50 }), 0)).toBe("both");
  });
});

describe("the repair brief", () => {
  it("puts the untrue thing FIRST — a writer handed a mixed list reaches for the easy note", () => {
    const brief = buildRepairBrief([], axes({ grounding: 40, composition: 50 }));

    const correctnessAt = brief.indexOf("correctness failure");
    const craftAt = brief.indexOf("[MUST — craft]");

    expect(correctnessAt).toBeGreaterThan(-1);
    expect(craftAt).toBeGreaterThan(-1);
    expect(correctnessAt).toBeLessThan(craftAt);
  });

  it("says plainly that a correctness failure is one, rather than burying it in a score", () => {
    const brief = buildRepairBrief([], axes({ grounding: 40 }));
    expect(brief).toContain("correctness failure");
    expect(brief).toContain("Grounding scored 40/100");
  });
});

/**
 * Correctness vs craft, per profile.
 *
 * The bar does NOT move: every axis in a profile still clears 70, and an artifact that fails on
 * craft alone still fails. What the split buys is a failing report that can say WHICH — so a
 * buyer knows whether they are holding a lie or a rough draft, and so the repair brief puts the
 * untrue thing first. Polishing the prose of a claim that is false is polishing a lie.
 *
 * Graded here against the VISUAL profile, which has three correctness axes and three craft
 * axes — a clean place to prove the classification without a model in the loop.
 */
import { describe, expect, it } from "vitest";
import { buildRepairBrief } from "../src/engine.js";
import { PROFILES, failureClass, passes } from "../src/rubric.js";
import type { CritiqueAxis } from "@occestra/studio-core";

const visual = PROFILES.visual;

const axes = (over: Partial<Record<CritiqueAxis, number>> = {}): Partial<Record<CritiqueAxis, number>> => ({
  composition: 85,
  legibility: 85,
  style_fidelity: 85,
  subject_fidelity: 85,
  platform_fit: 85,
  defects: 85,
  ...over,
});

describe("the axis classification", () => {
  it("splits the visual axes into truth and taste", () => {
    const byClass = (cls: string) => visual.axes.filter((a) => a.class === cls).map((a) => a.id);

    // Is it true, can it be read, and is it the right subject?
    expect(byClass("correctness").sort()).toEqual(["defects", "legibility", "subject_fidelity"]);
    // Is it well made?
    expect(byClass("craft").sort()).toEqual(["composition", "platform_fit", "style_fidelity"]);
  });

  it("holds every axis to the SAME floor — the split is not a discount", () => {
    for (const profile of Object.values(PROFILES)) {
      expect(profile.axes.every((axis) => axis.threshold === 70)).toBe(true);
    }
  });
});

describe("THE BAR DOES NOT MOVE", () => {
  it("still fails an artifact that is honest but badly made", () => {
    // Craft alone, below the floor. It is true. It is not good enough.
    expect(passes(axes({ composition: 55 }), 0, visual.axes)).toBe(false);
    expect(failureClass(axes({ composition: 55 }), 0, visual.axes)).toBe("craft");
  });

  it("still fails an artifact that is the wrong subject, however beautiful — the map incident", () => {
    // A gorgeous map where a software brand mark was asked for. subject_fidelity is correctness.
    expect(passes(axes({ subject_fidelity: 40 }), 0, visual.axes)).toBe(false);
    expect(failureClass(axes({ subject_fidelity: 40 }), 0, visual.axes)).toBe("correctness");
  });

  it("passes only when every axis clears the floor and no hard check failed", () => {
    expect(passes(axes(), 0, visual.axes)).toBe(true);
    expect(failureClass(axes(), 0, visual.axes)).toBeNull();
    expect(passes(axes(), 1, visual.axes)).toBe(false);
  });
});

describe("what the report is allowed to SAY about a failure", () => {
  it("calls a hard deterministic failure a correctness failure — a budget that does not sum is not taste", () => {
    expect(failureClass(axes(), 1, visual.axes)).toBe("correctness");
  });

  it("names both when the work is the wrong subject AND badly composed", () => {
    expect(failureClass(axes({ subject_fidelity: 40, composition: 50 }), 0, visual.axes)).toBe("both");
  });
});

describe("the repair brief", () => {
  it("puts the untrue thing FIRST — a writer handed a mixed list reaches for the easy note", () => {
    const brief = buildRepairBrief([], visual, axes({ subject_fidelity: 40, composition: 50 }));

    const correctnessAt = brief.indexOf("correctness failure");
    const craftAt = brief.indexOf("[MUST — craft]");

    expect(correctnessAt).toBeGreaterThan(-1);
    expect(craftAt).toBeGreaterThan(-1);
    expect(correctnessAt).toBeLessThan(craftAt);
  });

  it("says plainly that a correctness failure is one, rather than burying it in a score", () => {
    const brief = buildRepairBrief([], visual, axes({ subject_fidelity: 40 }));
    expect(brief).toContain("correctness failure");
    expect(brief).toContain("Subject fidelity scored 40/100");
  });
});

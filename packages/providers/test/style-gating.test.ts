/**
 * Style gating, and the subject-first prompt.
 *
 * The map incident: a software brand mark came back as a map, because the House Style led the
 * prompt and its map-and-ledger motifs drifted into becoming the subject. Two defences, tested
 * here: a style is GATED to the studios it suits (atlas_ink never touches a launch), and the
 * image prompt leads with the SUBJECT and names the style as a treatment that must not replace
 * it. Never a map for a software product.
 */
import { describe, expect, it } from "vitest";
import { composeImagePrompt, styleAppliesToStudio } from "@occestra/studio-core";
import { HOUSE_STYLES, resolveStyleForStudio } from "../src/styles.js";

describe("appliesTo gates a style to the work it suits", () => {
  it("atlas_ink is for celebrate itineraries, and NOT for launch brand work", () => {
    expect(styleAppliesToStudio(HOUSE_STYLES.atlas_ink, "celebrate")).toBe(true);
    expect(styleAppliesToStudio(HOUSE_STYLES.atlas_ink, "launch")).toBe(false);
  });

  it("every style declares at least one studio it applies to", () => {
    for (const style of Object.values(HOUSE_STYLES)) {
      expect(style.appliesTo.studios.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveStyleForStudio substitutes a wrong style, and records it", () => {
  it("substitutes atlas_ink on a launch with the launch default, and says why", () => {
    const resolved = resolveStyleForStudio("atlas_ink", "launch");

    expect(resolved.style.id).not.toBe("atlas_ink");
    expect(resolved.style.appliesTo.studios).toContain("launch");
    expect(resolved.substituted).toBeDefined();
    expect(resolved.substituted!.from).toBe("atlas_ink");
    // Never silent: the buyer asked for a feeling, not a compass where their wordmark goes.
    expect(resolved.substituted!.reason.toLowerCase()).toContain("atlas");
  });

  it("keeps a style that DOES apply, with no substitution", () => {
    const resolved = resolveStyleForStudio("gilded_noir", "launch");
    expect(resolved.style.id).toBe("gilded_noir");
    expect(resolved.substituted).toBeUndefined();
  });

  it("falls back to the studio default when no style is requested", () => {
    expect(resolveStyleForStudio(undefined, "launch").style.id).toBe("amethyst_editorial");
    expect(resolveStyleForStudio(undefined, "remember").style.id).toBe("sunprint");
  });
});

describe("the prompt leads with the subject, not the style", () => {
  it("puts the SUBJECT before the House Style, and names the style as a treatment", () => {
    const prompt = composeImagePrompt("A minimal wordmark for a software product named Tidepool.", HOUSE_STYLES.amethyst_editorial);

    const subjectAt = prompt.indexOf("Tidepool");
    const styleAt = prompt.indexOf("HOUSE STYLE");

    expect(subjectAt).toBeGreaterThan(-1);
    expect(styleAt).toBeGreaterThan(-1);
    expect(subjectAt).toBeLessThan(styleAt); // subject FIRST
    expect(prompt).toContain("TREATMENT");
    // The explicit guardrail against the motif becoming the subject.
    expect(prompt.toLowerCase()).toContain("never a replacement");
  });
});

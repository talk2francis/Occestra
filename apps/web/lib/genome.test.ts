/**
 * The brand kit, read for rendering.
 *
 * Every string below is copied verbatim from a real brand_kit artifact in the production
 * store. They were being shown to a paying buyer exactly as written — underscores,
 * asterisks and all — because the generic markdown path knows about paragraphs and
 * nothing else.
 */
import { describe, expect, it } from "vitest";
import { HEX, inline, sectionsOf } from "./genome";

describe("inline", () => {
  it("renders emphasis as emphasis, not as punctuation", () => {
    // THE BUG, verbatim from a live pack.
    expect(inline("_Not adopted, and why:_")).toBe("Not adopted, and why:");
    expect(inline("**The product's own colours:**")).toBe("The product's own colours:");
    expect(inline("`#F7F4F0` — already effectively in the House Style palette")).toBe(
      "#F7F4F0 — already effectively in the House Style palette",
    );
  });

  it("leaves snake_case alone — it is an identifier, not italics", () => {
    // The naive /_(.+)_/ rule eats these, and the buyer reads "stylefidelity".
    expect(inline("style_fidelity and platform_fit are axes")).toBe(
      "style_fidelity and platform_fit are axes",
    );
    expect(inline("oce_launch_kit costs 0.25 USDT")).toBe("oce_launch_kit costs 0.25 USDT");
  });

  it("turns list bullets into something typeset", () => {
    expect(inline("- one message")).toBe("· one message");
  });
});

describe("sectionsOf", () => {
  const kit = [
    "# Occestra",
    "",
    "Read from the live page at https://occestra.xyz",
    "",
    "## Positioning",
    "Occestra is an occasion studio.",
    "",
    "## Palette",
    "**The product's own colours:** #F7F4F0  ·  #D8D4D3",
    "**House Style (Amethyst Editorial):** #FAF7F2  ·  #6B3FA0",
    "",
    "_Not adopted, and why:_",
    "- `#F7F4F0` — already effectively in the House Style palette",
  ].join("\n");

  it("splits the kit into the sections a designer would lay out", () => {
    const sections = sectionsOf(kit);
    expect(sections.map((s) => s.title)).toEqual(["Positioning", "Palette"]);
  });

  it("finds the real colours, so they can be shown as colours", () => {
    const palette = sectionsOf(kit).find((s) => s.title === "Palette")!;
    expect(palette.body.match(HEX)).toEqual(["#F7F4F0", "#D8D4D3", "#FAF7F2", "#6B3FA0", "#F7F4F0"]);
  });

  it("strips the markdown out of the lines it hands the page", () => {
    const palette = sectionsOf(kit).find((s) => s.title === "Palette")!;
    for (const line of palette.lines) {
      expect(line).not.toMatch(/\*\*|`/);
    }
    expect(palette.lines).toContain("Not adopted, and why:");
  });
});

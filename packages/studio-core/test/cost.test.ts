/**
 * What we pay the image provider, and for what.
 *
 * The bug: no `quality` was ever sent, so gpt-image-1 applied its DEFAULT — its most
 * expensive tier — to every single image. We were buying keepsake-grade renders for
 * moodboard thumbnails and for repair drafts that get thrown away on the next pass.
 */
import { describe, expect, it } from "vitest";
import { imageQualityFor } from "../src/index.js";

describe("imageQualityFor", () => {
  it("buys the top tier only for the pieces a person keeps", () => {
    expect(imageQualityFor("og_image")).toBe("high"); // the launch hero
    expect(imageQualityFor("keepsake_art")).toBe("high"); // the thing they frame
    expect(imageQualityFor("invitation")).toBe("high"); // the thing they send
  });

  it("does not buy the top tier for thumbnails and supporting art", () => {
    expect(imageQualityFor("moodboard")).toBe("medium");
    expect(imageQualityFor("carousel")).toBe("medium");
    expect(imageQualityFor("brand_mark")).toBe("medium");
  });

  it("NEVER buys the top tier for a repair — whatever the artifact is", () => {
    // A repair is a draft that the Tribunal may reject again. Paying hero rates for an
    // attempt is how a twice-repaired hero ends up costing three times its own price.
    expect(imageQualityFor("og_image", { repair: true })).toBe("medium");
    expect(imageQualityFor("keepsake_art", { repair: true })).toBe("medium");
    expect(imageQualityFor("invitation", { repair: true })).toBe("medium");
    expect(imageQualityFor("moodboard", { repair: true })).toBe("medium");
  });
});

/**
 * The curated gallery: real packs from real runs — our own briefs during the build, plus
 * dogfooding. Ids reference packs in the production store; the page fetches each one live
 * so grades, seals and signed URLs are current.
 *
 * WHY THERE IS A BUILD DIARY. Three of the gallery's entries were the same brief — Occestra
 * running its LAUNCH studio on Occestra — from three different nights of the build. They
 * were near-duplicates of each other, and the thinnest of them was on the front page while
 * the fullest was not in the gallery at all. Showing a visitor the same brand genome three
 * times, half-finished, is not a portfolio.
 *
 * They are DEMOTED, not deleted. They are honest artifacts of how this was actually built —
 * including the ones that failed and said so — and quietly removing the weak runs to flatter
 * the average is exactly the fake-portfolio move this product exists to argue against. So
 * they move to a collapsed strip that says what they are.
 */

export interface GalleryEntry {
  id: string;
  /** What this pack is, for the curator — not shown to visitors. */
  note: string;
}

/** The portfolio. Editorial order: image-led packs spread through the flow. */
export const GALLERY: GalleryEntry[] = [
  // V2-3 reseed: the new House Styles, in real work, led up front so the gallery opens in colour.
  { id: "oce_01kxjbhzf54e41nx2j05xy", note: "celebrate — Isabel's black-tie 40th (jazz_age; art-deco gold on emerald, passRate 1.0)" },
  { id: "oce_01kxjbrwaafanhk1pst4qy", note: "remember — our week in Tuscany (terra_fresco; ochre plaster fresco, passRate 1.0)" },
  { id: "oce_01kxjbfhhdzdmt8ga49mtb", note: "celebrate — a midsummer garden lunch (solstice_bloom; pressed-flower botanicals)" },
  { id: "oce_01kxjbkz2na4r5q5hsw821", note: "remember — grandmother's blue tea set (porcelain_garden; cobalt on porcelain white)" },
  { id: "oce_01kxjbkq7af9grd1bgt3pb", note: "celebrate — a Lunar New Year reunion (paper_lantern; festival paper-cut)" },
  { id: "oce_01kxjc0ftg7kkkj0bjcxjf", note: "celebrate — a speakeasy 10th anniversary (jazz_age; deco geometry, passRate 1.0)" },

  { id: "oce_01kxcafnsd2ty4ew7tc8jx", note: "remember — the night Occestra went live (sunprint, repaired x1 then pass)" },
  {
    id: "oce_01kxdwxwdj8gxkgvbm5943",
    note: "launch — Occestra on itself, THE FEATURED RUN: the only complete kit (8 artifacts, 4 images, full brand genome, hero + mark + two social cards). The three earlier attempts at this same brief are in the build diary.",
  },
  { id: "oce_01kxbz33bb4grnd1xh0gev", note: "celebrate — the first sealed pack (the landing page replays this one)" },
  { id: "oce_01kxcccseqtdbehsf84x5s", note: "remember — grandma's kitchen on Sunday mornings (sunprint)" },
  { id: "oce_01kxcb0dbjajjc41qh0rpz", note: "celebrate — birthday dinner in Lagos (run live from the Studio UI; one honest fail)" },
  { id: "oce_01kxccb9kz3nnrav5akas1", note: "remember — the day the hackathon started (amethyst editorial)" },
  { id: "oce_01kxcc87615smbvxxhmd18", note: "celebrate — housewarming in Abuja (atlas ink)" },
  { id: "oce_01kxccfqmd93w0wmhpdt4h", note: "remember — the rain on the drive to Ibadan (atlas ink)" },
  { id: "oce_01kxcc8hqy67e56hyqa17m", note: "celebrate — parents' 30th anniversary lunch, Enugu (gilded noir; passRate 0.6, kept anyway)" },
  { id: "oce_01kxcce94r0y426vcnnspy", note: "remember — my first pitch demo (gilded noir)" },
  { id: "oce_01kxcc8yr5dkg7jx7cayb0", note: "celebrate — team dinner after the hackathon ships, Lisbon (amethyst editorial)" },
  { id: "oce_01kxcc9t8f2jr41crzbn76", note: "remember — our trip to Abuja (sunprint)" },
  { id: "oce_01kxcc99h1wda3j5449hkb", note: "celebrate — graduation brunch, Ibadan (atlas ink)" },
  { id: "oce_01kxcc9jcfdj2hpwx0e89r", note: "celebrate — grandmother's 80th birthday tea (sunprint)" },
];

/**
 * The same brief, on earlier nights. Kept and shown, because how it actually went is part
 * of the record — but not presented as the portfolio.
 */
export const BUILD_DIARY: GalleryEntry[] = [
  // The moodboards the reseed graded as a fail: the 2×2 collage form fights a single-focal style,
  // and the Tribunal said so. Kept, because a gallery that hides its own fails is exactly the
  // portfolio move this product argues against. (The moodboard generator was fixed afterward.)
  { id: "oce_01kxjbrp36xed1vq95190d", note: "celebrate — a midnight launch mood (neon_reverie; the moodboard grid fought the 'one luminous mark' style and failed composition — honestly)." },
  { id: "oce_01kxjbx239j17tsm2yzb25", note: "celebrate — a coral-and-marigold wedding mood (solstice_bloom; same grid-vs-focal fail, disclosed not hidden)." },
  { id: "oce_01kxc1fs5t73wf0ncs18he", note: "launch — the recursive demo, repaired x2 and STILL marked fail. Honest, and the reason the anti-slop filter exists." },
  { id: "oce_01kxc0y01b39652sjt4wjy", note: "launch — the second dogfood run of the same brief." },
  { id: "oce_01kxcch7m2vhrfw1rv22jd", note: "launch — the run where the image provider hit its billing cap mid-pack; the failures are disclosed, not hidden." },
];

/** Everything the gallery page fetches. */
export const GALLERY_IDS: string[] = GALLERY.map((entry) => entry.id);
export const BUILD_DIARY_IDS: string[] = BUILD_DIARY.map((entry) => entry.id);

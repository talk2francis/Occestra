/**
 * Derive the web brand assets from the full-res sources in assets/brand/.
 *
 * The sources are flat-ground JPEG-ish PNGs, so they are un-matted here: the
 * cream ground is solved back out to real alpha (P = a·C + (1-a)·B), which lets
 * the mark and wordmark sit on any surface without a seam. The site ground
 * (#faf7f2) is NOT the asset ground (#fbf7f4), so pasting them opaque would show.
 *
 * Usage: node scripts/brand-assets.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const SRC = join(process.cwd(), "assets", "brand");
const OUT = join(process.cwd(), "apps", "web", "public", "brand");

/**
 * Solve the flat ground back out of an asset, returning RGBA.
 * mode "light": dark foreground on a light ground (the daylight sources).
 * mode "dark":  light foreground on a dark ground (the nocturne sources) —
 * the same algebra with the drop measured upward instead of downward.
 */
async function unmatte(file, { trim = true, pad = 0, mode = "light" } = {}) {
  let img = sharp(join(SRC, file));
  const { width, height } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();

  // ground = the top-left corner (all sources have a clean margin)
  const B = [raw[0], raw[1], raw[2]];

  const out = Buffer.alloc(width * height * 4);
  let minX = width, minY = height, maxX = 0, maxY = 0;

  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const P = [raw[p], raw[p + 1], raw[p + 2]];

    // Take the strongest normalised deviation from the ground as coverage,
    // then un-premultiply to recover colour. Direction depends on the mode.
    let a = 0;
    for (let c = 0; c < 3; c++) {
      const dev = mode === "dark" ? (P[c] - B[c]) / (255 - B[c] || 1) : (B[c] - P[c]) / (B[c] || 1);
      a = Math.max(a, dev);
    }
    a = Math.min(1, Math.max(0, a));

    // The ground has a faint gradient; feather anything within a few levels of
    // it to zero so we don't bake in a haze of 1-2% alpha across the canvas.
    const drop =
      mode === "dark"
        ? Math.max(P[0] - B[0], P[1] - B[1], P[2] - B[2])
        : Math.max(B[0] - P[0], B[1] - P[1], B[2] - P[2]);
    a *= Math.min(1, Math.max(0, (drop - 3) / 6));

    if (a <= 0.004) {
      out[p] = out[p + 1] = out[p + 2] = out[p + 3] = 0;
      continue;
    }
    for (let c = 0; c < 3; c++) {
      const v = (P[c] - (1 - a) * B[c]) / a;
      out[p + c] = Math.min(255, Math.max(0, Math.round(v)));
    }
    out[p + 3] = Math.round(a * 255);

    const x = i % width, y = (i / width) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  let result = sharp(out, { raw: { width, height, channels: 4 } });
  if (trim) {
    const left = Math.max(0, minX - pad);
    const top = Math.max(0, minY - pad);
    result = result.extract({
      left,
      top,
      width: Math.min(width - left, maxX - minX + 1 + pad * 2),
      height: Math.min(height - top, maxY - minY + 1 + pad * 2),
    });
  }
  return result.png();
}

/** Square canvas with `art` centred at `fill` of the side, on `bg`. */
async function square(art, side, fill, bg) {
  const inner = Math.round(side * fill);
  const scaled = await sharp(art)
    .resize(inner, inner, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({
    create: { width: side, height: side, channels: 4, background: bg },
  })
    .composite([{ input: scaled, gravity: "centre" }])
    .png()
    .toBuffer();
}

/**
 * The favicon glyph: the mark's two plum arcs, alone.
 *
 * The full mark is four nested arc-pairs with hairline strokes — at 16px they
 * average out to a mauve smudge. The inner plum arcs are the only part with the
 * weight and contrast to survive a browser tab, so the icon is cut down to them.
 */
async function faviconGlyph(markPng) {
  const img = sharp(markPng).ensureAlpha();
  const { width, height } = await img.metadata();
  const raw = await img.raw().toBuffer();

  // the dark core sits in the middle ~62% of the mark (measured)
  const x0 = Math.round(width * 0.193), x1 = Math.round(width * 0.807);
  const y0 = Math.round(height * 0.184), y1 = Math.round(height * 0.813);
  const w = x1 - x0, h = y1 - y0;
  const out = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((y + y0) * width + (x + x0)) * 4;
      const d = (y * w + x) * 4;
      const lum = raw[s] * 0.3 + raw[s + 1] * 0.59 + raw[s + 2] * 0.11;
      out[d] = raw[s];
      out[d + 1] = raw[s + 1];
      out[d + 2] = raw[s + 2];
      // drop the pale lavender arcs the crop slices through — keep the plum
      out[d + 3] = lum > 150 ? 0 : raw[s + 3];
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).trim().png().toBuffer();
}

await mkdir(OUT, { recursive: true });

const CREAM = { r: 250, g: 247, b: 242, alpha: 1 }; // --color-ground #faf7f2

// 1. the mark, transparent — navbar, footer, docs header
const mark = await (await unmatte("mark-light.png")).toBuffer();
await sharp(mark).resize({ height: 256 }).png({ compressionLevel: 9 }).toFile(join(OUT, "mark.png"));

// 2. the horizontal lockup, transparent — README/nav use, 3x for retina
const horiz = await (await unmatte("horizontal-light.png")).toBuffer();
await sharp(horiz).resize({ height: 120 }).png({ compressionLevel: 9 }).toFile(join(OUT, "logo-horizontal.png"));

// 2b. the nocturne pair — un-matted from the dark sources (the light assets'
// real alpha goes muddy on dark surfaces; these are drawn FOR the dark ground)
const markDark = await (await unmatte("mark-dark.png", { mode: "dark" })).toBuffer();
await sharp(markDark).resize({ height: 256 }).png({ compressionLevel: 9 }).toFile(join(OUT, "mark-dark.png"));
const horizDark = await (await unmatte("horizontal-dark.png", { mode: "dark" })).toBuffer();
await sharp(horizDark).resize({ height: 120 }).png({ compressionLevel: 9 }).toFile(join(OUT, "logo-horizontal-dark.png"));

// 3. favicon + app icons, on the brand cream (opaque: iOS masks transparency to black)
const glyph = await faviconGlyph(mark);
await writeFile(join(OUT, "..", "..", "app", "icon.png"), await square(glyph, 512, 0.74, CREAM));
await writeFile(join(OUT, "..", "..", "app", "apple-icon.png"), await square(glyph, 180, 0.68, CREAM));

// 4. README hero banner — the concept-visual banner, width-capped and compressed
await sharp(join(SRC, "banner-light.png"))
  .resize({ width: 1600 })
  .png({ compressionLevel: 9, quality: 90 })
  .toFile(join(OUT, "banner.png"));

console.log("brand assets written to apps/web/public/brand + app/icon.png, app/apple-icon.png");

"""
Replace the banner tagline: "EVERY PART. ONE RESONANCE." -> "EVERY MOMENT, MADE MONUMENTAL."

The four hero banners shipped with a tagline that was never the product's. The
line the site, the README and the OKX listing all use is "Every moment, made
monumental." Rather than redraw the art, this lifts out just the tagline band and
sets the real line back into the same box: same centre, same cap height, same
width, same colour. Nothing else in the image is touched.

The old line is removed by interpolating the rows above and below the band, which
preserves the smooth grounds and gradient wisps that sit behind it.

RUN ONCE, against the pristine sources (git 6bc5047). Re-running on already-fixed
banners would inpaint the new line and re-set it, softening the text each pass.

    python3 scripts/brand-retagline.py [--check]
"""
import sys
from PIL import Image, ImageDraw, ImageFont

SRC = "assets/brand"
FONT = "apps/web/assets/og/instrument-500.ttf"
NEW = "EVERY MOMENT, MADE MONUMENTAL."

# (file, search window for the old tagline, light text?)
BANNERS = [
    ("banner-light.png", (800, 468, 1450, 520), False),
    ("banner-plain-light.png", (650, 505, 1750, 562), False),
    ("banner-dark.png", (800, 468, 1450, 520), True),
    ("banner-plain-dark.png", (680, 495, 1700, 556), True),
]


def find_tagline(img, window, light_text):
    """Tight bbox of the tagline glyphs inside `window`."""
    x0, y0, x1, y1 = window
    px = img.load()
    bg = img.getpixel((2, 2))
    xs, ys = [], []
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y][:3]
            d = (r - bg[0]) + (g - bg[1]) + (b - bg[2]) if light_text else (bg[0] - r) + (bg[1] - g) + (bg[2] - b)
            if d > 90:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise SystemExit("no tagline found in window")
    return min(xs), min(ys), max(xs), max(ys)


def text_colour(img, box, light_text):
    """
    The glyph colour — the mean of the solid stroke interiors.

    Taking the single most-distant pixel picks an anti-aliasing extreme (a near
    black for a plum line), so instead: keep the pixels in the top quartile of
    distance from the ground, and average those.
    """
    x0, y0, x1, y1 = box
    px = img.load()
    bg = img.getpixel((2, 2))
    samples = []
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            r, g, b = px[x, y][:3]
            d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if d > 90:
                samples.append((d, (r, g, b)))
    samples.sort(key=lambda s: -s[0])
    core = [c for _, c in samples[: max(1, len(samples) // 4)]]
    return tuple(round(sum(c[i] for c in core) / len(core)) for i in range(3))


def inpaint(img, box, pad=4):
    """Erase the band by blending the clean rows above and below it."""
    x0, y0, x1, y1 = box
    y0, y1 = y0 - pad, y1 + pad
    px = img.load()
    span = y1 - y0 + 2
    for x in range(x0 - pad, x1 + pad + 1):
        top = px[x, y0 - 1][:3]
        bot = px[x, y1 + 1][:3]
        for i, y in enumerate(range(y0, y1 + 1), start=1):
            t = i / span
            px[x, y] = tuple(round(top[c] + (bot[c] - top[c]) * t) for c in range(3))


def draw_tagline(img, box, colour):
    """Set NEW into `box`: same centre, same cap height, same width."""
    x0, y0, x1, y1 = box
    target_w, cap_h = x1 - x0, y1 - y0

    size = cap_h
    for _ in range(40):  # match cap height (measured on a capital, not the em box)
        f = ImageFont.truetype(FONT, size)
        h = f.getbbox("E")[3] - f.getbbox("E")[1]
        if h >= cap_h:
            break
        size += 1
    font = ImageFont.truetype(FONT, size)

    widths = [font.getlength(c) for c in NEW]
    natural = sum(widths)
    track = (target_w - natural) / max(1, len(NEW) - 1)

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    top = y0 - font.getbbox("E")[1]
    x = float(x0)
    for i, ch in enumerate(NEW):
        d.text((x, top), ch, font=font, fill=(*colour, 255))
        x += widths[i] + track
    img.paste(layer, (0, 0), layer)


check = "--check" in sys.argv
for name, window, light in BANNERS:
    path = f"{SRC}/{name}"
    img = Image.open(path).convert("RGB")
    box = find_tagline(img, window, light)
    col = text_colour(img, box, light)
    print(f"{name:24} tagline @ {box}  colour={col}")
    if check:
        continue
    inpaint(img, box)
    draw_tagline(img, box, col)
    img.save(path)
    print(f"{'':24} -> rewritten")

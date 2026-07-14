"""
Build apps/web/public/og.jpg — the unfurl card for occestra.xyz and /docs/*.

The old card was a bare artifact image: beautiful, and it never said "Occestra".
An unfurl has one job, to name the thing and say what it is. This pairs the real
artifact (left→right: the brand, the promise, the proof) with the logo, so the
card is on-brand AND still shows genuine graded output rather than a mockup.

    python3 scripts/og-home.py
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
GROUND = (250, 247, 242)
INK = (23, 20, 26)
AMETHYST = (107, 63, 160)
SILVER = (142, 138, 148)

FRAUNCES = "apps/web/assets/og/fraunces-600.ttf"
INSTRUMENT = "apps/web/assets/og/instrument-500.ttf"
ART = "apps/web/public/artifacts/og-source.png"  # the florist collage, a real pack artifact
LOGO = "apps/web/public/brand/logo-horizontal.png"
OUT = "apps/web/public/og.jpg"

PANEL = 700  # the copy column; the artwork takes the rest

card = Image.new("RGB", (W, H), GROUND)

# --- the artwork, bled off the right edge -----------------------------------
art = Image.open(ART).convert("RGB")
aw = W - PANEL
scale = max(aw / art.width, H / art.height)
art = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
left = (art.width - aw) // 2
top = (art.height - H) // 2
card.paste(art.crop((left, top, left + aw, top + H)), (PANEL, 0))

# soften the seam so the collage reads as inset, not pasted
seam = Image.new("RGB", (2, H), (225, 219, 210))
card.paste(seam, (PANEL, 0))

d = ImageDraw.Draw(card)

# --- the logo ---------------------------------------------------------------
logo = Image.open(LOGO).convert("RGBA")
lh = 46
logo = logo.resize((round(logo.width * lh / logo.height), lh), Image.LANCZOS)
card.paste(logo, (72, 72), logo)

# --- the promise ------------------------------------------------------------
serif = ImageFont.truetype(FRAUNCES, 58)
sans = ImageFont.truetype(INSTRUMENT, 25)
small = ImageFont.truetype(INSTRUMENT, 21)

d.text((72, 196), "Every moment,", font=serif, fill=INK)
d.text((72, 262), "made monumental.", font=serif, fill=INK)

body = [
    "The Occasion Studio. Any real moment in,",
    "finished work out — every artifact graded",
    "against a published standard, repaired when",
    "it fails, and sealed on X Layer.",
]
y = 366
for line in body:
    d.text((72, y), line, font=sans, fill=SILVER)
    y += 34

# --- the proof --------------------------------------------------------------
pill = "OKX.AI  ·  Agent #5213"
tw = d.textlength(pill, font=small)
d.rounded_rectangle((72, 524, 72 + tw + 52, 524 + 46), radius=23, outline=AMETHYST, width=2)
d.text((72 + 26, 524 + 12), pill, font=small, fill=AMETHYST)

card.save(OUT, "JPEG", quality=92, optimize=True)
print(f"wrote {OUT} ({W}x{H})")

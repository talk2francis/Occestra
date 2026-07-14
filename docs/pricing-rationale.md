# What each tool costs us, and what we charge

Measured 2026-07-14 (V2-0). Reproduce with `node scripts/cost-model.mjs`.

## How these numbers are obtained

The **shape** of a run is deterministic: how many images it makes, at what size, at what
quality tier, and how many model beats it takes. So every tool is run against the fake
providers — free, instant, and structurally identical to the real thing — and the counts
are priced with the provider's real published rates.

The one number that needs a live run is per-beat text spend. A text-only artifact (a
toast: writer + Tribunal critic, on `claude-sonnet-4-6`) measured **$0.0033** end to end
on 2026-07-14, and each model beat is priced at that.

Image rates are gpt-image-1's published prices, and they are not flat:

| tier | 1024×1024 | 1024×1536 / 1536×1024 |
|---|---|---|
| low | $0.011 | $0.016 |
| medium | $0.042 | $0.063 |
| **high** | **$0.167** | **$0.250** |

## Unit cost per tool

`was` is the same run before V2-0's quality tiers — i.e. what we were actually paying,
because no `quality` was ever sent and the provider's default is its top tier.

| tool | images | model beats | image $ | text $ | **cost** | price (v1) | **margin (v1)** | was |
|---|---|---|---|---|---|---|---|---|
| `oce_plan_occasion` | 0 | 2 | 0.0000 | 0.0066 | **0.0066** | 0.05 | **+0.043** | 0.0066 |
| `oce_design_invite` | 1 | 0 | 0.2500 | 0.0000 | **0.2500** | 0.10 | **−0.150** 🔴 | 0.2500 |
| `oce_make_keepsake` | 1 | 3 | 0.1670 | 0.0099 | **0.1769** | 0.10 | **−0.077** 🔴 | 0.1769 |
| `oce_write_toast` | 0 | 1 | 0.0000 | 0.0033 | **0.0033** | 0.02 | **+0.017** | 0.0033 |
| `oce_moodboard` | 1 | 0 | 0.0420 | 0.0000 | **0.0420** | 0.05 | **+0.008** | 0.1670 |
| `oce_launch_kit` | 4 | 8 | 0.4180 | 0.0264 | **0.4444** | 0.25 | **−0.194** 🔴 | 0.9434 |

One of each: **$0.9232**, against **$1.5472** before the tiers — **40% cheaper**, and the
launch kit alone fell 53% ($0.94 → $0.44).

## The finding that matters

**Three of the six paid tools sell below cost.** Every `oce_launch_kit` sale loses ~19
cents; every `oce_design_invite` loses ~15 cents. The more successful the ASP is, the more
money it burns. This was invisible because the cost governor priced every image at a flat
invented $0.04 — so the system believed a launch kit's imagery cost $0.16 when it truly
cost $0.42.

The tiers in V2-0 close part of the gap but cannot close it alone: an invitation is a
keepsake, it is *meant* to be a top-tier render, and the render alone costs $0.25 against
a $0.10 price. **The prices are wrong, not the quality.** V2-1 reprices against this table.

## Why each tier is what it is

Top tier is bought only for work a person keeps and looks at closely:

- **`og_image` (the launch hero)** — the one image that gets shared.
- **`keepsake_art`** — the thing someone frames.
- **`invitation`** — the thing someone is sent.

Everything else is mid tier: moodboard tiles are seen as thumbnails, social cards are seen
in a feed, a brand mark must read at 32px. And **every repair is mid tier, whatever the
artifact** — a repair is a draft the Tribunal may reject again, and paying hero rates for
an attempt is how a twice-repaired hero ends up costing three times its own price.

## What is bought once and reused

The launch kit's share card is **derived** from the hero with sharp (a 1200×630 crop), not
generated. A second generation would cost another $0.25 *and* drift from the hero it is
supposed to represent. Cost of the card: **$0.00**.

Site inspections are cached for an hour (`TTL.site`), so two launch kits for the same URL
inside that window pay for one browser run.

# What each tool costs us, and what we charge

Measured 2026-07-14 (V2-1.2). Reproduce the table with `node scripts/cost-model.mjs`, and the
two rates it prices with by running `node scripts/cost-live.mjs` (which spends a few real cents).

## The correction

**An earlier version of this page said three of six tools sold below cost. It was wrong, and it
was wrong in a way worth writing down.**

It counted "beats" — generator calls — and priced them at one blended rate. It never counted the
**critic**, because the critic does not go through the text port: it reaches the model adapter
directly. So nothing that watched the text port could see it.

That is the *identical* blind spot the cost governor had, found the same week for the same reason.
Two independent pieces of accounting, both watching the same pipe, both missing the same call.

A plan produces five artifacts. Five artifacts means **five critique calls**, plus one more for
every repair pass. The model believed a plan cost **$0.0066**. It actually costs **$0.1253** —
wrong by **nineteen times**, in the direction that loses money.

With the critic counted: **all six paid tools sold below cost.**

## The two rates

Measured live, on `claude-sonnet-4-6`:

| role | $/call | why |
|---|---|---|
| **writer** | **$0.0118** | a system prompt, a brief, a few hundred tokens back |
| **critic** | **$0.0168** | the **whole artifact** goes in, plus the anchored rubric, and ~1100 tokens come back |

The critic is the **dearer** of the two, and it runs **once per artifact** — not once per run.
That is the entire shape of the error.

Image rates are gpt-image-1's published prices, and they are not flat:

| tier | 1024×1024 | 1024×1536 / 1536×1024 |
|---|---|---|
| low | $0.011 | $0.016 |
| medium | $0.042 | $0.063 |
| **high** | **$0.167** | **$0.250** |

## Unit cost, and the price

The **shape** of a run is deterministic — how many images, at what size and tier, how many writer
calls, how many artifacts to grade. So every tool is run against the fake providers (free,
instant, structurally identical) and the counts are priced with the rates above.

| tool | img | writer | critic | image $ | writer $ | critic $ | **cost** | **price** | margin |
|---|---|---|---|---|---|---|---|---|---|
| `oce_write_toast` | 0 | 1 | 1 | 0.0000 | 0.0118 | 0.0168 | **0.0286** | **0.10** | 71% |
| `oce_moodboard` | 1 | 0 | 2 | 0.0420 | 0.0000 | 0.0336 | **0.0756** | **0.30** | 75% |
| `oce_plan_occasion` | 0 | 2 | 5 | 0.0000 | 0.0236 | 0.0840 | **0.1076** | **0.30** | 58% |
| `oce_make_keepsake` | 1 | 3 | 2 | 0.1670 | 0.0354 | 0.0336 | **0.2360** | **0.75** | 69% |
| `oce_design_invite` | 1 | 0 | 2 | 0.2500 | 0.0000 | 0.0336 | **0.2836** | **0.75** | 62% |
| `oce_launch_kit` | 4 | 8 | 5 | 0.4180 | 0.0944 | 0.0840 | **0.5964** | **1.50** | 60% |

The model is validated against the live rail: it puts `oce_plan_occasion` at $0.1076 and a real
run measured **$0.1253** — 13% under, because writer calls vary in size. Close enough to price
against, and the direction of the error is recorded rather than smoothed away.

## `oce_critique` sells below cost, on purpose

One critique costs about **$0.0168**. It sells for **$0.01**.

That is a decision, not an oversight, and it stays. A marketplace where output is checkable is a
better marketplace for everyone in it, including us — and a grading tool priced to protect its own
margin would never get used by anybody. It is the one number on this page we are deliberately
losing on, and it is the one that earns the standard its readers.

`oce_verify_keepsake` is free forever, for the same reason in a stronger form: **trust that costs
money is not trust.**

## Why each image tier is what it is

Top tier is bought only for work a person keeps and looks at closely:

- **`og_image` (the launch hero)** — the one image that gets shared.
- **`keepsake_art`** — the thing someone frames.
- **`invitation`** — the thing someone is sent.

Everything else — moodboard tiles seen at thumbnail size, repair drafts that exist only to be
graded again — runs at medium. Before V2-0 we sent no tier at all, so the provider applied its
default (its most expensive) to every one of them.

## The rule this leaves behind

**Any time you measure spend, ask what talks to a model without going through the port you are
watching.** Twice now, the answer has been "the critic".

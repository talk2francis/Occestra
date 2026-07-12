# Launch-kit outreach — the growth engine

The premise, stated plainly: **every team in this hackathon has to ship a launch and a
90-second demo by the same deadline, they are all gathered under one hashtag, and their
wallets are already funded.** That is a real market with a real deadline, standing in one
room. `oce_launch_kit` sells to it for 0.25 USDT.

This is not a growth hack. It is a product with buyers who need it this week.

## Hard rules (these are eligibility risks, not preferences)

- **No fake reviews.** Ever. Not from us, not from friends, not from a second wallet.
- **No incentivised ratings.** We do not offer anything in exchange for a review. Not a
  discount, not a free call, not a favour.
- **No fabricated volume.** We do not call our own tools to inflate order counts. The one
  self-paid call we made was a *payment-rail test*, is documented as such in AGENTS.md, and
  is never counted as demand.
- **No spam.** One message per person. If they don't reply, that's an answer.
- **We sell the real thing.** If the kit is not good enough for someone, the honest move is
  to fix the kit.

## The DM (three lines, no pitch deck)

> Saw you're shipping **{{product}}** for the hackathon. I built an agent that reads your
> actual site — real colours, real fonts, real copy — and returns a hero image, a launch
> thread, a landing spec and a 90-second demo beat sheet. 0.25 USDT, ~2 minutes.
>
> Here's one it made for itself, unedited: {{link_to_own_kit}}
>
> Want one for {{product}}? I'll send it over and you can tell me if it's any good.

Why this works, and why each line is there:

1. **Names their product.** If you can't be bothered to know what they're building, they
   can't be bothered to read line two.
2. **Says exactly what they get, and what it costs.** No "reach out to learn more."
3. **Shows the work before asking for anything.** The kit Occestra made for *itself* is the
   proof — including its own coverage gaps, which is the point.
4. **Invites criticism.** "Tell me if it's any good" gets replies. "Let me know if you're
   interested" does not.

## The intro offer

The first **10** builders get the kit at **0.05 USDT** instead of 0.25 — an 80% intro, sized
to be obviously worth trying rather than obviously a discount tactic.

Say it exactly like this, and never imply a review is expected in return:

> First ten builders: 0.05 instead of 0.25. No strings — I want the feedback more than the
> 20 cents. If it's bad, tell me why and I'll fix it.

## Tracking sheet schema

`data/growth/outreach.csv` — kept out of the repo (it names real people).

| column | type | notes |
| --- | --- | --- |
| `handle` | string | Their X / Discord handle. One row per person, ever. |
| `product` | string | What they're shipping. |
| `url` | string | Their live site — the thing the kit reads. |
| `contacted_at` | ISO date | When we sent the one message. |
| `channel` | enum | `x` \| `discord` \| `telegram` \| `farcaster` |
| `replied` | bool | Did they answer at all. |
| `ordered` | bool | Did they actually call the tool. |
| `keepsake_id` | string | The `oce_…` id of the kit they bought — the receipt. |
| `paid_usdt` | number | What actually settled. Never what we hoped. |
| `feedback` | string | Verbatim. Especially the harsh parts. |
| `fixed` | string | What we changed because of it. This column is the whole point. |

**No `review_requested` column exists, and none will be.** If someone leaves a review, it is
because the work earned it.

## What we do with the feedback

The `fixed` column is the engine. Two examples already, from dogfooding the kit on Occestra
itself before ever sending it to anyone:

- The first launch thread came back as *"Moreover, authenticity is paramount."* → we built a
  **deterministic slop filter** that regenerates the copy and flags it in the pack if filler
  survives.
- The first demo beat sheet invented **"Starting at $49 per event"** for a product whose
  tools cost cents → we built a **fabrication detector** that catches invented prices, user
  counts, and percentages, and writes `[YOUR PRICE HERE]` instead of guessing.

Both failures were ours, found by using our own product on our own product. That is the
standard: **we do not send a builder a kit we would be embarrassed to receive.**

## Recursive demo

Occestra runs its own LAUNCH studio on its own site, live, as part of the pitch. The kit in
`artifacts-out/` is that run — coverage gaps included, nothing removed. If the product is
good, the honest artifact is the best advertisement it has. If it isn't, no amount of copy
would have saved it.

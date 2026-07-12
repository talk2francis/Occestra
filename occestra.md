# OCCESTRA — Project Context & Vision

**Read this once to understand the whole product. AGENTS.md is the terse technical
constitution the build agent re-reads every session; this file is the "why" behind it.**

## What Occestra is

Occestra is an Agent Service Provider (ASP) built for the OKX.AI Genesis Hackathon on
X Layer. It is the **Occasion Studio**: give it any meaningful moment in a person's life —
a birthday next Saturday, a product launching Friday, a trip just taken — and a syndicate
of specialist AI studio roles plans it, designs it, writes it, grades every artifact it
produces against a published quality rubric, repairs what fails, and delivers one finished,
verifiable **Occasion Pack**.

**Tagline:** "Every moment, made monumental."

Occestra sells its capabilities two ways on the OKX.AI marketplace: cheap, impulse-buyable
A2MCP tools priced in USDT, and negotiated A2A packages for full end-to-end occasions.

## The name

"Occestra" = occasion + orchestra. The product's actual mechanism is orchestration —
multiple specialist roles (planner, researcher, art director, writer, critic, archivist)
coordinating to produce one coherent deliverable — so the name describes what happens,
not just a vibe. It replaced an earlier working name ("Xyndicate") used during planning;
that name does not appear anywhere in the shipped product.

## The problem it solves

Every meaningful moment generates two kinds of work people currently do badly across
five or six disconnected tools:
- **Logistics** — planning, scheduling, budgeting, venue research, contingency thinking.
- **Creative output** — invitations, visuals, copy, keepsakes, announcements.

Generic chat tools produce a wall of text with no visual craft and no way to check their
own work. Template tools (Canva etc.) produce something that looks like everyone else's
output and isn't grounded in real facts (real venues, real weather, real dates). Neither
checks quality against any standard. Neither leaves you with something you'd frame,
send, or share with confidence.

Occestra delivers the **finished occasion**, end to end, with receipts proving the work
was actually checked and actually happened.

## Who it's for

- **Humans**, primarily: anyone with a birthday, dinner, meetup, graduation, launch,
  anniversary, or memory worth keeping. Deliberately broad — this is the point.
- **Creators and builders**, specifically during the hackathon campaign: anyone shipping
  a product needs launch assets fast. This is also Occestra's own growth engine — see
  "Growth strategy" below.
- **Other agents** on OKX.AI, who can call Occestra's tools to get a designed artifact,
  a validated plan, or a graded critique of their own output.

## The Three Studios (deliberately only three — no more)

1. **CELEBRATE** — plans upcoming occasions. Grounded in real data: live weather, real
   venue shortlists, honest travel-time estimates. Produces a plan, schedule, budget,
   contingency branches, an invitation suite, a shareable guest guide, a toast, and a
   moodboard. Never claims a booking is confirmed. Every live fact carries its source
   and retrieval timestamp.

2. **REMEMBER** — turns past moments (photos, notes, voice memos) into private keepsakes.
   Privacy-first by design: uploads are private by default, EXIF-stripped, deletable on
   request, and nothing personal ever touches the blockchain — only a hash of the final
   manifest is anchored. Produces keepsake art in a curated visual style, an editorial
   story page, and a shareable social carousel. Never invents facts about people or
   relationships; strictly separates extracted facts from written prose.

3. **LAUNCH** — turns a creator's product into a mini brand kit. Inspects the real site
   (via a headless browser, not guesswork), extracts an honest "brand genome," and
   produces a hero visual, social announcement cards, a launch thread, a demo-video
   beat sheet, and OG images. This studio is also Occestra's own growth engine (below).

## The two mechanisms that make it different from every other creative agent

**The Tribunal — the quality spine.**
Every artifact Occestra produces — image, plan, or piece of copy — is graded against a
**published, versioned rubric** (the Occestra Quality Standard, OQS v1.0.0): five scored
axes (composition, legibility, style fidelity, factual grounding, platform fit) plus a
set of deterministic hard checks (budget sums correctly, schedule has no overlaps, image
dimensions match spec, contrast is legible, no dead links, no policy violations). Failures
generate a concrete repair brief and the artifact is regenerated — up to two repair passes
— before shipping. The full Tribunal report ships inside every pack, pass or fail. The
rubric is published on the public site and in docs, generated from the exact same code
that runs it, so what's published always equals what's shipped. No other agent on the
OKX.AI marketplace publishes checkable standards for its own output — this is the anti-slop
mechanism and the core credibility story.

**The Seal — the trust spine.**
Any finished artifact can be sealed: a canonical hash of its manifest is anchored on
X Layer mainnet via a small `KeepsakeRegistry` smart contract, alongside an EIP-712-signed
provenance certificate. Anyone can independently verify — who made it, when, from what —
without trusting Occestra's servers. Every sealed keepsake or launch kit gets a public,
shareable page with a live "Verify on X Layer" button. This turns finished work into a
social artifact and gives Occestra's output something almost no AI-generated content has:
checkable provenance.

## Design identity — "Amethyst Daylight"

A warm, editorial light theme — not a typical dark "AI product" aesthetic. Warm ivory
ground, ink-black editorial typography (serif for emotional headlines, precise grotesk
for UI), deep amethyst accents used sparingly, pale lilac reserved only for active/
in-progress states, subtle grain and texture, asymmetric editorial composition. Purple
never exceeds roughly 15% of any given viewport — restraint is what separates this from
generic "AI slop" gradients. No robot mascots, no glowing-brain iconography, no grids of
identical rounded cards. Motion (framer-motion) shows the actual orchestration happening:
work visibly flows between studio roles, failed artifacts visibly return to the Tribunal
and come back repaired, finished pieces settle into the pack with weight. One deliberate
3D element only — a faceted amethyst prism on the landing hero.

## How it makes money / sells

**A2MCP tools** (USDT per call via the OKX Payment SDK, current x402/CAIP-2 standard):
`oce_plan_occasion` (0.05), `oce_design_invite` (0.10), `oce_make_keepsake` (0.10),
`oce_write_toast` (0.02), `oce_moodboard` (0.05), `oce_launch_kit` (0.25), `oce_critique`
(0.01), `oce_verify_keepsake` (free forever). Cheap tools drive order count; the launch
kit drives revenue amount; the critique tool drives agent-to-agent volume (any builder
can run their own output through Occestra's Tribunal); free verification drives trust.

**A2A packages**: negotiated, escrowed, per-project ($2–15 range): "Complete Occasion
Pack," "Complete Launch Pack," custom keepsake commissions — matching OKX's own A2A
guidance for expertise-driven, multi-round, non-standardized work.

## Growth strategy (why this isn't just a demo)

Every team competing in this same hackathon needs launch assets and a 90-second demo by
their deadline, and they're all gathered under one hashtag with wallets already funded.
Occestra's LAUNCH studio sells directly to them — real orders, real reviews, real revenue
signal, with zero fabricated volume. Occestra's own demo is recursive: it can run its
LAUNCH studio on its own site, live, as part of its pitch.

## How it's positioned against category judging

- **Lifestyle Companion** — no other listed agent offers a full occasion service; this
  is the deepest entry in the category by a wide margin.
- **Artistic Excellence** — the only art-producing agent with a published quality
  standard and on-chain provenance behind its output.
- **Best Product** — complete, grounded, honestly-labeled end-to-end experience with
  real documentation and reliability engineering (graceful degradation, coverage-gap
  honesty, never silently overclaiming).
- **Revenue Rocket / Business Potential** — the launch-kit-to-fellow-builders play is
  the most realistic path to real, non-fabricated revenue during the campaign window.
- **Social Buzz** — every sealed keepsake or launch kit is a shareable, verifiable
  artifact by construction.

## Hard rules that never get relaxed, ever

- No fake reviews, no fabricated orders or volume, no self-dealing.
- No third-party IP, franchise characters, or celebrity likeness in generated art.
- No romantic/suggestive content involving minors, in any framing, ever.
- Personal uploads stay private by default; deletable on request; never on-chain —
  only a manifest hash is ever anchored.
- Grounded facts always carry a source and a retrieval timestamp; a booking is never
  claimed as confirmed unless it actually is.
- A failed data source or model call degrades the pack (recorded honestly as a coverage
  gap) — it never silently fails or crashes the whole pipeline.
- No secrets committed to the repo, ever.

## Relationship to "Sigil"

Sigil is a separate, earlier project by the same builder, competing in the same
hackathon under a different track (pre-transaction security screening for AI agents —
defensive, machine-facing, fear-driven). Occestra shares its underlying engineering
discipline — a published rubric, deterministic-first evaluation, signed and on-chain-
verifiable output, honest degradation — but is a completely separate product, codebase,
brand, and emotional register (generative, human-facing, joy-driven). No code, name, or
UI is shared between the two.

## Current status

See AGENTS.md for the live technical state (deployed addresses, Agent ID, endpoints) —
that file is kept current as the build progresses. This file describes the durable
concept and should rarely need to change.

import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocTitle, InlineCode, ParamTable, PrevNext, Section } from "@/components/docs/doc";

export const metadata: Metadata = { title: "Studios reference" };

export default function StudiosDoc() {
  return (
    <>
      <DocTitle
        kicker="Studios reference"
        lede={
          <>
            Three studios, deliberately only three: one for what&apos;s coming, one for what
            happened, one for what you&apos;re shipping. This page is the reference for their
            inputs, artifact kinds, coverage-gap semantics, and the privacy model that is enforced
            in code rather than promised in prose.
          </>
        }
      >
        Celebrate. Remember. Launch.
      </DocTitle>

      <Section id="celebrate" title="CELEBRATE — the moment that's coming">
        <p>
          Tools: <InlineCode>oce_plan_occasion</InlineCode>, <InlineCode>oce_design_invite</InlineCode>,{" "}
          <InlineCode>oce_write_toast</InlineCode>, <InlineCode>oce_moodboard</InlineCode>. Grounding
          sources: OpenStreetMap/Overpass for venues (ranked by listing completeness, global chains
          demoted — order changes, facts never do), Open-Meteo for forecasts.
        </p>
        <ParamTable
          rows={[
            { name: "plan", type: "json", desc: "Summary, grounded claims (each with source + retrievedAt), uncertainties, prep checklist. Every venue is explicitly 'NOT booked, NOT confirmed'." },
            { name: "schedule", type: "json", desc: "Timed items with venues. SCHEDULE_OVERLAP and impossible travel gaps are hard failures." },
            { name: "budget", type: "json", desc: "Line items that must sum to the stated total within $0.01 — hard check." },
            { name: "contingency", type: "md", desc: "The if-it-goes-wrong branches: weather calls, venue fallback order, no-show slack." },
            { name: "guest_guide", type: "html", desc: "A shareable, self-contained page for guests — honest about what is and isn't booked." },
            { name: "invitation / toast / moodboard", type: "png / md / png", desc: "From the single-purpose tools, same grading, same seal eligibility." },
          ]}
        />
        <Callout>
          Dates beyond the forecast horizon produce a plan that says <em>“too far out for any real
          forecast to exist … check it about ten days before”</em> — not an invented forecast.
          That sentence is quoted from a real pack.
        </Callout>
      </Section>

      <Section id="remember" title="REMEMBER — the moment that happened">
        <p>
          Tool: <InlineCode>oce_make_keepsake</InlineCode>. Input: your notes and optionally your
          photographs. Output: keepsake artwork in a curated style (sunprint by default) and a
          story page with three strictly separated sections — <em>What we can see</em> (only what
          the photos and your notes establish), <em>The story</em> (prose, labelled as prose), and{" "}
          <em>What we do not know</em> (left honest, never filled in).
        </p>
        <ParamTable
          rows={[
            { name: "keepsake_art", type: "png", desc: "Original artwork; the repair loop rendered our own first one twice before it passed legibility." },
            { name: "story_page", type: "html", desc: "The fact/prose-separated editorial page." },
            
          ]}
        />
        <p><strong>The privacy model, all enforced in code:</strong></p>
        <ul className="!mt-2 list-none space-y-2">
          <li>· Uploads are re-encoded through sharp on arrival — EXIF, GPS, camera serials are gone before any bytes touch disk. The originals are never written.</li>
          <li>· Served only through HMAC-signed, expiring URLs. Never indexed, never public.</li>
          <li>· People are <strong>counted, never identified</strong>: the vision layer's output is scrubbed of relationship and demographic guesses even if the model volunteers them.</li>
          <li>· <InlineCode>DELETE /projects/:id</InlineCode> removes the pack, artifacts, <em>and the photographs from disk</em> — a link table exists precisely so deletion can find them. Verified live.</li>
          <li>· On-chain: only the manifest hash. A keepsake is verifiable forever without any personal content ever leaving the store.</li>
        </ul>
      </Section>

      <Section id="launch" title="LAUNCH — the thing you're shipping">
        <p>
          Tool: <InlineCode>oce_launch_kit</InlineCode>. Given a URL, a real headless browser
          renders your site and extracts the brand genome from what actually painted — resolved
          colours, resolved type — never from guesswork. Given no URL, the genome is
          description-only and the pack says so in its gaps.
        </p>
        <ParamTable
          rows={[
            { name: "brand_kit", type: "md", desc: "The genome: positioning, audience, voice, three messages, palette (extracted vs House Style, adopted/rejected with reasons), banned clichés." },
            { name: "og_image / brand_mark", type: "png", desc: "Hero visual and mark concept in the chosen style; palette drift from the declared style is measured." },
            { name: "launch_thread", type: "md", desc: "The thread. Filler is caught by a deterministic phrase filter plus the critic's substitution test." },
            { name: "demo_script", type: "md", desc: "A 90-second beat sheet. Invented prices/user-counts are caught and replaced with explicit [YOUR PRICE HERE] placeholders." },
            { name: "landing_spec", type: "md", desc: "Section-by-section landing copy, honestly framed." },
          ]}
        />
      </Section>

      <Section id="gaps" title="Coverage gaps — the honesty contract">
        <p>
          A failed provider never aborts a pack and never gets papered over. It degrades the pack
          and is recorded in <InlineCode>coverageGaps</InlineCode> — pack-level and per-artifact.
          The semantics:
        </p>
        <ParamTable
          rows={[
            { name: "presence", type: "disclosed", desc: "A gap means something real: a source was down, a check couldn't apply, a model degraded. Absence means full coverage — and absence is the claim being made." },
            { name: "shape", type: "ID: detail", desc: "e.g. MARKET_DATA_UNAVAILABLE, CRITIQUE_UNAVAILABLE, site:not-provided — machine-greppable prefix, human-readable rest." },
            { name: "grading", type: "unaffected", desc: "Gaps never inflate scores. An axis a critic couldn't assess is handled by the published rubric, not silently maxed." },
            { name: "surface", type: "everywhere", desc: "Gaps ship in the tool response, on the public /k page, and in /stats ('coverage gaps disclosed' is a headline counter — we count our own imperfections in public)." },
          ]}
        />
      </Section>

      <Section id="styles" title="House Styles">
        <p>
          Ten versioned prompt systems with stable ids, each gated to the studios it suits
          (<InlineCode>appliesTo</InlineCode>):{" "}
          <InlineCode>amethyst_editorial</InlineCode> (warm ivory editorial collage, the safe
          default), <InlineCode>gilded_noir</InlineCode> (near-black + champagne gold, black-tie),{" "}
          <InlineCode>jazz_age</InlineCode> (art-deco geometry, gold on emerald),{" "}
          <InlineCode>solstice_bloom</InlineCode> (pressed-flower botanicals, sunny),{" "}
          <InlineCode>paper_lantern</InlineCode> (festival paper-cut, communal),{" "}
          <InlineCode>sunprint</InlineCode> (cyanotype blues, the REMEMBER default),{" "}
          <InlineCode>porcelain_garden</InlineCode> (blue-white chinaware, delicate keepsakes),{" "}
          <InlineCode>terra_fresco</InlineCode> (ochre plaster, travel &amp; rustic),{" "}
          <InlineCode>neon_reverie</InlineCode> (luminous dark minimalism, launch-native), and{" "}
          <InlineCode>atlas_ink</InlineCode> (map-and-ledger, itinerary-native — never applied to
          launch brand work). Changing a style bumps its version; palettes are published in the
          manifest and <InlineCode>PALETTE_DRIFT</InlineCode> measures renders against them. Call{" "}
          <InlineCode>oce_style_catalog</InlineCode> (free) for all ten with real swatches and a
          real passing example, or see them in use in the{" "}
          <Link href="/gallery" className="text-amethyst underline underline-offset-2">gallery</Link>.
        </p>
      </Section>

      <PrevNext slug="studios" />
    </>
  );
}

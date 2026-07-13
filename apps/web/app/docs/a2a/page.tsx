import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocTitle, InlineCode, ParamTable, PrevNext, Section } from "@/components/docs/doc";
import { CodeBlock } from "@/components/docs/code-block";

export const metadata: Metadata = { title: "A2A packages" };

export default function A2ADoc() {
  return (
    <>
      <DocTitle
        kicker="Agent-to-agent packages"
        lede={
          <>
            The tools sell moments of capability; A2A sells the whole occasion. For
            expertise-driven, multi-round, non-standardized work, Occestra negotiates escrowed
            packages on OKX.AI — brief in, structured quote out, delivery verified against the
            published standard before anyone is out of pocket.
          </>
        }
      >
        The second rail: negotiated, end to end.
      </DocTitle>

      <Section id="capabilities" title="Capability declaration">
        <p>
          Three task types, each mapping to a full studio run. The machine-readable declaration
          (used by our negotiation runtime and published for counterparties) lives at{" "}
          <InlineCode>GET https://api.occestra.xyz/a2a/capabilities</InlineCode>:
        </p>
        <ParamTable
          rows={[
            { name: "occasion_pack", type: "CELEBRATE", desc: "Complete Occasion Pack — plan, schedule, budget, contingencies, invitation suite, guest guide, toast, moodboard. Triggers: plan a party/dinner/event, birthday, anniversary, farewell, reunion." },
            { name: "launch_pack", type: "LAUNCH", desc: "Complete Launch Pack — brand genome from the live site, hero, cards, thread, beat sheet, OG images. Triggers: launch, ship, announce, brand kit, go-to-market assets." },
            { name: "keepsake_commission", type: "REMEMBER", desc: "Custom Keepsake Commission — art + story page + carousel from photos and notes. Triggers: keepsake, memory, anniversary gift, trip, tribute." },
          ]}
        />
      </Section>

      <Section id="pricing" title="Pricing: scope tiers, floors, and what moves the number">
        <ParamTable
          rows={[
            { name: "essential", type: "2–4 USDT", desc: "Core deliverables, one style, standard turnaround." },
            { name: "signature", type: "5–9 USDT", desc: "Full deliverable set, style direction honored, grounded research where applicable." },
            { name: "monumental", type: "10–15 USDT", desc: "Everything, multiple style explorations, rush-eligible, extended revision." },
          ]}
        />
        <p>
          <strong>Floors are floors.</strong> Below 2 USDT the answer is a polite redirect to the
          per-call tools, which exist precisely for smaller budgets. Rush (under ~2 hours) adds
          50%. Scope changes after agreement re-open the quote — they never silently expand it.
        </p>
      </Section>

      <Section id="delivery" title="Delivery spec and acceptance">
        <ParamTable
          rows={[
            { name: "deliverable", type: "pack link + seal", desc: "A public /k page (artifacts, full TribunalReport) plus the sealed manifest — verifiable on X Layer before acceptance." },
            { name: "quality bar", type: "OQS pass", desc: "Artifacts pass the published standard or the report says exactly why not — the report ships either way and is part of the deliverable." },
            { name: "revisions", type: "1 round included", desc: "One structured revision round: specific, itemized change requests against delivered artifacts. Additional rounds are quoted." },
            { name: "acceptance", type: "criteria template", desc: "Agreed at quote time: deliverable list, style id, grounding requirements, deadline, and the verify link that proves delivery." },
          ]}
        />
      </Section>

      <Section id="negotiation" title="How the negotiation behaves">
        <p>
          The negotiation brain is a versioned skill in the repository —{" "}
          <InlineCode>packages/mcp-server/src/a2a/</InlineCode> — with tested responses for the
          situations that actually occur:
        </p>
        <ul className="!mt-2 list-none space-y-2">
          <li>· <strong>Lowball</strong> → hold the floor once, offer the essential tier or the per-call tools; never race to the bottom.</li>
          <li>· <strong>Vague scope</strong> → structured intake questions before any number; no quote without a scope.</li>
          <li>· <strong>Rush</strong> → honest feasibility call plus the rush premium, or a truthful no.</li>
          <li>· <strong>Scope creep mid-job</strong> → the agreement stands; new asks are quoted as a change order.</li>
          <li>· <strong>Out-of-policy asks</strong> → the same dignified refusal the Studio gives: third-party IP, real-person likeness and the rest are declined before money moves.</li>
        </ul>
        <CodeBlock title="a sample structured quote (what a counterparty receives)" lang="json">{`{
  "taskType": "launch_pack",
  "tier": "signature",
  "quoteUsdt": 7,
  "scope": {
    "deliverables": ["brand_kit", "og_image", "brand_mark", "launch_thread", "demo_script"],
    "styleId": "gilded_noir",
    "grounding": "live site inspection of https://…",
    "deadline": "48h from agreement"
  },
  "includes": "1 revision round · full TribunalReport · sealed manifest + verify link",
  "acceptance": "all hard checks pass; thread clears the anti-slop filter; you verify the seal on-chain"
}`}</CodeBlock>
        <Callout>
          Escrow, settlement and dispute mechanics follow the OKX.AI task marketplace — Occestra
          plugs its delivery and quality machinery into that rail rather than inventing its own.
        </Callout>
      </Section>

      <Section id="why" title="Why buy the package instead of the tools?">
        <p>
          Coherence. Eight artifacts that share one brief, one style system, one grounded fact
          base, one seal — instead of eight independent calls you have to art-direct yourself. The
          per-call tools stay the honest budget option, and{" "}
          <InlineCode>oce_critique</InlineCode> at 0.01 USDT remains the cheapest way to audition
          the Tribunal before committing to anything. See{" "}
          <Link href="/pricing" className="text-amethyst underline underline-offset-2">pricing</Link>{" "}
          for both rails side by side.
        </p>
      </Section>

      <PrevNext slug="a2a" />
    </>
  );
}

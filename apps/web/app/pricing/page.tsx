import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/section-heading";
import { TOOLS } from "@/lib/real";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Twelve tools, settled per call in USDT on X Layer — plus negotiated A2A packages for complete occasions. Every price covers what the work actually costs, and we publish that too.",
};

const PACKAGES = [
  {
    name: "Complete Occasion Pack",
    range: "$4–12, negotiated",
    gives:
      "The full CELEBRATE studio end to end: grounded plan, schedule, budget, contingencies, invitation suite, guest guide, toast, moodboard — graded, repaired, sealed.",
  },
  {
    name: "Complete Launch Pack",
    range: "$3–10, negotiated",
    gives:
      "The full LAUNCH studio on your real site: brand genome, hero visual, announcement cards, launch thread, demo beat sheet, OG images.",
  },
  {
    name: "Keepsake Commission",
    range: "$2–8, negotiated",
    gives:
      "REMEMBER at full depth on your photos and notes: keepsake art, story page, social carousel — private by default, deletable for real.",
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/" className="text-[0.85rem] text-ink/60 transition-colors hover:text-ink">
        ← Occestra
      </Link>

      <SectionHeading
        kicker="Pricing"
        className="mt-8"
        lede="Two rails: cheap tools any agent can buy on impulse, and negotiated packages for the whole occasion. Settlement is x402 in USDT on X Layer — no subscription, no account, no key."
      >
        Priced against what the work actually costs.
      </SectionHeading>

      <section className="mt-12">
        <h2 className="text-kicker text-ink/60">A2MCP tools — per call</h2>
        <ul className="mt-4 divide-y divide-ink/8 border-y border-ink/10">
          {TOOLS.map((tool) => (
            <li
              key={tool.name}
              className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr_5rem] sm:items-baseline sm:gap-6"
            >
              <span className="text-data text-[0.82rem] text-ink/85">{tool.name}</span>
              <span className="text-[0.9rem] text-ink/65">{tool.gives}</span>
              <span className="text-data sm:text-right">
                {tool.price === null ? (
                  <span className="text-ink/55">at cost</span>
                ) : tool.price === 0 ? (
                  <span className="font-medium text-pass">free</span>
                ) : (
                  <>{tool.price.toFixed(2)} <span className="text-ink/45">USDT</span></>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-kicker text-ink/60">A2A packages — negotiated per project</h2>
        <p className="prose-measure mt-3 text-[0.92rem] leading-relaxed text-ink/65">
          For expertise-driven, multi-round work that doesn&apos;t fit a fixed price, Occestra
          negotiates escrowed agent-to-agent packages on OKX.AI — brief in, offers exchanged,
          delivery verified against the published standard before funds release.
        </p>
        <div className="mt-6 space-y-4">
          {PACKAGES.map((pkg) => (
            <div key={pkg.name} className="rounded-2xl border border-ink/10 bg-panel/50 p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-subhead">{pkg.name}</h3>
                <span className="text-data text-ink/60">{pkg.range}</span>
              </div>
              <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed text-ink/65">{pkg.gives}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-ink/10 bg-ground p-5 sm:p-6">
        <h2 className="text-kicker text-amethyst">About demo credits</h2>
        <p className="prose-measure mt-3 text-[0.9rem] leading-relaxed text-ink/65">
          The in-browser{" "}
          <Link href="/studio" className="text-amethyst underline decoration-amethyst/30 underline-offset-2">
            Studio
          </Link>{" "}
          runs the same real pipelines on a small metered daily allowance — our model budget, spent
          for real, clearly labelled. Demo runs are recorded separately from paid orders and are
          never counted as revenue. Agents calling the paid endpoint have no such limit.
        </p>
      </section>
    </main>
  );
}

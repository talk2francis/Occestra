import { Reveal } from "@/components/motion";
import { SectionHeading } from "@/components/ui/section-heading";
import { TOOLS } from "@/lib/real";

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-y border-ink/8 bg-panel/50 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            kicker="Pricing"
            lede="Settled in USDT on X Layer, per call — x402, no subscription, no account. Every price covers what the work really costs to make, and we publish that number too. Full occasion packs are negotiated agent-to-agent."
          >
            Priced against what the work actually costs.
          </SectionHeading>
        </Reveal>

        <Reveal delay={0.08}>
          <ul className="mt-12 divide-y divide-ink/8 border-y border-ink/10">
            {TOOLS.map((tool) => (
              <li
                key={tool.name}
                className="group grid gap-1 py-4 transition-colors hover:bg-ground/70 sm:grid-cols-[15rem_1fr_5.5rem] sm:items-baseline sm:gap-6 sm:px-3"
              >
                <span className="text-data text-[0.82rem] text-ink/85">{tool.name}</span>
                <span className="text-[0.9rem] text-ink/65">{tool.gives}</span>
                <span className="text-data text-left text-ink/85 sm:text-right">
                  {tool.price === null ? (
                    // A job costs what the tool it runs costs. Printing a number here would be
                    // inventing one.
                    <span className="text-ink/55">at cost</span>
                  ) : tool.price === 0 ? (
                    <span className="font-medium text-pass">free</span>
                  ) : (
                    <>{tool.price.toFixed(2)} <span className="text-ink/60">USDT</span></>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-8 max-w-2xl text-[0.92rem] leading-relaxed text-ink/65">
            The 0.01 critique sells below what it costs us, deliberately: run <em>your</em>{" "}
            agent&apos;s output through Occestra&apos;s Tribunal and get the graded report and the
            repair brief back. A marketplace where output is checkable is a better marketplace for
            everyone in it, including us — and a grading tool priced to protect its own margin
            would never get used. Cheaper than finding out from your users.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { OQS_VERSION } from "@occestra/tribunal";
import { SectionHeading } from "@/components/ui/section-heading";
import { Badge } from "@/components/ui/badge";
import { ConsensusPanel } from "@/components/consensus-panel";

export const metadata: Metadata = {
  title: "Our grader doesn't get the final word",
  description:
    "Occestra's Tribunal makes the first quality decision. Public artifacts can then be independently reviewed by GenLayer's decentralized AI validators, who can uphold or overturn it.",
};

export const dynamic = "force-dynamic";

const INTERNAL = process.env.OCE_INTERNAL_API ?? "http://127.0.0.1:8412";

interface ConsensusStats {
  reviews: number;
  finalized: number;
  upheld: number;
  overturned: number;
  undetermined: number;
  pending: number;
  failed: number;
}

async function fetchStats(): Promise<ConsensusStats | undefined> {
  try {
    const res = await fetch(`${INTERNAL}/genlayer/stats`, { cache: "no-store" });
    if (!res.ok) return undefined;
    return (await res.json()) as ConsensusStats;
  } catch {
    return undefined;
  }
}

/** The three layers, and what each is actually responsible for. */
const LAYERS = [
  {
    kicker: "create · grade",
    who: "Occestra",
    what: "Plans the occasion, makes the work, and grades every artifact against the published OQS. Fast, versioned, and ours.",
  },
  {
    kicker: "adjudicate",
    who: "GenLayer",
    what: "Independent AI validators read a frozen public evidence snapshot and rule on whether our verdict was actually supported.",
  },
  {
    kicker: "prove",
    who: "X Layer",
    what: "Hash-anchored, EIP-712 signed provenance. Who made it, and when — separate from any question of whether it is good.",
  },
];

export default async function ConsensusPage() {
  const stats = await fetchStats();

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/" className="text-[0.85rem] text-ink/60 transition-colors hover:text-ink">
        ← Occestra
      </Link>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <Badge tone="amethyst">independent review</Badge>
        <Badge>GenLayer</Badge>
      </div>

      <h1 className="text-display mt-6 max-w-[16em] text-balance">
        Our grader doesn&rsquo;t get the final word.
      </h1>

      <p className="prose-measure mt-6 text-[1.05rem] leading-relaxed text-ink/70">
        Every Occestra artifact is graded by the Tribunal against{" "}
        <Link href="/standard" className="text-amethyst underline decoration-amethyst/30 underline-offset-2">
          OQS v{OQS_VERSION}
        </Link>
        , and repaired until it passes. That is a real standard, published and versioned — but it
        is still our critic applying our rubric to our own output, which never quite answers the
        obvious objection: <em>of course it passed.</em>
      </p>

      <p className="prose-measure mt-4 text-[1.05rem] leading-relaxed text-ink/70">
        So a public artifact can be sent somewhere else. GenLayer&rsquo;s decentralized AI
        validators read a frozen evidence snapshot — the brief, the rubric, our own scores, and
        the artifact itself — and decide independently whether our verdict holds. They can
        uphold it, overturn it, or say the evidence supports neither.
      </p>

      <p className="prose-measure mt-4 text-[1.05rem] leading-relaxed text-ink/70">
        An overturn is not cosmetic. It sends the artifact back through the repair loop, and the
        original review stays on the record exactly as it was — our PASS and their OVERTURNED,
        side by side, permanently.
      </p>

      {/* ---------------------------------------------------------- the split */}

      <section className="mt-14">
        <SectionHeading kicker="the trust split" lede="Three different guarantees. Blurring them would make all three worth less.">
          Who is responsible for what
        </SectionHeading>

        <div className="mt-8 flex flex-col gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/8">
          {LAYERS.map((layer) => (
            <div key={layer.who} className="bg-panel/70 p-5 sm:p-6">
              <p className="text-[0.7rem] tracking-[0.12em] text-amethyst uppercase">{layer.kicker}</p>
              <h3 className="mt-2 font-serif text-[1.15rem]">{layer.who}</h3>
              <p className="mt-2 max-w-[54ch] text-[0.92rem] leading-relaxed text-ink/65">{layer.what}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------- what it looks like */}

      <section className="mt-14">
        <SectionHeading kicker="on a pack page" lede="What you see when a review has been made, and disagreed with us.">
          The panel
        </SectionHeading>

        <div className="mt-8">
          <ConsensusPanel
            review={{
              reviewId: "oce_gl_example_review",
              status: "FINALIZED",
              decision: "OVERTURNED",
              scoreBand: "50-69",
              criticalFailure: "LEGIBILITY",
              failureCodes: ["LEGIBILITY", "BRIEF_MISMATCH"],
              localVerdict: "PASS",
              oqsVersion: OQS_VERSION,
              network: "genlayer-bradbury",
            }}
          />
        </div>
        <p className="mt-3 text-[0.8rem] text-ink/45">
          An illustration of the layout, not a real review. Real reviews carry a contract
          address and a transaction you can open on the explorer.
        </p>
      </section>

      {/* -------------------------------------------------------------- counters */}

      <section className="mt-14">
        <SectionHeading kicker="so far" lede="Real counts from the store. Shown small when they are small, because pretending otherwise would defeat the point of the whole page.">
          Reviews to date
        </SectionHeading>

        {stats && stats.reviews > 0 ? (
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/8 sm:grid-cols-3">
            {[
              { label: "Reviews requested", value: stats.reviews },
              { label: "Finalized", value: stats.finalized },
              { label: "Upheld", value: stats.upheld },
              { label: "Overturned", value: stats.overturned },
              { label: "Undetermined", value: stats.undetermined },
              { label: "Unavailable", value: stats.failed },
            ].map((counter) => (
              <div key={counter.label} className="bg-panel/70 p-5">
                <dd className="font-serif text-[1.8rem] leading-none">{counter.value}</dd>
                <dt className="mt-2 text-[0.75rem] leading-snug text-ink/55">{counter.label}</dt>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-8 max-w-[54ch] text-[0.95rem] leading-relaxed text-ink/60">
            No reviews have been finalized yet. This page will show real counts when there are
            some — it will not show seeded numbers in the meantime.
          </p>
        )}
      </section>

      <footer className="mt-14 border-t border-ink/8 pt-6">
        <p className="max-w-[54ch] text-[0.88rem] leading-relaxed text-ink/60">
          Only artifacts explicitly published for consensus are eligible. Private Remember
          material is refused outright, and what goes on chain is a redacted snapshot — never
          your originals, tokens, or private links. See{" "}
          <Link href="/docs/privacy" className="text-amethyst underline decoration-amethyst/30 underline-offset-2">
            how we handle your material
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}

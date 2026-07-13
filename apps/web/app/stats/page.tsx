import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/section-heading";

export const metadata: Metadata = {
  title: "Stats",
  description: "Live, honest counters from the Occestra store — never inflated, shown small when they are small.",
};

export const dynamic = "force-dynamic";

const INTERNAL = process.env.OCE_INTERNAL_API ?? "http://127.0.0.1:8412";

interface Stats {
  packsCreated: number;
  sealsAnchored: number;
  tribunalRepairs: number;
  coverageGapsDisclosed: number;
  paidOrders: number;
  revenueUsdt: number;
  asOf: string;
}

async function fetchStats(): Promise<Stats | undefined> {
  try {
    const res = await fetch(`${INTERNAL}/stats`, { cache: "no-store" });
    if (!res.ok) return undefined;
    return (await res.json()) as Stats;
  } catch {
    return undefined;
  }
}

export default async function StatsPage() {
  const stats = await fetchStats();

  const counters = stats
    ? [
        { label: "Occasion packs created", value: stats.packsCreated, note: "every one a real run" },
        { label: "Seals anchored on X Layer", value: stats.sealsAnchored, note: "verifiable on chain" },
        { label: "Tribunal repairs performed", value: stats.tribunalRepairs, note: "failures sent back and reworked" },
        { label: "Coverage gaps disclosed", value: stats.coverageGapsDisclosed, note: "honesty, on the record" },
        { label: "Paid orders settled", value: stats.paidOrders, note: "x402, on X Layer" },
        { label: "Revenue settled (USDT)", value: stats.revenueUsdt, note: "real settlements only" },
      ]
    : [];

  return (
    <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/" className="text-[0.85rem] text-ink/60 transition-colors hover:text-ink">
        ← Occestra
      </Link>

      <SectionHeading
        kicker="Stats"
        className="mt-8"
        lede="Computed live from the store on every request. These numbers are small because the product is days old — we would rather show you a true 'twenty' than a marketing 'thousands'."
      >
        The honest counters.
      </SectionHeading>

      {!stats ? (
        <p className="mt-10 text-[0.9rem] text-ink/65">
          The store is briefly unreachable — no cached or invented numbers will be shown in its
          place. Try again in a moment.
        </p>
      ) : (
        <>
          <dl className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {counters.map((counter) => (
              <div key={counter.label}>
                <dd className="font-serif text-[3.2rem] leading-none font-medium tracking-tight" style={{ fontVariationSettings: "'opsz' 72" }}>
                  {counter.value}
                </dd>
                <dt className="mt-2 text-[0.85rem] font-medium text-ink/80">{counter.label}</dt>
                <p className="text-[0.75rem] text-ink/60">{counter.note}</p>
              </div>
            ))}
          </dl>
          <p className="text-data mt-12 text-ink/60">
            as of {stats.asOf} · demo runs are recorded separately and never counted as paid volume
            · fabricating any number on this page would fail our own POLICY_VIOLATION check
          </p>
        </>
      )}
    </main>
  );
}

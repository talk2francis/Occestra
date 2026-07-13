import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { SealMark } from "@/components/ui/seal-mark";
import { SectionHeading } from "@/components/ui/section-heading";
import { STYLE_NAMES, fetchPack, type PublicPack } from "@/lib/pack";

export const metadata: Metadata = {
  title: "The Occasions Journal — Issue No. 1",
  description:
    "A weekly, postable selection of the best sealed packs — real briefs, real grades, real seals, editorial notes included.",
};

export const dynamic = "force-dynamic";

/**
 * The weekly showcase: a few packs that earned their place, with a sentence of
 * honest editorial each. New issues prepend to ISSUES; old ones stay readable.
 * Everything shown is a real run — the note says why it's here, including when
 * the reason is an instructive imperfection.
 */
const ISSUES: Array<{
  number: number;
  week: string;
  title: string;
  standfirst: string;
  picks: Array<{ id: string; note: string }>;
}> = [
  {
    number: 1,
    week: "2026 · July, week 2",
    title: "The launch week",
    standfirst:
      "Everything in this first issue was made while Occestra was being built — our own briefs, run through the real pipelines, kept exactly as graded.",
    picks: [
      {
        id: "oce_01kxcafnsd2ty4ew7tc8jx",
        note: "The first keepsake the live service ever sealed — the morning after the landing page shipped, coffee going cold next to the deploy log. A studio that can keep its own small moments is a studio you can hand yours.",
      },
      {
        id: "oce_01kxbz33bb4grnd1xh0gev",
        note: "The first sealed pack, period. Eight real Lisbon venues, a real forecast, and a plan honest enough to say 'nothing on this page is a reservation'. The landing page still replays this run.",
      },
      {
        id: "oce_01kxc1fs5t73wf0ncs18he",
        note: "Occestra's launch kit for itself — included because its thread was repaired twice and STILL shipped marked fail. A standard that spares its owner is not a standard; here is ours, not sparing us.",
      },
    ],
  },
];

function firstImage(pack: PublicPack): { url: string; title: string } | undefined {
  const artifact = pack.artifacts.find((a) => a.url && a.format === "png");
  return artifact?.url ? { url: artifact.url, title: artifact.title } : undefined;
}

export default async function JournalPage() {
  const issue = ISSUES[0]!;
  const packs = await Promise.all(issue.picks.map(async (pick) => ({ pick, pack: await fetchPack(pick.id) })));

  return (
    <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/" className="text-[0.85rem] text-ink/60 transition-colors hover:text-ink">
        ← Occestra
      </Link>

      <SectionHeading
        kicker={`The Occasions Journal · Issue No. ${issue.number} · ${issue.week}`}
        className="mt-8"
        lede={issue.standfirst}
      >
        {issue.title}
      </SectionHeading>

      <div className="mt-12 space-y-10">
        {packs.map(({ pick, pack }) =>
          pack ? (
            <article key={pick.id} className="grid gap-6 rounded-3xl border border-ink/10 bg-panel/40 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div>
                {firstImage(pack) ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- signed expiring URL */
                  <img
                    src={firstImage(pack)!.url}
                    alt={firstImage(pack)!.title}
                    className="w-full rounded-xl border border-ink/10 shadow-lift"
                  />
                ) : (
                  <div className="grid aspect-[4/3] place-items-center rounded-xl border border-ink/10 bg-ground">
                    <SealMark size={80} className="text-amethyst/60" />
                  </div>
                )}
              </div>
              <div className="flex flex-col">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="amethyst">{pack.studio}</Badge>
                  {pack.artifacts.find((a) => a.styleId) && (
                    <Badge>{STYLE_NAMES[pack.artifacts.find((a) => a.styleId)!.styleId!] ?? ""}</Badge>
                  )}
                  {pack.seal && <GradeChip verdict="pass">sealed</GradeChip>}
                  <GradeChip verdict={pack.quality.passRate === 1 ? "pass" : "repair"}>
                    pass rate {Math.round(pack.quality.passRate * 100)}%
                  </GradeChip>
                </div>
                <h2 className="text-subhead mt-4">{pack.artifacts[0]?.title}</h2>
                <p className="mt-3 font-serif text-[1.05rem] leading-relaxed text-ink/70 italic">{pick.note}</p>
                <Link
                  href={`/k/${pack.id}`}
                  className="mt-auto pt-5 text-[0.9rem] font-medium text-amethyst underline decoration-amethyst/30 underline-offset-4"
                >
                  The full pack, report and seal →
                </Link>
              </div>
            </article>
          ) : null,
        )}
      </div>

      <p className="mt-12 text-[0.88rem] leading-relaxed text-ink/60">
        The Journal is curated weekly from real, verifiable work — never from mockups. Want yours
        in the next issue?{" "}
        <Link href="/studio" className="text-amethyst underline decoration-amethyst/30 underline-offset-2">
          Open the Studio
        </Link>{" "}
        or commission a pack{" "}
        <Link href="/docs/a2a" className="text-amethyst underline decoration-amethyst/30 underline-offset-2">
          agent-to-agent
        </Link>
        .
      </p>
    </main>
  );
}

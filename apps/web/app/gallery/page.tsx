import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { SealMark } from "@/components/ui/seal-mark";
import { SectionHeading } from "@/components/ui/section-heading";
import { BUILD_DIARY_IDS, GALLERY_IDS } from "@/lib/gallery";
import { STYLE_NAMES, fetchPack, type PublicPack } from "@/lib/pack";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "Real packs from real runs — every image, plan and grade is genuine output, sealed where sealed, disclosed where imperfect.",
};

export const dynamic = "force-dynamic";

function firstImage(pack: PublicPack): { url: string; title: string } | undefined {
  const artifact = pack.artifacts.find((a) => a.url && a.format === "png");
  return artifact?.url ? { url: artifact.url, title: artifact.title } : undefined;
}

function excerpt(pack: PublicPack): string | undefined {
  const artifact = pack.artifacts.find((a) => a.format === "md" && a.data);
  const block = artifact?.data
    ?.split(/\n{2,}/)
    .find((chunk) => !chunk.startsWith("#") && chunk.trim().length > 40);
  return block
    ?.replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^[-*|]\s*/gm, "")
    .slice(0, 220);
}

export default async function GalleryPage() {
  const load = async (ids: string[]): Promise<PublicPack[]> =>
    (await Promise.all(ids.map((id) => fetchPack(id)))).filter(
      (pack): pack is PublicPack => Boolean(pack),
    );

  const [packs, diary] = await Promise.all([load(GALLERY_IDS), load(BUILD_DIARY_IDS)]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/" className="text-[0.85rem] text-ink/60 transition-colors hover:text-ink">
        ← Occestra
      </Link>

      <SectionHeading
        kicker="Gallery"
        className="mt-8"
        lede="Our own briefs, run through the real pipelines while we built this — kept exactly as they came out. Grades and repairs shown as graded; nothing curated out for failing."
      >
        Real runs, kept honest.
      </SectionHeading>

      {packs.length === 0 ? (
        <p className="mt-10 text-[0.9rem] text-ink/65">The store is briefly unreachable — nothing fake will be shown in its place.</p>
      ) : (
        <div className="mt-12 columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5 [&>*]:break-inside-avoid">
          {packs.map((pack) => {
            const image = firstImage(pack);
            const text = image ? undefined : excerpt(pack);
            const styleId = pack.artifacts.find((a) => a.styleId)?.styleId;
            const title = pack.artifacts[0]?.title ?? `A ${pack.studio} pack`;

            return (
              <Link
                key={pack.id}
                href={`/k/${pack.id}`}
                className="lum-edge group block overflow-hidden rounded-2xl border border-ink/10 bg-ground shadow-lift transition-shadow hover:shadow-keepsake"
              >
                {image && (
                  /* eslint-disable-next-line @next/next/no-img-element -- signed expiring URL */
                  <img src={image.url} alt={image.title} className="w-full" loading="lazy" />
                )}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="amethyst">{pack.studio}</Badge>
                      {styleId && <Badge>{STYLE_NAMES[styleId] ?? styleId}</Badge>}
                    </div>
                    {pack.seal && <SealMark size={34} className="shrink-0 text-amethyst/70" />}
                  </div>
                  <h2 className="text-subhead mt-3 leading-snug group-hover:underline group-hover:decoration-ink/25 group-hover:underline-offset-4">
                    {title}
                  </h2>
                  {text && (
                    <p className="mt-2 font-serif text-[0.95rem] leading-relaxed text-ink/65 italic">
                      “{text}…”
                    </p>
                  )}
                  <p className="mt-3 flex flex-wrap gap-1.5">
                    <GradeChip verdict={pack.quality.passRate === 1 ? "pass" : "repair"}>
                      pass rate {Math.round(pack.quality.passRate * 100)}%
                    </GradeChip>
                    {pack.quality.repairedCount > 0 && (
                      <GradeChip verdict="repair">repaired ×{pack.quality.repairedCount}</GradeChip>
                    )}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/*
        The same brief, on earlier nights of the build. Demoted, not deleted: quietly
        removing the weak runs to flatter the average is the fake-portfolio move this
        product exists to argue against.
      */}
      {diary.length > 0 && (
        <details className="mt-14 rounded-2xl border border-ink/10 bg-panel/40 p-5">
          <summary className="cursor-pointer text-[0.9rem] font-medium text-ink/75 hover:text-ink">
            The build diary — {diary.length} earlier runs of the same brief, kept as they came out
          </summary>
          <p className="mt-3 max-w-2xl text-[0.85rem] leading-relaxed text-ink/60">
            Occestra running its LAUNCH studio on Occestra, on three earlier nights. They are
            thinner than the featured run and one of them is still marked <em>fail</em> after two
            repairs. They stay because deleting the runs that went badly, to make the average look
            better, is precisely the thing this product exists to argue against.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-3">
            {diary.map((pack) => (
              <li key={pack.id}>
                <Link
                  href={`/k/${pack.id}`}
                  className="block rounded-xl border border-ink/10 bg-ground p-3.5 transition-shadow hover:shadow-lift"
                >
                  <p className="text-data text-ink/55">{pack.id}</p>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    <GradeChip verdict={pack.quality.passRate === 1 ? "pass" : "repair"}>
                      pass rate {Math.round(pack.quality.passRate * 100)}%
                    </GradeChip>
                    {pack.quality.repairedCount > 0 && (
                      <GradeChip verdict="repair">repaired ×{pack.quality.repairedCount}</GradeChip>
                    )}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-10 text-[0.85rem] text-ink/65">
        Want one of your own?{" "}
        <Link href="/studio" className="text-amethyst underline decoration-amethyst/30 underline-offset-2">
          Open the Studio
        </Link>{" "}
        — or call the tools directly from your agent.
      </p>
    </main>
  );
}

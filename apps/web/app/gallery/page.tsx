import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { SealMark } from "@/components/ui/seal-mark";
import { SectionHeading } from "@/components/ui/section-heading";
import { GALLERY_IDS } from "@/lib/gallery";
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
  const packs = (await Promise.all(GALLERY_IDS.map((id) => fetchPack(id)))).filter(
    (pack): pack is PublicPack => Boolean(pack),
  );

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
                className="group block overflow-hidden rounded-2xl border border-ink/10 bg-ground shadow-lift transition-shadow hover:shadow-keepsake"
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

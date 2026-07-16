import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArtifactView } from "@/components/keepsake/artifact-view";
import { ShareRow } from "@/components/keepsake/share";
import { TribunalReport } from "@/components/keepsake/tribunal-report";
import { VerifyButton } from "@/components/keepsake/verify-button";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { GuillocheRing } from "@/components/ui/guilloche";
import { SealMark } from "@/components/ui/seal-mark";
import {
  STYLE_NAMES,
  fetchKeepsake,
  isPrivatePack,
  type PrivatePack,
  type PublicPack,
} from "@/lib/pack";

export const dynamic = "force-dynamic";

function headline(pack: PublicPack): string {
  return pack.artifacts[0]?.title ?? `A ${pack.studio} pack`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const pack = await fetchKeepsake(id);
  if (!pack) return { title: "Keepsake not found" };
  if (isPrivatePack(pack)) {
    const title = "A private Remember keepsake";
    const description =
      "Its contents remain private. Its salted provenance seal can still be verified on X Layer without revealing the memory.";
    return {
      title,
      description,
      openGraph: { title, description },
      twitter: { card: "summary_large_image", title, description },
    };
  }
  const title = headline(pack);
  const description = pack.seal
    ? `Made by Occestra's ${pack.studio} studio, graded against OQS v${pack.quality.oqsVersion}, sealed on X Layer. Verify it yourself.`
    : `Made by Occestra's ${pack.studio} studio and graded against OQS v${pack.quality.oqsVersion}.`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function KeepsakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pack = await fetchKeepsake(id);
  if (!pack) notFound();
  if (isPrivatePack(pack)) return <PrivateKeepsakePage pack={pack} />;

  const styleId = pack.artifacts.find((artifact) => artifact.styleId)?.styleId;
  const created = pack.createdAt.slice(0, 10);

  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <Link href="/" className="text-[0.85rem] text-ink/60 transition-colors hover:text-ink">
        ← Occestra
      </Link>

      {/* the keepsake card */}
      <header className="mt-8 rounded-3xl border border-ink/12 bg-ground p-7 shadow-keepsake sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="amethyst">{pack.studio} pack</Badge>
              {styleId && <Badge>{STYLE_NAMES[styleId] ?? styleId}</Badge>}
            </div>
            <h1 className="text-headline mt-4 text-balance">{headline(pack)}</h1>
            <p className="text-data mt-3 text-ink/60">
              {pack.id} · created {created}
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <GradeChip verdict={pack.quality.passRate === 1 ? "pass" : "repair"}>
                pass rate {Math.round(pack.quality.passRate * 100)}%
              </GradeChip>
              {pack.quality.repairedCount > 0 && (
                <GradeChip verdict="repair">repairs {pack.quality.repairedCount}</GradeChip>
              )}
              {/*
                Sits deliberately NEXT TO the pass rate. Undelivered work is excluded
                from that percentage, so the percentage alone could otherwise flatter a
                pack that is missing half of what it promised.
              */}
              {(pack.quality.undeliveredCount ?? 0) > 0 && (
                <GradeChip verdict="fail">
                  not delivered {pack.quality.undeliveredCount}
                </GradeChip>
              )}
              <GradeChip verdict="info">OQS v{pack.quality.oqsVersion}</GradeChip>
            </div>
          </div>
          {pack.seal && (
            <span className="relative hidden shrink-0 sm:block">
              <GuillocheRing size={158} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              <SealMark size={110} className="relative text-amethyst/90" />
            </span>
          )}
        </div>

        {pack.seal ? (
          <div className="mt-8 space-y-4 border-t border-ink/10 pt-6">
            <VerifyButton seal={pack.seal} />
            <dl className="text-data grid gap-x-8 gap-y-2 text-ink/60 sm:grid-cols-2">
              <div>
                <dt className="text-ink/45">manifest hash</dt>
                <dd className="break-all">{pack.seal.manifestHash}</dd>
              </div>
              <div>
                <dt className="text-ink/45">signed by · EIP-712</dt>
                <dd className="break-all">{pack.seal.signer}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="mt-8 border-t border-ink/10 pt-6 text-[0.85rem] text-ink/60">
            This pack was delivered unsigned — honestly labelled as exactly that.
          </p>
        )}

        <div className="mt-6">
          <ShareRow title={headline(pack)} />
        </div>
      </header>

      {/* artifacts */}
      <section className="mt-10">
        <h2 className="text-kicker text-amethyst">The work</h2>
        <div className="mt-4 space-y-4">
          {pack.artifacts.map((artifact) => (
            <ArtifactView key={artifact.id} artifact={artifact} />
          ))}
        </div>
      </section>

      {/* the report */}
      <section className="mt-10">
        <h2 className="text-kicker text-amethyst">The Tribunal&apos;s report</h2>
        <p className="prose-measure mt-2 text-[0.9rem] leading-relaxed text-ink/65">
          Every artifact above was graded against the published Occestra Quality Standard — the
          full report ships with the pack, pass or fail.{" "}
          <Link href="/standard" className="text-amethyst underline decoration-amethyst/30 underline-offset-2">
            Read the standard
          </Link>
          .
        </p>
        <div className="mt-4">
          <TribunalReport artifacts={pack.artifacts} />
        </div>
        {pack.coverageGaps.length > 0 && (
          <div className="mt-4">
            <span className="text-kicker text-[0.58rem] text-info">Pack-level gaps disclosed</span>
            <ul className="mt-2 space-y-1.5">
              {pack.coverageGaps.map((gap) => (
                <li key={gap.code} className="text-[0.8rem] leading-relaxed text-ink/60">
                  <span className="text-data mr-2 text-ink/45">{gap.code}</span>
                  {gap.note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <footer className="mt-14 border-t border-ink/8 pt-6">
        <p className="text-data text-ink/60">
          Made by{" "}
          <Link href="/" className="underline decoration-ink/20 underline-offset-2 hover:text-ink">
            Occestra
          </Link>{" "}
          — every moment, made monumental. Anything here can be independently verified
          {pack.seal ? "; the seal above is on X Layer mainnet" : ""}.
        </p>
      </footer>
    </main>
  );
}

function PrivateKeepsakePage({ pack }: { pack: PrivatePack }) {
  const created = pack.createdAt.slice(0, 10);

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col px-5 py-10 sm:px-8 sm:py-14">
      <Link href="/" className="text-[0.85rem] text-ink/60 transition-colors hover:text-ink">
        ← Occestra
      </Link>

      <header className="relative mt-8 overflow-hidden rounded-3xl border border-ink/12 bg-ground p-7 shadow-keepsake sm:p-10">
        <GuillocheRing
          aria-hidden
          size={360}
          className="absolute -top-24 -right-24 opacity-[0.045]"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-xl">
            <Badge tone="amethyst">private remember pack</Badge>
            <h1 className="text-headline mt-4 text-balance">A memory kept private, a seal kept public.</h1>
            <p className="text-data mt-3 text-ink/60">
              {pack.id} · created {created}
            </p>
            <p className="mt-5 text-[0.95rem] leading-relaxed text-ink/65">{pack.note}</p>
          </div>
          {pack.seal && (
            <span className="relative hidden shrink-0 sm:block">
              <GuillocheRing size={158} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              <SealMark size={110} className="glow-seal relative text-amethyst/90" />
            </span>
          )}
        </div>

        {pack.seal ? (
          <div className="relative mt-8 space-y-4 border-t border-ink/10 pt-6">
            <VerifyButton seal={pack.seal} />
            <dl className="text-data grid gap-x-8 gap-y-2 text-ink/60 sm:grid-cols-2">
              <div>
                <dt className="text-ink/45">salted commitment</dt>
                <dd className="break-all">{pack.seal.manifestHash}</dd>
              </div>
              <div>
                <dt className="text-ink/45">signed by · EIP-712</dt>
                <dd className="break-all">{pack.seal.signer}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="relative mt-8 border-t border-ink/10 pt-6 text-[0.85rem] text-ink/60">
            This private pack has no public seal. Its contents remain withheld.
          </p>
        )}
      </header>

      <section className="mt-10 rounded-2xl border border-ink/10 bg-panel/55 p-6 sm:p-8">
        <p className="text-kicker text-amethyst">What privacy means here</p>
        <p className="mt-3 max-w-[62ch] text-[0.9rem] leading-relaxed text-ink/65">
          No artwork, story, upload or predictable unsalted manifest is published on this page.
          The owner keeps the contents and salt; everyone else can only verify that the signed,
          salted commitment was anchored by Occestra on X Layer.
        </p>
      </section>

      <footer className="mt-auto border-t border-ink/8 pt-6">
        <p className="text-data text-ink/60">
          Privacy is part of the artifact, not a missing state. The proof above remains independently verifiable.
        </p>
      </footer>
    </main>
  );
}

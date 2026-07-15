import Link from "next/link";
import { fetchRecentPublicPacks, type RecentPublicPack } from "@/lib/pack";

function PackPulse({ pack, duplicate = false }: { pack: RecentPublicPack; duplicate?: boolean }) {
  const item = (
    <>
      <span className="glow-live size-1.5 rounded-full bg-lilac" aria-hidden />
      <span className="font-medium text-ink/80">{pack.descriptor}</span>
      <span className="text-data text-ink/70">{pack.id.slice(0, 13)}…</span>
    </>
  );
  if (duplicate) return <span className="flex shrink-0 items-center gap-3 px-5">{item}</span>;
  return (
    <Link
      href={`/k/${pack.id}`}
      className="flex shrink-0 items-center gap-3 px-5 transition-colors hover:text-amethyst"
    >
      {item}
    </Link>
  );
}

export async function RecentPacks() {
  const packs = await fetchRecentPublicPacks(8);
  if (packs.length === 0) return null;

  return (
    <section aria-label="Recently sealed Occestra packs" className="border-y border-ink/8 bg-panel/35 py-3">
      <div data-audit-clip className="flex items-center overflow-hidden">
        <p className="relative z-10 shrink-0 border-r border-ink/10 bg-panel px-5 py-1 text-kicker text-amethyst sm:px-8">
          Recently sealed
        </p>
        <div className="recent-track flex min-w-max items-center text-[0.78rem]" role="list">
          <div className="flex shrink-0 items-center" role="listitem">
            {packs.map((pack) => <PackPulse key={pack.id} pack={pack} />)}
          </div>
          <div className="flex shrink-0 items-center" aria-hidden="true">
            {packs.map((pack) => <PackPulse key={`copy-${pack.id}`} pack={pack} duplicate />)}
          </div>
        </div>
      </div>
    </section>
  );
}

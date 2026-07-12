import { GradeChip } from "@/components/ui/grade-chip";
import { SourceChip } from "@/components/ui/source-chip";
import type { PublicArtifact } from "@/lib/pack";

/**
 * One artifact, rendered by what it is: images large in a paper frame, prose
 * as an editorial excerpt, structured JSON honest and inspectable. The grade
 * always shows — pass or fail.
 */
export function ArtifactView({ artifact }: { artifact: PublicArtifact }) {
  return (
    <article className="rounded-2xl border border-ink/10 bg-ground p-5 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-subhead">{artifact.title}</h3>
          <p className="text-data mt-1 text-ink/60">
            {artifact.kind} · {artifact.format}
          </p>
        </div>
        {artifact.tribunal && (
          <GradeChip verdict={artifact.tribunal.pass ? "pass" : "fail"}>
            {artifact.tribunal.pass ? "pass" : "fail"}
            {artifact.tribunal.repairs > 0 ? ` · repaired ×${artifact.tribunal.repairs}` : ""}
          </GradeChip>
        )}
      </header>

      {artifact.url && (
        /* eslint-disable-next-line @next/next/no-img-element -- signed expiring URL, remote host */
        <img
          src={artifact.url}
          alt={artifact.title}
          className="mt-4 w-full rounded-xl border border-ink/10 shadow-lift"
        />
      )}

      {artifact.data && artifact.format === "md" && (
        <div className="mt-4 space-y-3 border-l-2 border-ink/10 pl-4">
          {artifact.data.split(/\n{2,}/).map((block, index) => {
            const heading = block.match(/^#{1,3}\s+(.*)/);
            if (heading) {
              return (
                <p key={index} className="text-kicker pt-1 text-[0.64rem] text-ink/60">
                  {heading[1]}
                </p>
              );
            }
            return (
              <p key={index} className="font-serif text-[1.02rem] leading-relaxed text-ink/80">
                {block.replace(/^[-*]\s+/gm, "· ")}
              </p>
            );
          })}
        </div>
      )}

      {artifact.data && artifact.format === "json" && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[0.85rem] font-medium text-ink/70 hover:text-ink">
            The structured data, exactly as delivered
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-ink p-4 font-mono text-[0.72rem] leading-relaxed text-ground/85">
            {JSON.stringify(JSON.parse(artifact.data), null, 2)}
          </pre>
        </details>
      )}

      {artifact.data && artifact.format === "html" && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[0.85rem] font-medium text-ink/70 hover:text-ink">
            The page source, exactly as delivered
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-ink p-4 font-mono text-[0.72rem] leading-relaxed text-ground/85">
            {artifact.data}
          </pre>
        </details>
      )}

      {artifact.sources.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {/* one chip per source system, with how many facts it grounded */}
          {[...new Map(artifact.sources.map((source) => [source.source, source])).values()].map(
            (source) => {
              const count = artifact.sources.filter((s) => s.source === source.source).length;
              return (
                <SourceChip
                  key={source.source}
                  source={count > 1 ? `${source.source} ×${count}` : source.source}
                  retrievedAt={source.retrievedAt}
                  {...(source.url ? { url: source.url } : {})}
                />
              );
            },
          )}
        </div>
      )}
    </article>
  );
}

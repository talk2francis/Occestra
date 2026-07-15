import { ArtifactImage } from "@/components/keepsake/artifact-image";
import { BrandGenome } from "@/components/keepsake/brand-genome";
import { GradeChip } from "@/components/ui/grade-chip";
import { SourceChip } from "@/components/ui/source-chip";
import type { PublicArtifact } from "@/lib/pack";
import type { ReactNode } from "react";

/** A deliberately small, safe markdown subset for public prose. Provider text
 * is untrusted, so render emphasis/code as React nodes rather than injecting
 * parser-produced HTML. */
function inlineMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|_[^_\n]+_|`[^`\n]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("_") && part.endsWith("_")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-panel px-1 font-mono text-[0.82em]">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

/**
 * One artifact, rendered by what it is: images large in a paper frame, prose
 * as an editorial excerpt, structured JSON honest and inspectable. The grade
 * always shows — pass or fail.
 */
export function ArtifactView({ artifact }: { artifact: PublicArtifact }) {
  return (
    <article className="lum-edge rounded-2xl border border-ink/10 bg-ground p-5 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-subhead">{artifact.title}</h3>
          <p className="text-data mt-1 text-ink/60">
            {artifact.kind} · {artifact.format}
          </p>
        </div>
        {artifact.undelivered ? (
          <GradeChip verdict="fail">not delivered</GradeChip>
        ) : (
          artifact.tribunal && (
            <GradeChip verdict={artifact.tribunal.pass ? "pass" : "fail"}>
              {artifact.tribunal.pass ? "pass" : "fail"}
              {artifact.tribunal.repairs > 0 ? ` · repaired ×${artifact.tribunal.repairs}` : ""}
            </GradeChip>
          )
        )}
      </header>

      {/*
        An artifact we owed and could not make. It is shown rather than dropped: a pack
        that quietly omits its failures reports a pass rate it never earned.
      */}
      {artifact.undelivered && (
        <div className="mt-4 rounded-xl border border-dashed border-ink/15 bg-panel/50 p-6">
          <p className="font-serif text-[1.05rem] leading-relaxed text-ink/75">
            {artifact.undelivered.reason}
          </p>
          <p className="text-data mt-3 text-ink/50">{artifact.undelivered.code}</p>
        </div>
      )}

      {artifact.url && !artifact.undelivered && (
        <ArtifactImage src={artifact.url} alt={artifact.title} />
      )}

      {/*
        The brand genome is the artifact the site inspection was PAID for. It gets a
        designed render — real colours as real swatches — not the generic prose path,
        which printed its markdown emphasis verbatim.
      */}
      {artifact.data && artifact.kind === "brand_kit" && <BrandGenome markdown={artifact.data} />}

      {artifact.data && artifact.format === "md" && artifact.kind !== "brand_kit" && (
        <div className="mt-4 space-y-3 border-l-2 border-ink/10 pl-4">
          {artifact.data.split(/\n{2,}/).map((block, index) => {
            const heading = block.match(/^#{1,3}\s+(.*)/);
            if (heading) {
              return (
                <p key={index} className="text-kicker pt-1 text-[0.64rem] text-ink/60">
                  {inlineMarkdown(heading[1] ?? "")}
                </p>
              );
            }
            const prose = block.replace(/^[-*]\s+/gm, "· ");
            return (
              <p key={index} className="whitespace-pre-line font-serif text-[1.02rem] leading-relaxed text-ink/80">
                {inlineMarkdown(prose)}
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
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-night p-4 font-mono text-[0.72rem] leading-relaxed text-night-fg/85">
            {JSON.stringify(JSON.parse(artifact.data), null, 2)}
          </pre>
        </details>
      )}

      {artifact.data && artifact.format === "html" && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[0.85rem] font-medium text-ink/70 hover:text-ink">
            The page source, exactly as delivered
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-night p-4 font-mono text-[0.72rem] leading-relaxed text-night-fg/85">
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

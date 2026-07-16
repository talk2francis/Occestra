"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/components/motion";
import { GradeChip } from "@/components/ui/grade-chip";
import { SealMark } from "@/components/ui/seal-mark";
import type { DemoEvent, FinishedGap, FinishedPack } from "@/lib/studio";
import type { RunStatus } from "./use-run";

/**
 * The right pane: the pack assembling itself. While the run streams, each
 * graded artifact settles in; on completion the seal, links and downloads
 * appear. Everything links to the real /k page and real signed artifact URLs.
 */
export function PackPanel({
  status,
  events,
  pack,
}: {
  status: RunStatus;
  events: DemoEvent[];
  pack: FinishedPack | undefined;
}) {
  const reduced = useReducedMotion();
  const gradedSoFar = events.filter((event) => event.type === "graded");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-ink/10 px-4 py-3 sm:px-5">
        <p className="text-kicker text-[0.62rem] text-amethyst">The pack</p>
      </div>

      <div className="studio-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
        {status === "idle" && (
          <p className="text-[0.82rem] leading-relaxed text-ink/60">
            Finished artifacts assemble here — graded, sourced, and sealed with provenance you can
            verify yourself.
          </p>
        )}

        {/* composing… */}
        {status === "running" && gradedSoFar.length === 0 && !pack && (
          <div className="shimmer rounded-xl border border-ink/10 bg-panel/50 p-4">
            <p className="text-[0.8rem] font-medium text-ink/60">composing…</p>
            <p className="mt-1 text-[0.72rem] text-ink/45">
              the first artifact lands here once the Tribunal has seen it
            </p>
          </div>
        )}

        {/* streaming assembly */}
        {!pack && (
          <AnimatePresence initial={false}>
            {gradedSoFar.map((event, index) =>
              event.type === "graded" ? (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: reduced ? 0 : 22, scale: reduced ? 1 : 0.96, rotate: reduced ? 0 : -1.2 }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  transition={
                    reduced
                      ? { duration: 0.3 }
                      : { type: "spring", stiffness: 300, damping: 26, mass: 0.9 }
                  }
                  className="rounded-xl border border-ink/10 bg-ground p-3.5 shadow-lift"
                >
                  <p className="text-[0.82rem] font-medium text-ink/85">{event.title}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-data text-ink/60">{event.kind}</span>
                    <GradeChip verdict={event.pass ? "pass" : "fail"}>
                      {event.pass ? "pass" : "fail"}
                      {event.repairs > 0 ? ` ·×${event.repairs}` : ""}
                    </GradeChip>
                  </p>
                </motion.div>
              ) : null,
            )}
          </AnimatePresence>
        )}

        {/* the finished pack */}
        {pack && (
          <motion.div
            initial={{ opacity: 0, y: reduced ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="space-y-3"
          >
            <div className="rounded-xl border border-ink/12 bg-ground p-4 shadow-keepsake">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-kicker text-[0.6rem] text-amethyst">{pack.studio} pack</p>
                  <p className="text-data mt-1.5 break-all text-ink/70">{pack.keepsakeId}</p>
                </div>
                {pack.seal && <SealMark size={56} className="shrink-0 text-amethyst/85" />}
              </div>
              <p className="mt-3 flex flex-wrap gap-1.5">
                <GradeChip verdict={pack.quality.passRate === 1 ? "pass" : "repair"}>
                  pass rate {Math.round(pack.quality.passRate * 100)}%
                </GradeChip>
                {pack.quality.repairedCount > 0 && (
                  <GradeChip verdict="repair">repairs {pack.quality.repairedCount}</GradeChip>
                )}
                {pack.seal && (
                  <GradeChip verdict={pack.seal.anchored ? "pass" : "info"}>
                    {pack.seal.anchored ? "anchored on X Layer" : "sealed · anchoring queued"}
                  </GradeChip>
                )}
              </p>
              {pack.coverageGaps.length > 0 && (
                <div className="mt-3 text-[0.72rem] leading-relaxed text-ink/60">
                  <p className="text-kicker text-[0.55rem] text-info">disclosed gaps</p>
                  <ul className="mt-1 space-y-0.5">
                    {/* headline only — the full text ships in the manifest */}
                    {pack.coverageGaps.map((gap, index) => (
                      <li key={gapKey(gap, index)} className="leading-relaxed">
                        · {gapLabel(gap)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {pack.artifacts.map((artifact, index) => (
              <motion.div
                key={artifact.id}
                initial={{ opacity: 0, y: reduced ? 0 : 18, scale: reduced ? 1 : 0.98, rotate: reduced ? 0 : index % 2 === 0 ? -0.5 : 0.5 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 27, delay: Math.min(index * 0.07, 0.42) }}
                className="rounded-xl border border-ink/10 bg-ground p-3.5"
              >
                {artifact.undelivered && (
                  <div className="mb-2.5 rounded-lg border border-dashed border-ink/15 bg-panel/50 p-3">
                    <p className="text-[0.82rem] leading-relaxed text-ink/70">
                      {artifact.undelivered.reason}
                    </p>
                  </div>
                )}
                {artifact.url && artifact.format === "png" && !artifact.undelivered && (
                  /* eslint-disable-next-line @next/next/no-img-element -- signed, expiring URL */
                  <img
                    src={artifact.url}
                    alt={artifact.title}
                    onError={(event) => {
                      // Never leave the browser's torn-page glyph on screen.
                      event.currentTarget.style.display = "none";
                    }}
                    className="mb-2.5 w-full rounded-lg border border-ink/10"
                  />
                )}
                <p className="text-[0.82rem] font-medium text-ink/85">{artifact.title}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-data text-ink/60">{artifact.kind}</span>
                  {artifact.undelivered ? (
                    <GradeChip verdict="fail">not delivered</GradeChip>
                  ) : (
                    artifact.tribunal && (
                      <GradeChip verdict={artifact.tribunal.pass ? "pass" : "fail"}>
                        {artifact.tribunal.pass ? "pass" : "fail"}
                        {artifact.tribunal.repairs > 0 ? ` ·×${artifact.tribunal.repairs}` : ""}
                      </GradeChip>
                    )
                  )}
                  {artifact.url && (
                    <a
                      href={artifact.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[0.72rem] font-medium text-amethyst underline decoration-amethyst/30 underline-offset-2"
                    >
                      open
                    </a>
                  )}
                </p>
              </motion.div>
            ))}

            <div className="space-y-2 pt-1">
              <a
                href={`/k/${pack.keepsakeId}`}
                className="glow-cta block rounded-full bg-ink px-5 py-2.5 text-center text-[0.85rem] font-medium text-ground shadow-lift transition-colors hover:bg-plum"
              >
                Open the public page
              </a>
              <a
                href={`https://api.occestra.xyz/k/${pack.keepsakeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-full border border-ink/20 px-5 py-2.5 text-center text-[0.85rem] font-medium text-ink transition-colors hover:border-ink/50 hover:bg-panel"
              >
                Download the manifest (JSON)
              </a>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function gapKey(gap: FinishedGap, index: number): string {
  return typeof gap === "string" ? `${gap.slice(0, 80)}-${index}` : `${gap.code}-${index}`;
}

function gapLabel(gap: FinishedGap): string {
  if (typeof gap !== "string") return `${gap.code} — ${gap.note}`;
  return gap.split("—")[0]?.split(":").slice(0, 2).join(":").trim() || gap;
}

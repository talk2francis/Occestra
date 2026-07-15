import { AxisChip } from "@/components/ui/axis-chip";
import { GradeChip } from "@/components/ui/grade-chip";
import type { PublicArtifact } from "@/lib/pack";

/**
 * The full report, honest: every axis score, every deterministic check that
 * actually applied, every issue the critic raised, every disclosed gap.
 */
export function TribunalReport({ artifacts }: { artifacts: PublicArtifact[] }) {
  return (
    <div className="space-y-4">
      {artifacts.map((artifact) => {
        const report = artifact.tribunal;
        if (!report) return null;
        const applied = report.deterministic.filter(
          (check) => !/^not a |^no /i.test(check.detail),
        );

        return (
          <details key={artifact.id} className="group rounded-2xl border border-ink/10 bg-ground">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
              <span className="flex items-center gap-3">
                <span className="text-data text-ink/70">{artifact.kind}</span>
                <GradeChip verdict={report.pass ? "pass" : "fail"}>
                  {report.pass ? "pass" : "fail"}
                  {report.repairs > 0 ? ` · repaired ×${report.repairs}` : ""}
                </GradeChip>
              </span>
              <span className="text-[0.75rem] text-ink/60 group-open:hidden">full report</span>
            </summary>

            <div className="space-y-4 border-t border-ink/10 p-4 sm:p-5">
              {report.axes && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(report.axes).map(([axis, score]) => (
                    <AxisChip key={axis} axis={axis} score={score} />
                  ))}
                </div>
              )}

              {applied.length > 0 && (
                <ul className="space-y-1.5">
                  {applied.map((check) => (
                    <li key={check.id} className="flex items-baseline gap-2 text-[0.8rem] text-ink/70">
                      <span
                        aria-hidden
                        className={`size-1.5 shrink-0 translate-y-[-1px] rounded-full ${check.passed ? "bg-pass" : "bg-fail"}`}
                      />
                      <span className="text-data text-ink/60">{check.id}</span>
                      {check.detail}
                    </li>
                  ))}
                </ul>
              )}

              {report.issues.length > 0 && (
                <div>
                  <p className="text-kicker text-[0.6rem] text-ink/60">The critic&apos;s notes</p>
                  <ul className="mt-2 space-y-1.5">
                    {report.issues.map((issue, index) => (
                      <li key={index} className="text-[0.82rem] leading-relaxed text-ink/65">
                        · {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.coverageGaps.length > 0 && (
                <p className="text-[0.78rem] leading-relaxed text-ink/60">
                  <span className="text-kicker text-[0.58rem] text-info">Disclosed gaps</span>
                  <span className="mt-1 block">{report.coverageGaps.join(" · ")}</span>
                </p>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

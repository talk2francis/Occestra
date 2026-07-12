/**
 * The GradePort adapter: the real Tribunal, handed to the pure pipelines in studio-core.
 *
 * studio-core cannot import @occestra/tribunal (that package depends on IT — a cycle — and
 * studio-core must stay pure). So this is where the two are joined: the pipeline asks for a
 * grade through a port, and this hands it the genuine article, repair loop and all.
 */
import type { Artifact, EngineDeps, GradePort, GradeRequest, GradeResult } from "@occestra/studio-core";
import { runTribunal } from "@occestra/tribunal";
import { HOUSE_STYLES } from "@occestra/providers";

/**
 * Real Tribunal moments, surfaced as they happen. Every event fires from an
 * actual execution point in the grade/repair loop — the Studio's live view
 * renders these; it never invents them.
 */
export type GraderEvent =
  | { type: "grading"; kind: string; title: string }
  | { type: "artifact_failed"; kind: string; title: string; repairBrief: string }
  | { type: "artifact_repaired"; kind: string; title: string; attempt: number }
  | {
      type: "graded";
      kind: string;
      title: string;
      pass: boolean;
      repairs: number;
      axes?: Record<string, number>;
      issues?: string[];
    };

export interface GraderConfig {
  deps: EngineDeps;
  linkChecker?: (url: string) => Promise<boolean>;
  policyAllowlist?: readonly string[];
  /** Fires at real grade/repair boundaries. Absent in production paid calls. */
  onEvent?: (event: GraderEvent) => void;
}

export function buildGrader(config: GraderConfig): GradePort {
  const { deps, onEvent } = config;

  return {
    async grade(request: GradeRequest): Promise<GradeResult> {
      const style = request.styleId ? HOUSE_STYLES[request.styleId] : undefined;
      const { kind, title } = request.artifact;

      onEvent?.({ type: "grading", kind, title });

      // Announce the repair loop at the exact moments the Tribunal drives it.
      let attempt = 0;
      const regenerate =
        request.regenerate && onEvent
          ? async (brief: string, previous: Artifact): Promise<Artifact> => {
              attempt += 1;
              onEvent({ type: "artifact_failed", kind, title, repairBrief: brief });
              const repaired = await request.regenerate!(brief, previous);
              onEvent({ type: "artifact_repaired", kind, title, attempt });
              return repaired;
            }
          : request.regenerate;

      const outcome = await runTribunal({
        artifact: request.artifact,
        contract: request.contract,
        ...(style ? { style } : {}),
        deps: {
          critique: deps.critique,
          imageBytes: async (artifact) =>
            artifact.uri ? (await deps.storage.get(artifact.uri))?.bytes : undefined,
          ...(config.linkChecker ? { linkChecker: config.linkChecker } : {}),
          ...(config.policyAllowlist ? { policyAllowlist: config.policyAllowlist } : {}),
        },
        ...(regenerate ? { regenerate } : {}),
      });

      onEvent?.({
        type: "graded",
        kind,
        title,
        pass: outcome.report.pass,
        repairs: outcome.report.repairs,
        ...(outcome.report.axes ? { axes: outcome.report.axes } : {}),
        issues: outcome.report.issues,
      });

      return {
        artifact: outcome.artifact,
        pass: outcome.report.pass,
        repairs: outcome.report.repairs,
        coverageGaps: outcome.report.coverageGaps,
      };
    },
  };
}

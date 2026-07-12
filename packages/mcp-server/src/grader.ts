/**
 * The GradePort adapter: the real Tribunal, handed to the pure pipelines in studio-core.
 *
 * studio-core cannot import @occestra/tribunal (that package depends on IT — a cycle — and
 * studio-core must stay pure). So this is where the two are joined: the pipeline asks for a
 * grade through a port, and this hands it the genuine article, repair loop and all.
 */
import type { EngineDeps, GradePort, GradeRequest, GradeResult } from "@occestra/studio-core";
import { runTribunal } from "@occestra/tribunal";
import { HOUSE_STYLES } from "@occestra/providers";

export interface GraderConfig {
  deps: EngineDeps;
  linkChecker?: (url: string) => Promise<boolean>;
  policyAllowlist?: readonly string[];
}

export function buildGrader(config: GraderConfig): GradePort {
  const { deps } = config;

  return {
    async grade(request: GradeRequest): Promise<GradeResult> {
      const style = request.styleId ? HOUSE_STYLES[request.styleId] : undefined;

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
        ...(request.regenerate ? { regenerate: request.regenerate } : {}),
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

import { randomUUID } from "node:crypto";
import type { Artifact, OccasionContract, Pack } from "@occestra/studio-core";
import { decideConsensusRepair, networkChainId, networkLabel, type FailureCode, type GenLayerConfig } from "@occestra/genlayer";
import type { PipelineContext } from "./pipelines.js";
import { prepareConsensusReview } from "./consensus.js";
import type { ConsensusReviewRow } from "./store.js";

function reviewContract(pack: Pack, artifact: Artifact): OccasionContract {
  const base = { id: pack.contractId, studio: pack.studio, styleId: artifact.styleId ?? "amethyst_editorial", createdAt: pack.createdAt, requester: "agent" as const };
  if (pack.studio === "launch") return { ...base, studio: "launch", productName: artifact.title, description: `Repair ${artifact.title}`, deliverables: [artifact.kind as never], locale: "en" };
  if (pack.studio === "remember") return { ...base, studio: "remember", title: artifact.title, tone: "faithful and restrained", mediaRefs: [], deliverables: [artifact.kind as never], locale: "en" };
  return { ...base, studio: "celebrate", occasion: artifact.title, city: "unspecified", date: pack.createdAt.slice(0, 10), headcount: 1, vibe: "faithful to the original", constraints: [], deliverables: [artifact.kind as never], locale: "en" };
}

/** Build, grade, freeze, and queue a new version. The sealed source pack is never rewritten. */
export function consensusRepairHandler(ctx: PipelineContext, config: GenLayerConfig) {
  return async (review: ConsensusReviewRow): Promise<void> => {
    if (!review.keepsakeId) return;
    const pack = ctx.store.getPack(review.keepsakeId);
    const original = pack?.artifacts.find((item) => item.id === review.artifactId);
    if (!pack || !original || original.undelivered) return;

    const policy = decideConsensusRepair({
      decision: "OVERTURNED",
      localVerdict: review.localVerdict as "PASS" | "FAIL",
      failureCodes: review.failureCodes as FailureCode[],
      ...(review.criticalFailure ? { criticalFailure: review.criticalFailure } : {}),
      consensusRepairs: ctx.store.consensusRepairCount(review.artifactId),
    });
    if (!policy.shouldRepair || !policy.repairBrief) return;

    let repaired: Artifact;
    if (original.format === "png" || original.format === "svg") {
      const generated = await ctx.deps.image.generate({
        prompt: `${original.title}\n\n${policy.repairBrief}\n\nCreate a clean final artifact. Do not add facts that are not present.`,
        size: original.spec?.size ?? "1024x1024",
        quality: "medium",
      });
      const uri = await ctx.store.storage.put(`consensus/${review.reviewId}-v2.png`, Buffer.from(generated.pngBase64, "base64"), "image/png");
      repaired = { ...original, format: "png", uri, data: undefined, tribunal: undefined };
    } else {
      const completion = await ctx.deps.text.complete({
        role: "writer",
        system: "Repair the supplied artifact exactly as instructed. Return only the complete replacement artifact, with no preamble.",
        prompt: `TITLE: ${original.title}\nFORMAT: ${original.format}\n\nREPAIR:\n${policy.repairBrief}\n\nORIGINAL:\n${original.data ?? ""}`,
        maxTokens: 4000,
        temperature: 0.2,
        producing: `consensus repair for ${original.title}`,
      });
      repaired = { ...original, data: completion.text, uri: undefined, tribunal: undefined };
    }

    const graded = ctx.grader
      ? (await ctx.grader.grade({ artifact: repaired, contract: reviewContract(pack, repaired), ...(repaired.styleId ? { styleId: repaired.styleId } : {}) })).artifact
      : repaired;
    const childId = `oce_gl_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const prepared = await prepareConsensusReview(ctx.store, {
      pack, artifact: graded, consented: true, reviewId: childId,
      network: networkLabel(config), ...(config.contractAddress ? { contractAddress: config.contractAddress } : {}),
    });
    ctx.store.createConsensusReview({
      reviewId: childId, artifactId: review.artifactId, keepsakeId: review.keepsakeId,
      artifactHash: prepared.snapshot.artifactHash, profile: prepared.snapshot.profile,
      oqsVersion: prepared.snapshot.oqsVersion, localVerdict: prepared.snapshot.localVerdict,
      evidenceJson: prepared.evidenceJson, evidenceHash: prepared.evidenceHash,
      network: networkLabel(config), chainId: networkChainId(config),
      ...(config.contractAddress ? { contractAddress: config.contractAddress } : {}),
      artifactVersion: (review.artifactVersion ?? 1) + 1, repairedFrom: review.reviewId,
    } as Parameters<typeof ctx.store.createConsensusReview>[0]);
    ctx.store.audit("consensus_overturn_repaired", { packId: review.keepsakeId, detail: `from:${review.reviewId}; follow_up:${childId}` });
  };
}

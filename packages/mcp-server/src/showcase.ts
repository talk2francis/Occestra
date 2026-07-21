/**
 * Owner-approved Gallery publishing.
 *
 * Celebrate and Launch packs are already unlisted/shareable, so publishing adds a curated
 * Gallery card without changing their /k page. Remember packs are genuinely private: publishing
 * creates a NEW public snapshot containing only the artifacts the owner selected. The salted
 * original, its id, sources and title never cross this boundary.
 */
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  newKeepsakeId,
  type Artifact,
  type Pack,
} from "@occestra/studio-core";
import { leafOfSeal } from "@occestra/receipts";
import { recoveryHash, type DemoContext } from "./demo.js";

const PublishBody = z.object({
  runId: z.string().regex(/^demo_[A-Za-z0-9_-]{16,100}$/),
  recoveryToken: z.string().min(32).max(256),
  displayTitle: z.string().trim().min(3).max(100),
  coverArtifactId: z.string().min(1).max(120).optional(),
  artifactIds: z.array(z.string().min(1).max(120)).min(1).max(20),
  consent: z.literal(true),
});

const safeArtifactTitle = (displayTitle: string, artifact: Artifact, index: number): string => {
  if (index === 0) return displayTitle;
  const label = artifact.kind.replaceAll("_", " ");
  return `${displayTitle} — ${label}`;
};

function privateTitleCandidates(source: Pack): string[] {
  const values = new Set<string>();
  for (const artifact of source.artifacts) {
    const title = artifact.title.trim();
    if (title.length >= 3) values.add(title);
    for (const separator of [" — ", " – ", ": "]) {
      const prefix = title.split(separator)[0]?.trim();
      if (prefix && prefix.length >= 3) values.add(prefix);
    }
  }
  // Replace the most specific strings first so a short subject cannot leave fragments of a
  // longer private artifact title behind.
  return [...values].sort((a, b) => b.length - a.length);
}

function redactPrivateTitles(value: unknown, candidates: string[], replacement: string): unknown {
  if (typeof value === "string") {
    return candidates.reduce((text, candidate) => text.replaceAll(candidate, replacement), value);
  }
  if (Array.isArray(value)) return value.map((item) => redactPrivateTitles(item, candidates, replacement));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactPrivateTitles(item, candidates, replacement)]),
    );
  }
  return value;
}

async function publicSnapshot(ctx: DemoContext, source: Pack, title: string, ids: string[]): Promise<Pack> {
  const chosen = ids.map((id) => source.artifacts.find((artifact) => artifact.id === id));
  if (chosen.some((artifact) => !artifact || artifact.undelivered)) {
    throw new Error("selected artifacts must exist and have been delivered");
  }

  const id = newKeepsakeId(ctx.deps.clock.now());
  const privateTitles = privateTitleCandidates(source);
  const artifacts: Artifact[] = [];
  for (const [index, sourceArtifact] of (chosen as Artifact[]).entries()) {
    let uri = sourceArtifact.uri;
    if (sourceArtifact.uri) {
      const stored = await ctx.deps.storage.get(sourceArtifact.uri);
      if (!stored) throw new Error(`selected artifact ${sourceArtifact.id} is no longer readable`);
      const extension = sourceArtifact.format === "svg" ? "svg" : "png";
      uri = `showcases/${id}/${sourceArtifact.id}.${extension}`;
      await ctx.deps.storage.put(uri, stored.bytes, stored.contentType);
    }
    const publicArtifact = redactPrivateTitles(sourceArtifact, privateTitles, title) as Artifact;
    artifacts.push({
      ...publicArtifact,
      title: safeArtifactTitle(title, sourceArtifact, index),
      // A private source can contain upload handles or owner-established references. The
      // selected work is public; its private provenance trail is not.
      sources: [],
      ...(uri ? { uri } : {}),
    });
  }

  const graded = artifacts.filter((artifact) => artifact.tribunal);
  const passed = graded.filter((artifact) => (artifact.tribunal as { pass?: boolean }).pass).length;
  const repairedCount = graded.reduce(
    (sum, artifact) => sum + Number((artifact.tribunal as { repairs?: number }).repairs ?? 0),
    0,
  );
  const snapshot: Pack = {
    id,
    // The source pack id is itself a private capability. Keep the relationship only in the
    // server-side gallery_submissions table; it must never enter this public manifest.
    contractId: `showcase:${id}`,
    studio: "remember",
    artifacts,
    coverageGaps: [],
    quality: {
      oqsVersion: source.quality.oqsVersion,
      passRate: graded.length > 0 ? passed / graded.length : 1,
      repairedCount,
      undeliveredCount: 0,
    },
    createdAt: new Date(ctx.deps.clock.now()).toISOString(),
  };

  if (!ctx.sealer) {
    ctx.store.savePack(snapshot);
    return snapshot;
  }
  // Deliberately UNSALTED: this is a new owner-approved PUBLIC snapshot. The private source
  // remains salted and unchanged under its original id.
  const sealed = await ctx.sealer.seal(snapshot, "remember");
  if (sealed.seal) ctx.store.queueSeal(leafOfSeal(sealed.seal), sealed.id);
  ctx.store.savePack(sealed);
  return sealed;
}

export async function handleGalleryPublish(ctx: DemoContext, req: Request, res: Response): Promise<void> {
  if (!ctx.demoSecret || req.get("x-oce-demo-secret") !== ctx.demoSecret) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const parsed = PublishBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid Gallery submission", detail: parsed.error.issues[0]?.message });
    return;
  }

  const input = parsed.data;
  const run = ctx.store.recoverDemoRun(input.runId, recoveryHash(input.recoveryToken));
  if (!run || run.state !== "done" || !run.packId) {
    res.status(404).json({ error: "no completed Studio run for that capability" });
    return;
  }
  if (ctx.store.gallerySubmissionForSource(run.packId)) {
    res.status(409).json({ error: "this pack has already been submitted to the Gallery" });
    return;
  }
  const source = ctx.store.getPack(run.packId);
  if (!source) {
    res.status(404).json({ error: "the completed pack is no longer available" });
    return;
  }

  const selected = [...new Set(input.artifactIds)];
  const deliveredIds = new Set(source.artifacts.filter((artifact) => !artifact.undelivered).map((artifact) => artifact.id));
  if (selected.some((id) => !deliveredIds.has(id))) {
    res.status(400).json({ error: "only delivered artifacts from this pack can be published" });
    return;
  }
  if (input.coverArtifactId) {
    const cover = source.artifacts.find((artifact) => artifact.id === input.coverArtifactId);
    if (!cover || !selected.includes(cover.id) || cover.format !== "png" || !cover.uri || cover.undelivered) {
      res.status(400).json({ error: "the cover must be a selected, delivered image" });
      return;
    }
  }

  try {
    const publishedPack = ctx.store.isPrivate(source.id)
      ? await publicSnapshot(ctx, source, input.displayTitle, selected)
      : source;
    const managementToken = randomBytes(32).toString("base64url");
    ctx.store.saveGallerySubmission({
      packId: publishedPack.id,
      sourcePackId: source.id,
      studio: source.studio,
      displayTitle: input.displayTitle,
      ...(input.coverArtifactId ? { coverArtifactId: input.coverArtifactId } : {}),
      visibleArtifactIds: selected,
      managementToken,
    });
    ctx.store.audit("gallery_published", {
      packId: publishedPack.id,
      actor: ctx.store.actorHash(input.recoveryToken),
      detail: source.id === publishedPack.id ? "unlisted pack submitted" : "private pack public snapshot",
    });
    res.status(201).json({
      published: true,
      packId: publishedPack.id,
      publicPage: `${ctx.publicBaseUrl}/k/${publishedPack.id}`,
      managementToken,
      originalRemainsPrivate: source.id !== publishedPack.id,
    });
  } catch (error) {
    console.error(`[occestra] Gallery publish failed for run ${run.id}`, error);
    res.status(500).json({ error: "the public showcase could not be created; the original pack is unchanged" });
  }
}

export function handleGalleryWithdraw(ctx: DemoContext, req: Request, res: Response): void {
  if (!ctx.demoSecret || req.get("x-oce-demo-secret") !== ctx.demoSecret) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const rawPackId = req.params["id"];
  const packId = typeof rawPackId === "string" ? rawPackId : undefined;
  const managementToken = req.get("x-oce-gallery-token");
  if (!packId || !managementToken || !ctx.store.withdrawGallerySubmission(packId, managementToken)) {
    res.status(404).json({ error: "no manageable Gallery submission" });
    return;
  }
  ctx.store.audit("gallery_withdrawn", {
    packId,
    actor: ctx.store.actorHash(managementToken),
  });
  res.json({ withdrawn: true, packId, note: "Removed from Gallery. Any public showcase link remains valid." });
}

/**
 * What happens when the studio cannot deliver.
 *
 * The bug this exists to kill: when an image provider failed (quota, safety refusal,
 * a timeout), the artifact was quietly dropped from the pack and only a coverage gap
 * was left behind. The pass rate is `passed / delivered`, so dropping the failures
 * SHRANK THE DENOMINATOR — a launch kit that produced one of four images could still
 * report passRate 1.0. The pack looked perfect precisely because it was thin.
 *
 * So a failed artifact now STAYS in the pack, marked `undelivered`. It is never
 * graded (grading something that does not exist is meaningless), never counted on
 * either side of the pass rate, counted separately in `quality.undeliveredCount`,
 * and rendered as an honest "not delivered" card.
 *
 * The raw provider error goes to the server log and nowhere else. What ships is a
 * stable code and one sentence a buyer can act on.
 */
import type {
  Artifact,
  ArtifactFormat,
  ArtifactKind,
  ImageQuality,
  StoragePort,
  Undelivered,
} from "../types.js";

/**
 * What each image is worth paying for.
 *
 * The provider's top tier costs ~4x its middle tier, and we were buying it for every
 * image — including moodboard tiles the buyer sees at thumbnail size, and repair drafts
 * that get thrown away on the next pass. Top tier is now reserved for the pieces a
 * person actually keeps and looks at closely.
 *
 * A REPAIR is always medium, whatever the kind: it is a draft being iterated, and the
 * Tribunal may reject it again. Paying hero rates for an attempt is how a two-repair
 * artifact ends up costing three times its own price.
 */
const KEEPSAKE_GRADE: ReadonlySet<string> = new Set<ArtifactKind>([
  "og_image", // the launch hero — the one image that gets shared
  "keepsake_art", // the thing someone frames
  "invitation", // the thing someone is sent
]);

export function imageQualityFor(
  kind: ArtifactKind,
  options: { repair?: boolean } = {},
): ImageQuality {
  if (options.repair) return "medium";
  return KEEPSAKE_GRADE.has(kind) ? "high" : "medium";
}

/** Stable, public failure codes. Never renamed — /k pages and clients key off these. */
export const UNDELIVERED_CODES = {
  quota: "image_provider:quota",
  refused: "image_provider:refused",
  timeout: "image_provider:timeout",
  cap: "image_provider:daily_cap",
  unwritable: "image_provider:unwritable",
  failed: "image_provider:failed",
} as const;

const REASONS: Record<string, string> = {
  [UNDELIVERED_CODES.quota]:
    "The image provider was out of quota, so this piece was not made. The rest of the pack was delivered.",
  [UNDELIVERED_CODES.refused]:
    "The image provider declined this subject. Nothing was substituted in its place.",
  [UNDELIVERED_CODES.timeout]:
    "The image provider did not answer in time, so this piece was not made.",
  [UNDELIVERED_CODES.cap]:
    "This run reached its daily image budget, so this piece was not made.",
  [UNDELIVERED_CODES.unwritable]:
    "The image was generated but could not be stored, so it is not being shown as delivered.",
  [UNDELIVERED_CODES.failed]:
    "The image could not be produced. Rather than show you a broken picture, it is marked undelivered.",
};

/**
 * Turn a provider error into a public code + sentence.
 *
 * Deliberately coarse. A buyer needs to know whether to retry, pay again, or change
 * the brief — not which HTTP status a vendor chose.
 */
export function classifyImageFailure(error: unknown): Undelivered {
  const raw = (error instanceof Error ? error.message : String(error)).toLowerCase();

  const code =
    /quota|billing|insufficient_quota|credit|exceeded your current/.test(raw)
      ? UNDELIVERED_CODES.quota
      : /safety|content_policy|moderation|rejected|declin/.test(raw)
        ? UNDELIVERED_CODES.refused
        : /timeout|timed out|etimedout|abort/.test(raw)
          ? UNDELIVERED_CODES.timeout
          : /daily image cap|cap exceeded|dailyimagecap/.test(raw)
            ? UNDELIVERED_CODES.cap
            : /enospc|eacces|write|storage/.test(raw)
              ? UNDELIVERED_CODES.unwritable
              : UNDELIVERED_CODES.failed;

  return { code, reason: REASONS[code] ?? REASONS[UNDELIVERED_CODES.failed]! };
}

/** The artifact that says, plainly, "this is missing and here is why". */
export function undeliveredArtifact(
  base: { id: string; kind: ArtifactKind; title: string; format: ArtifactFormat },
  undelivered: Undelivered,
): Artifact {
  return { ...base, sources: [], version: 1, undelivered };
}

/**
 * Bytes are only delivered once they are READABLE BACK.
 *
 * A `put` that resolves is not proof: the disk can be full, the key can be wrong.
 * Every image is read back before we are willing to call it delivered.
 */
export async function ensureStored(storage: StoragePort, key: string): Promise<void> {
  const stored = await storage.get(key);
  if (!stored || stored.bytes.length === 0) {
    throw new Error(`storage write did not stick for ${key} — bytes are not readable back`);
  }
}

export const isUndelivered = (artifact: Artifact): boolean => Boolean(artifact.undelivered);

/**
 * The pass rate, computed honestly.
 *
 * Denominator = artifacts we actually delivered AND graded. Undelivered work is not
 * a pass and not a fail — it is absent, and it is reported as absent.
 */
export function qualityOf(args: {
  artifacts: Artifact[];
  passed: number;
  graded: number;
  repairs: number;
  oqsVersion: string;
  graderWired: boolean;
}): {
  oqsVersion: string;
  passRate: number;
  repairedCount: number;
  undeliveredCount: number;
} {
  const undeliveredCount = args.artifacts.filter(isUndelivered).length;
  return {
    oqsVersion: args.oqsVersion,
    passRate: args.graderWired && args.graded > 0 ? args.passed / args.graded : 0,
    repairedCount: args.repairs,
    undeliveredCount,
  };
}

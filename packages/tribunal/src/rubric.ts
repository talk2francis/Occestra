/**
 * The Occestra Quality Standard (OQS).
 *
 * These constants are the ONLY definition of the standard. The public /standard page and
 * the docs site are generated from rubricAsJson()/rubricAsMarkdown() — so what we publish
 * is, by construction, exactly what the engine runs. If you change a threshold here, the
 * published rubric changes with it. That equality is the whole credibility claim.
 */
import type { CritiqueAxis } from "@occestra/studio-core";

export const OQS_VERSION = "1.0.0";

/** Every axis must clear this for an artifact to pass. */
export const AXIS_PASS_THRESHOLD = 70;

/** Hard cap on regeneration attempts. Reports ship pass or fail — we never loop forever. */
export const MAX_REPAIRS = 2;

export interface AxisSpec {
  id: CritiqueAxis;
  title: string;
  description: string;
  threshold: number;
}

export const AXES: readonly AxisSpec[] = [
  {
    id: "composition",
    title: "Composition",
    description:
      "Deliberate structure and hierarchy. Focal point, balance, and breathing room — not a centred blob or a wall of undifferentiated text.",
    threshold: AXIS_PASS_THRESHOLD,
  },
  {
    id: "legibility",
    title: "Legibility",
    description:
      "Every word readable at its intended size, on its intended surface. Type sits on adequate contrast and is never crushed, clipped, or overflowing.",
    threshold: AXIS_PASS_THRESHOLD,
  },
  {
    id: "style_fidelity",
    title: "Style fidelity",
    description:
      "Faithful to the requested House Style — its palette, its type direction, its material and texture language. Not a generic default rendering.",
    threshold: AXIS_PASS_THRESHOLD,
  },
  {
    id: "grounding",
    title: "Grounding",
    description:
      "Every factual claim is real, sourced, and timestamped. Nothing invented; nothing overclaimed; uncertainty stated plainly rather than smoothed over.",
    threshold: AXIS_PASS_THRESHOLD,
  },
  {
    id: "platform_fit",
    title: "Platform fit",
    description:
      "Correct for where it will actually live — dimensions, aspect, length, and tone appropriate to the medium and the audience.",
    threshold: AXIS_PASS_THRESHOLD,
  },
] as const;

export type CheckId =
  | "SCHEMA_INVALID"
  | "POLICY_VIOLATION"
  | "SOURCE_MISSING"
  | "BUDGET_SUM_MISMATCH"
  | "SCHEDULE_OVERLAP"
  | "DATE_INVALID"
  | "DIM_ASPECT_MISMATCH"
  | "CONTRAST_LOW"
  | "PALETTE_DRIFT"
  | "LINK_DEAD"
  | "TEXT_OVERFLOW_RISK"
  | "FILE_TOO_LARGE";

export interface CheckSpec {
  id: CheckId;
  /** What the check runs against, in human words. */
  scope: string;
  /** Hard failures force pass:false no matter how good the axes are. */
  hard: boolean;
  description: string;
}

export const CHECKS: readonly CheckSpec[] = [
  {
    id: "SCHEMA_INVALID",
    scope: "all",
    hard: true,
    description: "The artifact does not satisfy its own published schema.",
  },
  {
    id: "POLICY_VIOLATION",
    scope: "all",
    hard: true,
    description:
      "Final copy re-screened by the PolicyGate: third-party IP, real-person likeness, or unsafe content.",
  },
  {
    id: "SOURCE_MISSING",
    scope: "grounded claims in plans",
    hard: true,
    description:
      "A factual claim (venue, hours, weather, price) ships without a source and a retrieval timestamp.",
  },
  {
    id: "BUDGET_SUM_MISMATCH",
    scope: "budget",
    hard: true,
    description: "Line items do not sum to the stated total (tolerance $0.01).",
  },
  {
    id: "SCHEDULE_OVERLAP",
    scope: "schedule",
    hard: true,
    description:
      "Two schedule items overlap in time, or two venues are separated by an impossible gap (under 5 minutes to travel).",
  },
  {
    id: "DATE_INVALID",
    scope: "plan",
    hard: true,
    description: "A date is not a real calendar date, or contradicts the occasion date.",
  },
  {
    id: "DIM_ASPECT_MISMATCH",
    scope: "images",
    hard: true,
    description: "Rendered pixel dimensions do not match the dimensions the artifact was specified at.",
  },
  {
    id: "CONTRAST_LOW",
    scope: "invites/cards",
    hard: false,
    description: "Body text falls below a 4.5:1 WCAG contrast ratio against its background.",
  },
  {
    id: "PALETTE_DRIFT",
    scope: "images",
    hard: false,
    description: "Dominant colours drift away from the declared House Style palette.",
  },
  {
    id: "LINK_DEAD",
    scope: "launch kit",
    hard: false,
    description: "A referenced link does not resolve.",
  },
  {
    id: "TEXT_OVERFLOW_RISK",
    scope: "invites/cards",
    hard: false,
    description: "Copy is long enough to overflow or crush its layout slot.",
  },
  {
    id: "FILE_TOO_LARGE",
    scope: "images",
    hard: false,
    description: "A PNG exceeds 4 MB, which is too heavy to share comfortably.",
  },
] as const;

export const CHECK_BY_ID: Readonly<Record<CheckId, CheckSpec>> = Object.freeze(
  Object.fromEntries(CHECKS.map((check) => [check.id, check])) as Record<CheckId, CheckSpec>,
);

/** Thresholds the deterministic checks enforce. Published so they can be audited. */
export const THRESHOLDS = {
  budgetToleranceUsd: 0.01,
  minTravelGapMinutes: 5,
  minContrastRatio: 4.5,
  /** Mean CIE76 distance from the House Style palette above which an image has drifted. */
  maxPaletteDistance: 70,
  maxPngBytes: 4 * 1024 * 1024,
  /** Max characters per artifact kind before a layout is at risk of overflowing. */
  textBudgets: {
    invitation: 420,
    guest_guide: 3000,
    toast: 1200,
    carousel: 1800,
    launch_thread: 2400,
    story_page: 6000,
    og_image: 120,
  },
} as const;

/** The pass rule, in one place. Every axis clears its threshold AND no hard check failed. */
export function passes(
  axes: Record<CritiqueAxis, number> | undefined,
  hardFailures: number,
): boolean {
  if (hardFailures > 0) return false;
  if (!axes) return true; // critique unavailable: deterministic-only verdict, noted in the report
  return AXES.every((axis) => (axes[axis.id] ?? 0) >= axis.threshold);
}

export interface RubricJson {
  oqsVersion: string;
  passRule: string;
  maxRepairs: number;
  axes: readonly AxisSpec[];
  checks: readonly CheckSpec[];
  thresholds: typeof THRESHOLDS;
}

export function rubricAsJson(): RubricJson {
  return {
    oqsVersion: OQS_VERSION,
    passRule: `Every axis scores >= ${AXIS_PASS_THRESHOLD} of 100, AND zero hard deterministic checks fail.`,
    maxRepairs: MAX_REPAIRS,
    axes: AXES,
    checks: CHECKS,
    thresholds: THRESHOLDS,
  };
}

export function rubricAsMarkdown(): string {
  const lines: string[] = [];
  lines.push(`# Occestra Quality Standard (OQS) v${OQS_VERSION}`);
  lines.push("");
  lines.push(
    "Every artifact Occestra produces is graded against this rubric before it ships. The rubric below is generated from the same constants the grading engine runs, so what is published here is exactly what is enforced.",
  );
  lines.push("");
  lines.push("## Pass rule");
  lines.push("");
  lines.push(
    `An artifact passes when **every axis scores at least ${AXIS_PASS_THRESHOLD}/100** and **no hard check fails**. On failure the Tribunal writes a concrete repair brief and the artifact is regenerated — at most **${MAX_REPAIRS} repair passes**. The full report ships inside the pack either way, pass or fail.`,
  );
  lines.push("");
  lines.push("## Scored axes");
  lines.push("");
  lines.push("| Axis | Threshold | What it measures |");
  lines.push("| --- | --- | --- |");
  for (const axis of AXES) {
    lines.push(`| **${axis.title}** | ${axis.threshold}/100 | ${axis.description} |`);
  }
  lines.push("");
  lines.push("## Deterministic checks");
  lines.push("");
  lines.push(
    "These run first, on every artifact, every time — they are cheap, they never hallucinate, and a hard failure cannot be argued away by a good score.",
  );
  lines.push("");
  lines.push("| Check | Applies to | Severity | Description |");
  lines.push("| --- | --- | --- | --- |");
  for (const check of CHECKS) {
    lines.push(
      `| \`${check.id}\` | ${check.scope} | ${check.hard ? "**hard**" : "soft"} | ${check.description} |`,
    );
  }
  lines.push("");
  lines.push("## Thresholds");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(THRESHOLDS, null, 2));
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

/**
 * The Occestra Quality Standard (OQS).
 *
 * These constants are the ONLY definition of the standard. The public /standard page and the
 * docs site are generated from rubricAsJson()/rubricAsMarkdown() — so what we publish is, by
 * construction, exactly what the engine runs. That equality is the whole credibility claim.
 *
 * OQS 1.2 introduces PROFILES. Grading everything on the same five axes was a category error,
 * and it shipped a real defect: a map rendered in a brand-mark style PASSED, because none of the
 * five axes asked "is the content what the brief commissioned?" An invitation is not judged like
 * a budget, and a budget is not judged like a toast. So each artifact is now graded on the axes
 * that mean something for what it IS — and the visual profile carries `subject_fidelity`, the
 * axis the map incident needed.
 */
import type {
  ArtifactKind,
  CritiqueAxis,
  CritiqueAxisSpec,
  CritiqueProfile,
  AxisClass,
} from "@occestra/studio-core";

export const OQS_VERSION = "1.2.0";

/** Every axis must clear this for an artifact to pass. */
export const AXIS_PASS_THRESHOLD = 70;

/** Hard cap on regeneration attempts. Reports ship pass or fail — we never loop forever. */
export const MAX_REPAIRS = 2;

export type { AxisClass, CritiqueAxisSpec as AxisSpec };

const t = AXIS_PASS_THRESHOLD;

/* ------------------------------------------------------------------ axes ---
 *
 * Defined once, reused across profiles where they genuinely mean the same thing (platform_fit
 * is platform_fit whether the artifact is an image or a thread). The `guidance` is the scoring
 * anchor the critic reads — it is what keeps the judge a measuring instrument rather than a
 * taste, and it is published, so a buyer reads the same anchors the model does.
 */

const AXIS: Record<CritiqueAxis, CritiqueAxisSpec> = {
  // --- visual ---
  composition: {
    id: "composition",
    class: "craft",
    title: "Composition",
    threshold: t,
    description: "Deliberate structure and hierarchy — a focal point, balance, breathing room; not a centred blob.",
    guidance: "85+ a clear focal point and deliberate ordering. 70 a reader finds what matters without hunting. 50 flat or centred. 30 actively disordered.",
  },
  legibility: {
    id: "legibility",
    class: "correctness",
    title: "Legibility",
    threshold: t,
    description: "Any text present is readable at its intended size and contrast; nothing crushed, clipped, or ambiguous.",
    guidance: "Occestra images carry NO lettering by design — type is set separately. Absent copy is CORRECT: score 70 and say the axis does not apply. Only fail if text that IS present is unreadable, and quote it.",
  },
  style_fidelity: {
    id: "style_fidelity",
    class: "craft",
    title: "Style fidelity",
    threshold: t,
    description: "Unmistakably the requested House Style — its palette, type direction, and material language.",
    guidance: "85+ unmistakably this House Style. 70 recognisably in it with minor drift. 40 generic AI-default, however pretty.",
  },
  subject_fidelity: {
    id: "subject_fidelity",
    class: "correctness",
    title: "Subject fidelity",
    threshold: t,
    description: "The artifact DEPICTS what the brief commissioned, independent of style. The right subject, rendered in the House Style — not the House Style rendering the wrong subject.",
    guidance:
      "Ask ONE question, ignoring how good it looks: is this a picture of the thing that was asked for? A brand mark for a software product that renders as a map, a compass, or a ledger FAILS — that is the House Style's motif substituted for the subject. 85+ the subject is unmistakable and correct. 70 the subject is present and recognisable. <70 ONLY IF you can name what it depicts instead of what was asked; quote the mismatch.",
  },
  platform_fit: {
    id: "platform_fit",
    class: "craft",
    title: "Platform fit",
    threshold: t,
    description: "Right for where it will live — dimensions, aspect, length, tone appropriate to the medium and audience.",
    guidance: "85+ exactly right for the medium. 70 usable without rework. 50 wrong shape, length, or register.",
  },
  defects: {
    id: "defects",
    class: "correctness",
    title: "Defects",
    threshold: t,
    description: "Free of rendering defects — no warped anatomy, no melted or duplicated elements, no garbled pseudo-lettering.",
    guidance: "85+ clean. 70 minor, forgivable imperfection. <70 ONLY IF you can point to the specific defect — a sixth finger, a smeared face, gibberish text-like marks. Quote where it is.",
  },
  // --- written ---
  voice: {
    id: "voice",
    class: "craft",
    title: "Voice",
    threshold: t,
    description: "The right register for the moment and audience — human, intentional, never boilerplate.",
    guidance: "85+ a distinct, apt voice. 70 appropriate and clean. 50 generic or off-register.",
  },
  specificity: {
    id: "specificity",
    class: "craft",
    title: "Specificity",
    threshold: t,
    description: "Concrete and earned. Every sentence carries information a reader could not have guessed.",
    guidance:
      "THE SUBSTITUTION TEST: could this sentence be pasted, unchanged, into copy about a completely different subject? If yes it is filler and it fails. 'Elevate your special occasion' scores below 45. A polished sentence that says nothing is worse than a rough one that says something.",
  },
  factual_support: {
    id: "factual_support",
    class: "correctness",
    title: "Factual support",
    threshold: t,
    description: "Every factual claim is true, and nothing is asserted with more certainty than the text has earned.",
    guidance:
      "It is not a measure of how thorough the text FEELS. Honesty about a gap IS support: 'nothing here is booked' is grounded, not a deduction. <70 ONLY IF you can quote a claim that is invented, unsourced, or overclaimed.",
  },
  structure: {
    id: "structure",
    class: "craft",
    title: "Structure",
    threshold: t,
    description: "A clear shape — an entry point, ordered parts, a landing. Not one undifferentiated run of text.",
    guidance: "85+ a reader is guided through it. 70 navigable. 50 a wall of text with no hierarchy.",
  },
  // --- plan ---
  source_coverage: {
    id: "source_coverage",
    class: "correctness",
    title: "Source coverage",
    threshold: t,
    description: "Every grounded claim — venue, hours, weather, price — carries a real source and a retrieval time.",
    guidance: "The deterministic SOURCE_MISSING check is the hard floor. This axis judges breadth: are the claims that COULD be sourced actually sourced? <70 only if you can name a sourceable claim left bare.",
  },
  date_validity: {
    id: "date_validity",
    class: "correctness",
    title: "Date validity",
    threshold: t,
    description: "Every date is a real calendar date, consistent with the occasion and with the other artifacts.",
    guidance: "DATE_INVALID is the hard floor. <70 only if you can quote a date that is impossible or contradicts the brief.",
  },
  schedule_feasibility: {
    id: "schedule_feasibility",
    class: "correctness",
    title: "Schedule feasibility",
    threshold: t,
    description: "The running order is physically possible — no overlaps, no impossible travel between venues.",
    guidance: "SCHEDULE_OVERLAP is the hard floor. <70 only if you can quote two items that cannot both happen as timed.",
  },
  budget_consistency: {
    id: "budget_consistency",
    class: "correctness",
    title: "Budget consistency",
    threshold: t,
    description: "Line items sum to the total, the currency fits the place, and per-head figures are sane.",
    guidance: "BUDGET_SUM_MISMATCH is the hard floor. <70 only if you can quote a figure that is wrong or a currency that does not belong.",
  },
  contingency: {
    id: "contingency",
    class: "craft",
    title: "Contingency",
    threshold: t,
    description: "Real fallbacks keyed to the actual forecast and constraints — not a generic 'have a backup plan'.",
    guidance: "85+ specific, forecast-aware fallbacks. 70 present and usable. 50 vague or boilerplate. This is craft: judge it, do not demand a citation.",
  },
  uncertainty_disclosure: {
    id: "uncertainty_disclosure",
    class: "correctness",
    title: "Uncertainty disclosure",
    threshold: t,
    description: "What is not known is stated plainly. Nothing is presented as booked, confirmed, or certain when it is not.",
    guidance: "A plan that says 'this is not booked' is doing this RIGHT. <70 only if you can quote something asserted as settled that is not.",
  },
  // --- pack ---
  completeness: {
    id: "completeness",
    class: "correctness",
    title: "Completeness",
    threshold: t,
    description: "Every deliverable the brief asked for was produced and delivered — nothing silently dropped.",
    guidance: "Computed, not judged: the fraction of requested deliverables that shipped as real artifacts (not undelivered stubs).",
  },
  cross_artifact_consistency: {
    id: "cross_artifact_consistency",
    class: "correctness",
    title: "Cross-artifact consistency",
    threshold: t,
    description: "The artifacts agree with each other — the same date, city, and names throughout the pack.",
    guidance: "Computed, not judged: the artifacts are checked for contradicting each other on the facts of the occasion.",
  },
  brief_satisfaction: {
    id: "brief_satisfaction",
    class: "craft",
    title: "Brief satisfaction",
    threshold: t,
    description: "The pack, as a whole, is a good answer to what was asked — not just a set of individually-passing parts.",
    guidance: "Computed from the per-artifact verdicts: the fraction of delivered artifacts that passed their own profile.",
  },
};

/* -------------------------------------------------------------- profiles ---*/

export type ProfileId = "visual" | "written" | "plan" | "pack";

export interface Profile extends CritiqueProfile {
  id: ProfileId;
  title: string;
  description: string;
  axes: readonly CritiqueAxisSpec[];
}

const profile = (id: ProfileId, title: string, description: string, ids: CritiqueAxis[]): Profile => ({
  id,
  title,
  description,
  axes: ids.map((axisId) => AXIS[axisId]),
});

export const PROFILES: Readonly<Record<ProfileId, Profile>> = Object.freeze({
  visual: profile("visual", "Visual", "Images: invitations, keepsakes, heroes, marks, moodboards.", [
    "composition",
    "legibility",
    "style_fidelity",
    "subject_fidelity",
    "platform_fit",
    "defects",
  ]),
  written: profile("written", "Written", "Copy and documents: toasts, threads, story pages, landing specs.", [
    "voice",
    "specificity",
    "factual_support",
    "structure",
    "platform_fit",
  ]),
  plan: profile("plan", "Plan", "Grounded, structured occasion work: plans, schedules, budgets, guides.", [
    "source_coverage",
    "date_validity",
    "schedule_feasibility",
    "budget_consistency",
    "contingency",
    "uncertainty_disclosure",
  ]),
  pack: profile("pack", "Pack", "The whole delivery, graded once — computed, not model-judged.", [
    "completeness",
    "cross_artifact_consistency",
    "brief_satisfaction",
  ]),
});

/** Which artifact kinds are graded as a PLAN rather than as prose. */
const PLAN_KINDS = new Set<ArtifactKind>(["plan", "schedule", "budget", "contingency", "guest_guide"]);

const VISUAL_FORMATS = new Set(["png", "svg"]);

/**
 * The profile an artifact is graded under.
 *
 * Format decides first: anything rendered as an image is visual, whatever its kind — this is
 * what routes the invitation's PNG plate to the visual profile and its markdown copy to the
 * written one, though both are kind "invitation". Then the plan family, then prose by default.
 */
export function profileFor(kind: ArtifactKind, format: string): Profile {
  if (VISUAL_FORMATS.has(format)) return PROFILES.visual;
  if (PLAN_KINDS.has(kind)) return PROFILES.plan;
  return PROFILES.written;
}

/* --------------------------------------------------------- deterministic ---*/

export type CheckId =
  | "SCHEMA_INVALID"
  | "POLICY_VIOLATION"
  | "SOURCE_MISSING"
  | "BUDGET_SUM_MISMATCH"
  | "SCHEDULE_OVERLAP"
  | "DATE_INVALID"
  | "DIM_ASPECT_MISMATCH"
  | "PLACEHOLDER_TEXT"
  | "CONTRAST_LOW"
  | "PALETTE_DRIFT"
  | "LINK_DEAD"
  | "TEXT_OVERFLOW_RISK"
  | "FILE_TOO_LARGE";

export interface CheckSpec {
  id: CheckId;
  scope: string;
  hard: boolean;
  description: string;
}

export const CHECKS: readonly CheckSpec[] = [
  { id: "SCHEMA_INVALID", scope: "all", hard: true, description: "The artifact does not satisfy its own published schema." },
  { id: "POLICY_VIOLATION", scope: "all", hard: true, description: "Final copy re-screened by the PolicyGate: third-party IP, real-person likeness, or unsafe content." },
  { id: "SOURCE_MISSING", scope: "grounded claims in plans", hard: true, description: "A factual claim (venue, hours, weather, price) ships without a source and a retrieval timestamp." },
  { id: "BUDGET_SUM_MISMATCH", scope: "budget", hard: true, description: "Line items do not sum to the stated total (tolerance $0.01)." },
  { id: "SCHEDULE_OVERLAP", scope: "schedule", hard: true, description: "Two schedule items overlap in time, or two venues are separated by an impossible gap (under 5 minutes to travel)." },
  { id: "DATE_INVALID", scope: "plan", hard: true, description: "A date is not a real calendar date, or contradicts the occasion date." },
  { id: "DIM_ASPECT_MISMATCH", scope: "images", hard: true, description: "Rendered pixel dimensions do not match the dimensions the artifact was specified at." },
  { id: "PLACEHOLDER_TEXT", scope: "all copy (md, html, json)", hard: true, description: "Finished copy still contains a placeholder — [BRACKETS], YOUR X HERE, TBD, TK, XXX, or lorem ipsum. A placeholder that reaches a buyer ships looking deliberate, which is worse than an omission." },
  { id: "CONTRAST_LOW", scope: "invites/cards", hard: false, description: "Body text falls below a 4.5:1 WCAG contrast ratio against its background." },
  { id: "PALETTE_DRIFT", scope: "images", hard: false, description: "Dominant colours drift away from the declared House Style palette." },
  { id: "LINK_DEAD", scope: "launch kit", hard: false, description: "A referenced link does not resolve." },
  { id: "TEXT_OVERFLOW_RISK", scope: "invites/cards", hard: false, description: "Copy is long enough to overflow or crush its layout slot." },
  { id: "FILE_TOO_LARGE", scope: "images", hard: false, description: "A PNG exceeds 4 MB, which is too heavy to share comfortably." },
] as const;

export const CHECK_BY_ID: Readonly<Record<CheckId, CheckSpec>> = Object.freeze(
  Object.fromEntries(CHECKS.map((check) => [check.id, check])) as Record<CheckId, CheckSpec>,
);

export const THRESHOLDS = {
  budgetToleranceUsd: 0.01,
  minTravelGapMinutes: 5,
  minContrastRatio: 4.5,
  maxPaletteDistance: 70,
  maxPngBytes: 4 * 1024 * 1024,
  textBudgets: {
    invitation: 420,
    guest_guide: 3000,
    toast: 1200,
    carousel: 1800,
    launch_thread: 2400,
    story_page: 6000,
    og_image: 120,
    landing_spec: 9000,
    demo_script: 4000,
  },
} as const;

/* ---------------------------------------------------------- pass / class ---*/

export type FailureClass = "correctness" | "craft" | "both" | null;

/**
 * WHY an artifact failed, in the terms that matter to whoever is paying — judged against the
 * axes of ITS OWN profile, not a fixed five. A visual fail on subject_fidelity is a correctness
 * fail; a written fail on voice is craft.
 */
export function failureClass(
  axes: Partial<Record<CritiqueAxis, number>> | undefined,
  hardFailures: number,
  profileAxes: readonly CritiqueAxisSpec[],
): FailureClass {
  const hardIsCorrectness = hardFailures > 0;

  const below = (cls: AxisClass): boolean =>
    Boolean(axes) &&
    profileAxes.filter((axis) => axis.class === cls).some((axis) => (axes![axis.id] ?? 0) < axis.threshold);

  const correctness = hardIsCorrectness || below("correctness");
  const craft = below("craft");

  if (correctness && craft) return "both";
  if (correctness) return "correctness";
  if (craft) return "craft";
  return null;
}

/** Every axis in the profile clears its threshold AND no hard check failed. */
export function passes(
  axes: Partial<Record<CritiqueAxis, number>> | undefined,
  hardFailures: number,
  profileAxes: readonly CritiqueAxisSpec[],
): boolean {
  if (hardFailures > 0) return false;
  if (!axes) return true; // critique unavailable: deterministic-only verdict, noted in the report
  return profileAxes.every((axis) => (axes[axis.id] ?? 0) >= axis.threshold);
}

/* ---------------------------------------------------------------- render ---*/

export interface RubricJson {
  oqsVersion: string;
  passRule: string;
  maxRepairs: number;
  profiles: ReadonlyArray<{
    id: string;
    title: string;
    description: string;
    axes: readonly CritiqueAxisSpec[];
  }>;
  checks: readonly CheckSpec[];
  thresholds: typeof THRESHOLDS;
}

export function rubricAsJson(): RubricJson {
  return {
    oqsVersion: OQS_VERSION,
    passRule: `Within its profile, every axis scores >= ${AXIS_PASS_THRESHOLD} of 100, AND zero hard deterministic checks fail.`,
    maxRepairs: MAX_REPAIRS,
    profiles: Object.values(PROFILES).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      axes: p.axes,
    })),
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
    `An artifact passes when **every axis in its profile scores at least ${AXIS_PASS_THRESHOLD}/100** and **no hard check fails**. On failure the Tribunal writes a concrete repair brief and the artifact is regenerated — at most **${MAX_REPAIRS} repair passes**. The full report ships inside the pack either way, pass or fail.`,
  );
  lines.push("");
  lines.push("## Profiles");
  lines.push("");
  lines.push(
    "An artifact is graded on the axes that mean something for what it *is*. An invitation image and a budget are not judged alike. Axes are of two kinds: **correctness** axes ask whether the artifact is true and usable — a failure means it says or shows something wrong, and no amount of craft redeems that. **Craft** axes ask whether it is well made. Both clear the same floor. A correctness axis may only fall below its floor if the critic can **quote the exact defect**; craft is allowed to be a judgement.",
  );
  lines.push("");
  for (const p of Object.values(PROFILES)) {
    lines.push(`### ${p.title} profile`);
    lines.push("");
    lines.push(`*${p.description}*`);
    lines.push("");
    lines.push("| Axis | Kind | Threshold | What it measures |");
    lines.push("| --- | --- | --- | --- |");
    for (const axis of p.axes) {
      lines.push(`| **${axis.title}** | ${axis.class} | ${axis.threshold}/100 | ${axis.description} |`);
    }
    lines.push("");
  }
  lines.push("## A failing correctness score must be QUOTABLE");
  lines.push("");
  lines.push(
    "A correctness axis may only fall below its floor if the critic can **quote the exact thing that is wrong** — the unsourced claim, the ambiguous time, the wrong subject in the picture. A correctness failure with no citable cause is discarded and the score restored to the floor. This does not lower the bar; it raises what it takes to fail something, because the critic was measured disagreeing with itself and a citable cause is reproducible even when the number is not. Craft axes are exempt — nobody re-litigates a composition of 68.",
  );
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
    lines.push(`| \`${check.id}\` | ${check.scope} | ${check.hard ? "**hard**" : "soft"} | ${check.description} |`);
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

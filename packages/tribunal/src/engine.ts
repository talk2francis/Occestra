/**
 * The Tribunal. Deterministic checks first, model critique second, repair loop third.
 *
 * Two invariants worth stating out loud, because everything downstream leans on them:
 *  - The report ALWAYS ships, pass or fail. A failing artifact with an honest report is a
 *    better product than a silent one.
 *  - A dead critique provider degrades the verdict to deterministic-only and records a
 *    coverage gap. It never throws, and it never aborts a pack.
 */
import type {
  Artifact,
  CritiqueAxis,
  CritiquePort,
  HouseStyle,
  OccasionContract,
} from "@occestra/studio-core";
import type { CritiqueAxisSpec } from "@occestra/studio-core";
import { runChecks, sortFindings, type CheckDeps, type CheckResult } from "./checks.js";
import {
  MAX_REPAIRS,
  OQS_VERSION,
  failureClass,
  passes,
  profileFor,
  type FailureClass,
  type Profile,
} from "./rubric.js";

export interface TribunalReport {
  oqsVersion: string;
  /** Which profile this artifact was graded under — a report is self-describing. */
  profile: string;
  deterministic: CheckResult[];
  /** Undefined when the critique provider was unavailable — see notes + coverageGaps. */
  axes?: Partial<Record<CritiqueAxis, number>>;
  issues: string[];
  pass: boolean;
  /**
   * WHAT KIND of failure this is — "correctness" (it says something untrue, or unreadable),
   * "craft" (it is honest but not well enough made), or "both". Null when it passed.
   *
   * The bar has not moved: an artifact that fails on craft alone still fails. But a buyer
   * reading a fail deserves to know whether they are holding a lie or a rough draft, and a
   * repair loop that treats those the same is polishing prose on a claim that is false.
   */
  failedOn: FailureClass;
  repairs: number;
  notes: string[];
  coverageGaps: string[];
  /** Present only when the artifact still fails after the final pass. */
  repairBrief?: string;
}

export interface TribunalDeps extends CheckDeps {
  critique: CritiquePort;
}

export interface RunTribunalArgs {
  artifact: Artifact;
  contract: OccasionContract;
  style?: HouseStyle;
  deps: TribunalDeps;
  /** Regenerate the artifact from a repair brief. Omit to grade without repairing. */
  regenerate?: (repairBrief: string, previous: Artifact) => Promise<Artifact>;
  maxRepairs?: number;
}

export interface TribunalOutcome {
  /** The final artifact — repaired if repairs happened — with its report attached. */
  artifact: Artifact;
  report: TribunalReport;
}

interface Graded {
  profile: Profile;
  deterministic: CheckResult[];
  axes?: Partial<Record<CritiqueAxis, number>>;
  issues: string[];
  repairBrief?: string;
  notes: string[];
  coverageGaps: string[];
  pass: boolean;
  /** Truth, taste, both, or nothing. See rubric.failureClass(). */
  failedOn: FailureClass;
}

/**
 * A CORRECTNESS FAILURE THAT CANNOT BE QUOTED DOES NOT STAND.
 *
 * The critic disagreed with itself: the same schedule scored grounding 62 on one run and 72
 * on the next — straddling the floor, so the artifact both passed and failed. Digging into
 * the runs, the low scores never named a defect. They said things like "could be better
 * evidenced" and "confidence is slightly higher than invented". That is a mood, not a finding.
 *
 * So a correctness axis may now only fall below its floor if the critic QUOTED the thing that
 * is wrong — the unsourced claim, the ambiguous time, the number that does not add up. An
 * uncited correctness failure is discarded and the score restored to the floor.
 *
 * This does not lower the bar. It raises what it takes to fail something: a citable cause,
 * which is reproducible even when the number attached to it is not. Reproducible causes are
 * what a standard is actually made of.
 *
 * CRAFT axes are left alone. Nobody is going to re-litigate a composition of 68, and taste is
 * allowed to be taste.
 */
function requireCitations(
  axes: Partial<Record<CritiqueAxis, number>>,
  citations: ReadonlyArray<{ axis: CritiqueAxis; quote: string }>,
  profileAxes: readonly CritiqueAxisSpec[],
  notes: string[],
): Partial<Record<CritiqueAxis, number>> {
  const cited = new Set(citations.filter((c) => c.quote.trim().length > 0).map((c) => c.axis));
  const adjusted = { ...axes };

  for (const axis of profileAxes) {
    if (axis.class !== "correctness") continue;

    const score = adjusted[axis.id] ?? 0;
    if (score >= axis.threshold) continue;
    if (cited.has(axis.id)) continue;

    adjusted[axis.id] = axis.threshold;
    notes.push(
      `${axis.title} was scored ${score} but the critic quoted no defect to justify it. ` +
        `A correctness failure without a citable cause is an opinion, and opinions do not reproduce — ` +
        `the score is restored to the floor (${axis.threshold}).`,
    );
  }

  return adjusted;
}

function hardFailures(results: CheckResult[]): CheckResult[] {
  return results.filter((r) => !r.passed && r.hard);
}

function softFailures(results: CheckResult[]): CheckResult[] {
  return results.filter((r) => !r.passed && !r.hard);
}

async function gradeOnce(args: {
  artifact: Artifact;
  contract: OccasionContract;
  style?: HouseStyle;
  deps: TribunalDeps;
}): Promise<Graded> {
  const { artifact, contract, style, deps } = args;
  const notes: string[] = [];
  const coverageGaps: string[] = [];

  // What KIND of thing is this, and therefore which axes mean anything for it.
  const profile = profileFor(artifact.kind, artifact.format);

  const checkCtx = {
    artifact,
    contract,
    ...(style ? { style } : {}),
    deps: deps satisfies CheckDeps,
  };
  const deterministic = await runChecks(checkCtx);

  for (const skipped of deterministic.filter((r) => r.skipped)) {
    coverageGaps.push(`${skipped.id}: ${skipped.detail}`);
  }

  let axes: Partial<Record<CritiqueAxis, number>> | undefined;
  const issues: string[] = [];
  let repairBrief: string | undefined;

  try {
    const critique = await deps.critique.judge({
      artifact,
      contract,
      ...(style ? { style } : {}),
      profile,
    });

    axes = requireCitations(critique.axes, critique.citations ?? [], profile.axes, notes);
    issues.push(...critique.issues);
    if (critique.repairBrief) repairBrief = critique.repairBrief;
    notes.push(`Critique by ${critique.model}, ${profile.id} profile.`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    notes.push(
      "Critique provider unavailable — this verdict rests on the deterministic checks alone.",
    );
    coverageGaps.push(`CRITIQUE_UNAVAILABLE: ${reason}`);
  }

  // Deterministic failures are facts, so they belong in the issue list regardless of the critic.
  for (const failure of [...hardFailures(deterministic), ...softFailures(deterministic)]) {
    issues.push(`${failure.id}: ${failure.detail}`);
  }

  const hard = hardFailures(deterministic).length;
  const pass = passes(axes, hard, profile.axes);
  const failedOn = pass ? null : failureClass(axes, hard, profile.axes);

  // Even a silent critic must hand the repair loop something actionable.
  if (!pass && !repairBrief) {
    repairBrief = buildRepairBrief(deterministic, profile, axes);
  }

  return {
    profile,
    deterministic,
    ...(axes ? { axes } : {}),
    issues,
    ...(repairBrief ? { repairBrief } : {}),
    notes,
    coverageGaps,
    pass,
    failedOn,
  };
}

/** A concrete, actionable brief — never "try harder". */
export function buildRepairBrief(
  deterministic: CheckResult[],
  profile: Profile,
  axes?: Partial<Record<CritiqueAxis, number>>,
): string {
  const lines: string[] = ["Fix the following, then regenerate:"];

  for (const failure of sortFindings(deterministic).filter((r) => !r.passed)) {
    const evidence = failure.evidence.length > 0 ? ` (${failure.evidence.join("; ")})` : "";
    lines.push(`- [${failure.hard ? "MUST" : "SHOULD"}] ${failure.id}: ${failure.detail}${evidence}`);
  }

  if (axes) {
    // CORRECTNESS FIRST, ALWAYS. If a claim is untrue, improving its composition is
    // polishing a lie — and a writer handed a mixed list will reach for the easy note.
    // The order of this brief is the order the work should be done in.
    const failing = (cls: "correctness" | "craft") =>
      profile.axes.filter((axis) => axis.class === cls && (axes[axis.id] ?? 0) < axis.threshold);

    for (const axis of failing("correctness")) {
      lines.push(
        `- [MUST — this is a correctness failure] ${axis.title} scored ${axes[axis.id] ?? 0}/100 against a floor of ${axis.threshold}. ${axis.description}`,
      );
    }

    for (const axis of failing("craft")) {
      lines.push(
        `- [MUST — craft] ${axis.title} scored ${axes[axis.id] ?? 0}/100 against a floor of ${axis.threshold}. ${axis.description}`,
      );
    }
  }

  return lines.join("\n");
}

export async function runTribunal(args: RunTribunalArgs): Promise<TribunalOutcome> {
  const { contract, style, deps, regenerate } = args;
  const maxRepairs = args.maxRepairs ?? MAX_REPAIRS;

  let artifact = args.artifact;
  let repairs = 0;
  let graded = await gradeOnce({ artifact, contract, ...(style ? { style } : {}), deps });
  const notes: string[] = [...graded.notes];
  const coverageGaps: string[] = [...graded.coverageGaps];

  while (!graded.pass && regenerate && repairs < maxRepairs) {
    const brief = graded.repairBrief ?? buildRepairBrief(graded.deterministic, graded.profile, graded.axes);
    try {
      artifact = await regenerate(brief, artifact);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      notes.push("Repair pass could not be run; shipping the artifact as-is with its report.");
      coverageGaps.push(`REPAIR_FAILED: ${reason}`);
      break;
    }
    repairs += 1;
    graded = await gradeOnce({ artifact, contract, ...(style ? { style } : {}), deps });
    notes.push(`Repair pass ${repairs}: ${graded.pass ? "passed" : "still failing"}.`);
    coverageGaps.push(...graded.coverageGaps);
  }

  if (!graded.pass && regenerate && repairs >= maxRepairs) {
    notes.push(
      `Repair limit reached (${maxRepairs}). Shipping with an honest failing report rather than looping.`,
    );
  }

  const report: TribunalReport = {
    oqsVersion: OQS_VERSION,
    profile: graded.profile.id,
    deterministic: graded.deterministic,
    ...(graded.axes ? { axes: graded.axes } : {}),
    issues: graded.issues,
    pass: graded.pass,
    failedOn: graded.failedOn,
    repairs,
    notes: [...new Set([...notes, ...graded.notes])],
    coverageGaps: [...new Set(coverageGaps)],
    ...(graded.pass ? {} : { repairBrief: graded.repairBrief ?? "" }),
  };

  return { artifact: { ...artifact, tribunal: report }, report };
}

/**
 * Turning an overturned verdict into work.
 *
 * This is where GenLayer stops being a badge. An OVERTURNED review means independent
 * validators looked at an artifact Occestra passed and disagreed, and the only honest response
 * to that is to fix the artifact — otherwise the consensus layer is decoration with a contract
 * address attached.
 *
 * Two rules constrain how that happens.
 *
 * The first is a security rule. Only normalized codes from a closed set reach the brief below.
 * Validator prose never does. A model that can write free text into a regeneration brief has a
 * path straight through the consensus layer into Occestra's own generator, and "the validator
 * said so" is not a reason to hand a stranger's sentences to our image model. The codes are an
 * enum; the sentences they map to are ours, written here, in advance.
 *
 * The second is a history rule. A repair never edits the past. The overturned artifact keeps
 * its PASS and its OVERTURNED side by side, permanently, because that pairing is the most
 * interesting thing this feature produces: it is the record of Occestra being wrong and
 * saying so. The fix is a new version that points back at it.
 */
import type { ConsensusDecision, FailureCode, LocalVerdict } from "./schemas.js";

/**
 * What each failure code actually asks for.
 *
 * Deliberately imperative and specific. "Improve legibility" is the kind of note that produces
 * another failing artifact; naming the smallest concrete change is what makes a repair land.
 */
const REPAIR_INSTRUCTIONS: Record<FailureCode, string> = {
  LEGIBILITY:
    "Text is hard to read. Raise contrast against what sits behind it, increase type size, and cut any copy that does not need to be on the artwork.",
  COMPOSITION:
    "The eye has nowhere to go. Establish one clear focal point, then balance the remaining elements around it instead of distributing them evenly.",
  BRIEF_MISMATCH:
    "A required element of the brief is missing or contradicted. Re-read the brief and put every required element in, verbatim where it is a fact.",
  SUBJECT_FIDELITY:
    "The subject is wrong. Regenerate subject-first: get the stated subject unmistakably right before any styling decision.",
  STYLE_DRIFT:
    "The artifact has drifted off the House Style. Hold the style's palette, type and treatment exactly, and let the composition change instead.",
  FACTUAL_SUPPORT:
    "A claim is not supported by the sources on hand. Remove it, or reground it against a source that is actually present — never soften it into vagueness.",
  SOURCE_COVERAGE:
    "A grounded claim is missing its source. Retrieve one, or state the uncertainty plainly. An unsourced fact presented as settled is the failure.",
  SCHEDULE_CONFLICT:
    "The schedule does not work. Recompute it so no two items overlap and travel time between locations is real.",
  BUDGET_INCONSISTENCY:
    "The budget does not add up. Reconcile the line items against the total and show the arithmetic.",
  PACK_INCOMPLETE:
    "A requested deliverable is missing from the pack. Identify which, and produce it.",
  // These two describe a review that could not happen, not work that was found wanting.
  ARTIFACT_UNAVAILABLE: "",
  INVALID_VALIDATOR_OUTPUT: "",
};

/** Codes that describe a broken review rather than a flawed artifact. */
const NOT_ACTIONABLE = new Set<FailureCode>(["ARTIFACT_UNAVAILABLE", "INVALID_VALIDATOR_OUTPUT"]);

export interface ConsensusRepairDecision {
  shouldRepair: boolean;
  /** Built entirely from our own sentences. Undefined when there is nothing to act on. */
  repairBrief?: string;
  /** Why not, when we are declining. Shown to the owner, so it has to be true. */
  reason?: string;
}

export interface ConsensusRepairInputs {
  decision: ConsensusDecision;
  localVerdict: LocalVerdict;
  failureCodes: readonly FailureCode[];
  criticalFailure?: string;
  /**
   * How many repairs this artifact has already had BECAUSE of consensus.
   *
   * Bounded at one automatic pass. Left unbounded, an artifact that validators keep disagreeing
   * with would regenerate forever, spending real provider money and real GEN on a disagreement
   * that is probably about taste. A second opinion after that is a decision a person makes.
   */
  consensusRepairs: number;
  maxConsensusRepairs?: number;
}

export const MAX_CONSENSUS_REPAIRS = 1;

/**
 * Should this verdict send the artifact back, and with what instructions?
 */
export function decideConsensusRepair(
  inputs: ConsensusRepairInputs,
): ConsensusRepairDecision {
  const max = inputs.maxConsensusRepairs ?? MAX_CONSENSUS_REPAIRS;

  if (inputs.decision === "UPHELD") {
    // Including an upheld FAIL. The local repair rules already govern that artifact, and
    // regenerating it again here would just be a second opinion agreeing with the first.
    return { shouldRepair: false, reason: "independent review agreed with the Tribunal" };
  }

  if (inputs.decision === "UNDETERMINED") {
    return {
      shouldRepair: false,
      reason: "validators could not reach a reliable determination, which is not a finding against the work",
    };
  }

  if (inputs.localVerdict === "FAIL") {
    // Validators think we were too harsh. That is interesting, and it is recorded — but
    // regenerating work in order to make it worse is not a coherent instruction.
    return {
      shouldRepair: false,
      reason: "independent review considered our FAIL too harsh; the artifact stands as graded",
    };
  }

  if (inputs.consensusRepairs >= max) {
    return {
      shouldRepair: false,
      reason: "this artifact has already had its automatic consensus repair; a further review can be requested explicitly",
    };
  }

  const actionable = inputs.failureCodes.filter((code) => !NOT_ACTIONABLE.has(code));
  if (actionable.length === 0) {
    return {
      shouldRepair: false,
      reason: "the review was overturned without naming an actionable failure",
    };
  }

  return { shouldRepair: true, repairBrief: buildConsensusRepairBrief(actionable, inputs.criticalFailure) };
}

/**
 * The brief itself — assembled from the table above, never from anything a model wrote.
 *
 * A named critical failure is put first, because it is the thing that actually decided the
 * ruling and a generator handed a flat list will reach for the easiest item on it.
 */
export function buildConsensusRepairBrief(
  codes: readonly FailureCode[],
  criticalFailure?: string,
): string {
  const critical = criticalFailure?.trim().toUpperCase();
  const ordered = [...codes].sort((a, b) => {
    if (a === critical) return -1;
    if (b === critical) return 1;
    return a.localeCompare(b);
  });

  const lines = [
    "Independent GenLayer validators reviewed this artifact and disagreed with our own PASS.",
    "Fix the following, then regenerate:",
  ];
  for (const code of ordered) {
    const instruction = REPAIR_INSTRUCTIONS[code];
    if (!instruction) continue;
    lines.push(`- [${code === critical ? "MUST — this decided the review" : "MUST"}] ${instruction}`);
  }
  return lines.join("\n");
}

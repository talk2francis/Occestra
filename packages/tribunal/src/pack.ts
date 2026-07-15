/**
 * The pack profile — the whole delivery, graded once.
 *
 * A set of artifacts that each pass its own profile is not automatically a good pack. It can be
 * MISSING a deliverable the brief asked for, or it can CONTRADICT ITSELF — the invitation says
 * the 18th, the schedule says the 19th. Neither shows up in a per-artifact grade, because each
 * artifact is internally fine. So the pack is graded as a whole.
 *
 * This is COMPUTED, not model-judged, and deliberately so: it is arithmetic over facts that are
 * already in the pack, it costs nothing, and it is reproducible-exact. The published standard
 * says as much.
 */
import type { Artifact, OccasionContract } from "@occestra/studio-core";
import { AXIS_PASS_THRESHOLD } from "./rubric.js";

export interface PackGrade {
  completeness: number;
  cross_artifact_consistency: number;
  brief_satisfaction: number;
  pass: boolean;
  notes: string[];
}

const isUndelivered = (artifact: Artifact): boolean => Boolean(artifact.undelivered);

/** Every YYYY-MM-DD that appears anywhere in an artifact's text or data. */
function datesIn(artifact: Artifact): Set<string> {
  const hay = `${artifact.data ?? ""} ${artifact.title}`;
  const found = new Set<string>();
  for (const match of hay.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) {
    if (match[1]) found.add(match[1]);
  }
  return found;
}

export function gradePack(args: {
  requested: readonly string[];
  artifacts: Artifact[];
  contract: OccasionContract;
}): PackGrade {
  const { requested, artifacts, contract } = args;
  const notes: string[] = [];

  // --- completeness: did every requested deliverable ship as a real artifact? ---
  const deliveredKinds = new Set<string>(artifacts.filter((a) => !isUndelivered(a)).map((a) => a.kind));
  const missing = requested.filter((kind) => !deliveredKinds.has(kind));
  const completeness = requested.length === 0 ? 100 : Math.round(((requested.length - missing.length) / requested.length) * 100);
  if (missing.length > 0) notes.push(`Missing from the brief: ${missing.join(", ")}.`);

  // --- cross-artifact consistency: do the artifacts agree on the occasion's date? ---
  // Only the occasion date is checked structurally — it is the one fact that appears across
  // artifacts and whose contradiction is unambiguous. A date that is not the occasion date
  // (a source retrieval timestamp, a "next year" aside) is not a contradiction, so we only
  // fault an artifact that names dates AND does not include the occasion's own date.
  const occasionDate = "date" in contract ? (contract as { date?: string }).date : undefined;
  let consistency = 100;
  if (occasionDate) {
    const contradicting = artifacts
      .filter((a) => !isUndelivered(a))
      .filter((a) => {
        const dates = datesIn(a);
        return dates.size > 0 && !dates.has(occasionDate);
      });
    if (contradicting.length > 0) {
      consistency = Math.max(0, 100 - contradicting.length * 40);
      notes.push(
        `These artifacts name a date but not the occasion's ${occasionDate}: ${contradicting.map((a) => a.kind).join(", ")}.`,
      );
    }
  }

  // --- brief satisfaction: of the delivered artifacts that were graded, how many passed? ---
  const graded = artifacts.filter((a) => !isUndelivered(a) && a.tribunal);
  const passed = graded.filter((a) => (a.tribunal as { pass?: boolean }).pass).length;
  const brief_satisfaction = graded.length === 0 ? 100 : Math.round((passed / graded.length) * 100);

  const scores = [completeness, consistency, brief_satisfaction];
  const pass = scores.every((score) => score >= AXIS_PASS_THRESHOLD);

  return {
    completeness,
    cross_artifact_consistency: consistency,
    brief_satisfaction,
    pass,
    notes,
  };
}

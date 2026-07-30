/**
 * A VERDICT NOBODY REACHED IS NOT A PASS.
 *
 * A third-party buyer submitted a gala run-of-show to the Critique service on 2026-07-29,
 * deliberately seeded with three overlapping blocks, a 5-minute dessert service against a
 * stated 25-minute plating time, and a 5-minute turnaround for a band needing 45. It came back:
 *
 *     pass: true, issues: [], failedOn: null, no axes scored
 *     SCHEDULE_OVERLAP  → "passed: true — Schedule payload unreadable; SCHEMA_INVALID owns this"
 *     SCHEMA_INVALID    → "passed: true — Artifact and payload satisfy their schemas"
 *     coverage gap      → CRITIQUE_UNAVAILABLE
 *
 * Two failures compounding. SCHEMA_INVALID only validated a structured payload when the artifact
 * DECLARED `format: "json"`, so a schedule in any other format skipped payload validation and
 * passed — while every schedule/plan/budget check abstained TO it, believing it had looked. With
 * the model critic also unreachable, nothing judged the artifact at all and the service returned
 * a clean pass. It charged for, and certified, work it never read. For a product whose entire
 * pitch is verified quality, that is the worst reachable outcome.
 *
 * Both halves are held shut here: the kind now decides whether a payload is owed (not the
 * declared format), and an abstention can never add up to a pass.
 */
import { describe, expect, it } from "vitest";
import type { Artifact } from "@occestra/studio-core";
import { runTribunal } from "../src/index.js";
import { FakeCritique, artifact, contract } from "./fixtures.js";

/** The buyer's artifact: it claims to be a schedule, but carries prose, not a payload. */
const proseSchedule = (): Artifact =>
  artifact({
    kind: "schedule",
    format: "md",
    title: "Gala run of show",
    data: [
      "## Run of show",
      "- 18:30–19:15 Reception, Grand Hall",
      "- 19:10–19:40 Seating, Grand Hall",
      "- 20:05–20:35 Auction, Grand Hall",
      "- 20:20–21:10 Main service, Grand Hall",
    ].join("\n"),
  });

/** A critic that cannot be reached, exactly as in the buyer's run. */
const criticDown = () => new FakeCritique([new Error("model critic unreachable")]);

describe("an unreadable payload can never be certified", () => {
  it("fails a schedule whose payload cannot be read, whatever format it declares", async () => {
    const { report: graded } = await runTribunal({
      artifact: proseSchedule(),
      contract: contract(),
      deps: { critique: criticDown() },
    });

    expect(graded.pass).toBe(false);

    // SCHEMA_INVALID must OWN it, because every other schedule check defers to it by name.
    const schema = graded.deterministic.find((r) => r.id === "SCHEMA_INVALID");
    expect(schema?.passed, JSON.stringify(schema)).toBe(false);
  });

  it("never returns a clean pass when the critic is down and a hard check abstained", async () => {
    const { report: graded } = await runTribunal({
      artifact: proseSchedule(),
      contract: contract(),
      deps: { critique: criticDown() },
    });

    expect(graded.pass).toBe(false);
    expect(graded.failedOn).not.toBeNull();
    // Silence is not agreement: the report has to say out loud that nothing judged this.
    expect(graded.issues.length).toBeGreaterThan(0);
  });

  it("marks a verdict inconclusive rather than passing it when nothing could judge it", async () => {
    // A kind with no structured payload of its own, so SCHEMA_INVALID has nothing to fail on —
    // but a hard check still abstains and the critic is still down.
    const { report: graded } = await runTribunal({
      artifact: artifact({ kind: "schedule", format: "json", data: "{ not json at all" }),
      contract: contract(),
      deps: { critique: criticDown() },
    });

    expect(graded.pass).toBe(false);
    expect(graded.issues.join(" ")).toMatch(/INCONCLUSIVE|SCHEMA_INVALID/);
  });

  it("still passes a genuinely good artifact when the critic is down — no false alarm", async () => {
    // The deterministic layer really did reach a verdict here, so a pass is honest.
    const { report: graded } = await runTribunal({
      artifact: artifact(),
      contract: contract(),
      deps: { critique: criticDown() },
    });

    expect(graded.pass).toBe(true);
    expect(graded.failedOn).toBeNull();
  });

  it("declares every abstention, so a buyer can see what was never checked", async () => {
    const { report: graded } = await runTribunal({
      artifact: proseSchedule(),
      contract: contract(),
      deps: { critique: criticDown() },
    });

    // An abstention deliberately carries `passed: true` so it is not counted as a hard failure
    // — a not-applicable check must not fail an artifact. What it must never do is stay quiet:
    // silence is what let the gala schedule through. Every skip is published as a coverage gap.
    for (const result of graded.deterministic.filter((r) => r.skipped)) {
      expect(
        graded.coverageGaps.some((gap) => gap.startsWith(`${result.id}:`)),
        `${result.id} abstained without declaring a coverage gap`,
      ).toBe(true);
    }

    // And the critic's own absence is on the record too.
    expect(graded.coverageGaps.some((gap) => gap.startsWith("CRITIQUE_UNAVAILABLE:"))).toBe(true);
  });
});

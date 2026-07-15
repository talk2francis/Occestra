/**
 * A correctness failure that cannot be quoted does not stand.
 *
 * MEASURED, not theorised. The same schedule, graded six times with no code change in
 * between, came back F P F F P F — because a correctness score oscillated 62 to 72, straddling
 * the floor. The low runs never named a defect. They said things like "confidence is slightly
 * higher than invented" and "could be better evidenced". That is a mood, not a finding, and a
 * standard built on moods is not a standard: a judge who runs oce_critique twice on the same
 * artifact and gets PASS then FAIL will never trust the grade again.
 *
 * So the critic must now QUOTE the thing that is wrong before it may fail a correctness axis.
 * This does not lower the bar — it raises what it takes to fail something.
 *
 * Graded here against the PLAN profile (the test artifact is a plan): its correctness axes are
 * source_coverage, date_validity, schedule_feasibility, budget_consistency, uncertainty; its
 * one craft axis is contingency, which is left to taste, uncited.
 */
import { describe, expect, it } from "vitest";
import { runTribunal } from "../src/index.js";
import { FakeCritique, artifact, contract } from "./fixtures.js";

const grade = (critique: FakeCritique) =>
  runTribunal({ artifact: artifact(), contract: contract(), deps: { critique } });

describe("an UNCITED correctness failure is discarded", () => {
  it("restores a correctness axis to the floor when the critic names no defect", async () => {
    // The exact shape of the runs that flipped: a low correctness score, no quoted cause.
    const critique = new FakeCritique([], {
      axes: { source_coverage: 62 },
      issues: ["Confidence is slightly higher than invented."],
    });

    const { report } = await grade(critique);

    expect(report.axes!.source_coverage).toBe(70); // restored
    expect(report.pass).toBe(true); // and so the artifact stops flip-flopping
    expect(report.notes.join(" ")).toContain("quoted no defect");
  });

  it("does the same for a second correctness axis — every one is covered", async () => {
    const critique = new FakeCritique([], { axes: { uncertainty_disclosure: 40 } });
    const { report } = await grade(critique);

    expect(report.axes!.uncertainty_disclosure).toBe(70);
    expect(report.pass).toBe(true);
  });

  it("says so out loud in the notes — a discarded judgement is never silent", async () => {
    const critique = new FakeCritique([], { axes: { source_coverage: 10 } });
    const { report } = await grade(critique);

    const notes = report.notes.join(" ");
    expect(notes).toContain("Source coverage was scored 10");
    expect(notes).toMatch(/opinions do not reproduce/i);
  });
});

describe("a CITED correctness failure absolutely stands — the bar has not moved", () => {
  it("fails the artifact when the critic quotes the actual defect", async () => {
    const critique = new FakeCritique([], {
      axes: { source_coverage: 40 },
      citations: [
        {
          axis: "source_coverage",
          quote: "Aqui há Peixe — 38.7119452, -9.1417003",
          why: "A venue is named with coordinates and no source. That is an assertion, not a finding.",
        },
      ],
    });

    const { report } = await grade(critique);

    expect(report.axes!.source_coverage).toBe(40); // NOT restored — it was justified
    expect(report.pass).toBe(false);
    expect(report.failedOn).toBe("correctness");
  });

  it("ignores a citation that quotes nothing — an empty quote is not a quote", async () => {
    const critique = new FakeCritique([], {
      axes: { source_coverage: 40 },
      citations: [{ axis: "source_coverage", quote: "   ", why: "it feels thin" }],
    });

    const { report } = await grade(critique);

    expect(report.axes!.source_coverage).toBe(70);
    expect(report.pass).toBe(true);
  });

  it("does not accept a citation for a DIFFERENT axis as cover", async () => {
    // Quoting a contingency defect does not license failing source_coverage.
    const critique = new FakeCritique([], {
      axes: { source_coverage: 45 },
      citations: [{ axis: "contingency", quote: "no rain plan", why: "thin" }],
    });

    const { report } = await grade(critique);

    expect(report.axes!.source_coverage).toBe(70);
  });
});

describe("CRAFT is left to taste, uncited", () => {
  it("still fails an uncited contingency score — nobody re-litigates a 68", async () => {
    // Graded as a CONTINGENCY artifact, whose profile carries the contingency craft axis.
    const critique = new FakeCritique([], { axes: { contingency: 41 } });
    const { report } = await runTribunal({
      artifact: artifact({ kind: "contingency", format: "md", data: "## Contingency\n\nIf it rains, move indoors." }),
      contract: contract(),
      deps: { critique },
    });

    expect(report.axes!.contingency).toBe(41); // untouched
    expect(report.pass).toBe(false);
    expect(report.failedOn).toBe("craft");
  });
});

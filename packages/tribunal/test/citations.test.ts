/**
 * A correctness failure that cannot be quoted does not stand.
 *
 * MEASURED, not theorised. The same schedule, graded six times with no code change in
 * between, came back F P F F P F — because its GROUNDING score oscillated 62 to 72, straddling
 * the floor. The low runs never named a defect. They said things like "confidence is slightly
 * higher than invented" and "could be better evidenced". That is a mood, not a finding, and a
 * standard built on moods is not a standard: a judge who runs oce_critique twice on the same
 * artifact and gets PASS then FAIL will never trust the grade again.
 *
 * So the critic must now QUOTE the thing that is wrong before it may fail a correctness axis.
 * This does not lower the bar — it raises what it takes to fail something. A citable cause is
 * reproducible even when the number attached to it is not, and reproducible causes are what a
 * standard is actually made of.
 *
 * Craft is left alone. Nobody is going to re-litigate a composition of 68, and taste is allowed
 * to be taste.
 */
import { describe, expect, it } from "vitest";
import { runTribunal } from "../src/index.js";
import { FakeCritique, artifact, contract } from "./fixtures.js";

const grade = (critique: FakeCritique) =>
  runTribunal({ artifact: artifact(), contract: contract(), deps: { critique } });

describe("an UNCITED correctness failure is discarded", () => {
  it("restores grounding to the floor when the critic names no defect", async () => {
    // The exact shape of the runs that flipped: a low grounding score, no quoted cause.
    const critique = new FakeCritique([], {
      axes: { grounding: 62 } as never,
      issues: ["Confidence is slightly higher than invented."],
    });

    const { report } = await grade(critique);

    expect(report.axes!.grounding).toBe(70); // restored
    expect(report.pass).toBe(true); // and so the artifact stops flip-flopping
    expect(report.notes.join(" ")).toContain("quoted no defect");
  });

  it("does the same for legibility — both correctness axes are covered", async () => {
    const critique = new FakeCritique([], { axes: { legibility: 40 } as never });
    const { report } = await grade(critique);

    expect(report.axes!.legibility).toBe(70);
    expect(report.pass).toBe(true);
  });

  it("says so out loud in the notes — a discarded judgement is never silent", async () => {
    const critique = new FakeCritique([], { axes: { grounding: 10 } as never });
    const { report } = await grade(critique);

    const notes = report.notes.join(" ");
    expect(notes).toContain("Grounding was scored 10");
    expect(notes).toMatch(/opinions do not reproduce/i);
  });
});

describe("a CITED correctness failure absolutely stands — the bar has not moved", () => {
  it("fails the artifact when the critic quotes the actual defect", async () => {
    const critique = new FakeCritique([], {
      axes: { grounding: 40 } as never,
      citations: [
        {
          axis: "grounding",
          quote: "Aqui há Peixe — 38.7119452, -9.1417003",
          why: "A venue is named with coordinates and no source. That is an assertion, not a finding.",
        },
      ],
    } as never);

    const { report } = await grade(critique);

    expect(report.axes!.grounding).toBe(40); // NOT restored — it was justified
    expect(report.pass).toBe(false);
    expect(report.failedOn).toBe("correctness");
  });

  it("ignores a citation that quotes nothing — an empty quote is not a quote", async () => {
    const critique = new FakeCritique([], {
      axes: { grounding: 40 } as never,
      citations: [{ axis: "grounding", quote: "   ", why: "it feels thin" }],
    } as never);

    const { report } = await grade(critique);

    expect(report.axes!.grounding).toBe(70);
    expect(report.pass).toBe(true);
  });

  it("does not accept a citation for a DIFFERENT axis as cover", async () => {
    // Quoting a composition defect does not license failing grounding.
    const critique = new FakeCritique([], {
      axes: { grounding: 45 } as never,
      citations: [{ axis: "composition", quote: "a wall of text", why: "no hierarchy" }],
    } as never);

    const { report } = await grade(critique);

    expect(report.axes!.grounding).toBe(70);
  });
});

describe("CRAFT is left to taste, uncited", () => {
  it("still fails an uncited composition score — nobody re-litigates a 68", async () => {
    const critique = new FakeCritique([], { axes: { composition: 41 } as never });
    const { report } = await grade(critique);

    expect(report.axes!.composition).toBe(41); // untouched
    expect(report.pass).toBe(false);
    expect(report.failedOn).toBe("craft");
  });
});

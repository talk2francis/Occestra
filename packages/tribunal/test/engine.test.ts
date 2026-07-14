import { describe, expect, it } from "vitest";
import type { Artifact } from "@occestra/studio-core";
import {
  AXES,
  CHECKS,
  MAX_REPAIRS,
  OQS_VERSION,
  rubricAsJson,
  rubricAsMarkdown,
  runTribunal,
} from "../src/index.js";
import { FakeCritique, artifact, contract, jsonArtifact } from "./fixtures.js";

const goodBudget = (total: number, amount: number): Artifact =>
  jsonArtifact("budget", {
    currency: "USD",
    total,
    lineItems: [{ label: "Dinner", amount }],
  });

describe("runTribunal", () => {
  it("passes a clean artifact with strong axes, and always attaches the report", async () => {
    const { artifact: out, report } = await runTribunal({
      artifact: artifact(),
      contract: contract(),
      deps: { critique: new FakeCritique([]) },
    });

    expect(report.pass).toBe(true);
    expect(report.repairs).toBe(0);
    expect(report.oqsVersion).toBe(OQS_VERSION);
    expect(out.tribunal).toBe(report); // the report ships INSIDE the artifact, always
    expect(report.repairBrief).toBeUndefined();
  });

  it("repairs once when the critic fails an axis, then passes — repairs === 1", async () => {
    const critique = new FakeCritique([
      { axes: { composition: 41 } as never, issues: ["centred blob"], repairBrief: "Rebuild the composition around a single focal point." },
    ]);

    let regenerated = 0;
    const { report } = await runTribunal({
      artifact: artifact(),
      contract: contract(),
      deps: { critique },
      regenerate: async (brief, previous) => {
        regenerated += 1;
        expect(brief).toContain("focal point");
        return { ...previous, id: `${previous.id}_r${regenerated}` };
      },
    });

    expect(regenerated).toBe(1);
    expect(report.repairs).toBe(1);
    expect(report.pass).toBe(true);
    expect(report.notes.join(" ")).toContain("Repair pass 1: passed");
  });

  it("caps repairs at 2 and still ships an honest failing report", async () => {
    const critique = new FakeCritique([], { axes: { composition: 10 } as never, issues: ["still bad"] });

    let regenerated = 0;
    const { artifact: out, report } = await runTribunal({
      artifact: artifact(),
      contract: contract(),
      deps: { critique },
      regenerate: async (_brief, previous) => {
        regenerated += 1;
        return previous;
      },
    });

    expect(MAX_REPAIRS).toBe(2);
    expect(regenerated).toBe(2); // tried twice, never a third time
    expect(report.repairs).toBe(2);
    expect(report.pass).toBe(false);
    expect(report.repairBrief).toBeTruthy();
    expect(report.notes.join(" ")).toContain("Repair limit reached");
    expect(out.tribunal).toBeDefined(); // failing reports ship too
  });

  it("degrades to a deterministic-only verdict when the critic throws — never aborts", async () => {
    const critique = new FakeCritique([new Error("openai 503")]);

    const { report } = await runTribunal({
      artifact: artifact(),
      contract: contract(),
      deps: { critique },
    });

    expect(report.axes).toBeUndefined();
    expect(report.pass).toBe(true); // deterministic checks all passed, so the work still ships
    expect(report.coverageGaps.join(" ")).toContain("CRITIQUE_UNAVAILABLE: openai 503");
    expect(report.notes.join(" ")).toContain("deterministic checks alone");
  });

  it("a hard deterministic failure forces pass:false even with a perfect critique", async () => {
    const { report } = await runTribunal({
      artifact: goodBudget(600, 1), // line items nowhere near the total
      contract: contract(),
      deps: { critique: new FakeCritique([]) }, // every axis 84+
    });

    expect(report.axes!.composition).toBeGreaterThanOrEqual(70);
    expect(report.pass).toBe(false);
    expect(report.issues.join(" ")).toContain("BUDGET_SUM_MISMATCH");
  });

  it("writes an actionable repair brief even when the critic is silent", async () => {
    const critique = new FakeCritique([new Error("critic down")]);

    const { report } = await runTribunal({
      artifact: goodBudget(600, 1),
      contract: contract(),
      deps: { critique },
    });

    expect(report.pass).toBe(false);
    expect(report.repairBrief).toContain("[MUST] BUDGET_SUM_MISMATCH");
  });

  it("survives a regenerate() that itself throws, recording the failure honestly", async () => {
    const critique = new FakeCritique([], { axes: { composition: 10 } as never });

    const { report } = await runTribunal({
      artifact: artifact(),
      contract: contract(),
      deps: { critique },
      regenerate: async () => {
        throw new Error("image provider down");
      },
    });

    expect(report.pass).toBe(false);
    expect(report.repairs).toBe(0);
    expect(report.coverageGaps.join(" ")).toContain("REPAIR_FAILED: image provider down");
  });

  it("grades without repairing when no regenerate() is supplied", async () => {
    // Fails on COMPOSITION — a craft axis. A correctness axis would need a citation to
    // stand (see "a correctness failure that cannot be quoted"), and this test is about
    // the repair loop, not about the citation rule.
    const critique = new FakeCritique([], { axes: { composition: 12 } as never });
    const { report } = await runTribunal({
      artifact: artifact(),
      contract: contract(),
      deps: { critique },
    });
    expect(report.pass).toBe(false);
    expect(report.repairs).toBe(0);
  });
});

describe("the published rubric IS the shipped rubric", () => {
  it("rubricAsMarkdown names every check id, every axis, and the version", () => {
    const md = rubricAsMarkdown();
    expect(md).toContain(`v${OQS_VERSION}`);
    for (const check of CHECKS) expect(md).toContain(check.id);
    for (const axis of AXES) expect(md).toContain(axis.title);
    expect(md).toContain("at most **2 repair passes**");
  });

  it("rubricAsJson is generated from the same constants the engine runs", () => {
    const json = rubricAsJson();
    expect(json.oqsVersion).toBe(OQS_VERSION);
    expect(json.maxRepairs).toBe(MAX_REPAIRS);
    expect(json.checks).toHaveLength(13);
    expect(json.axes.map((a) => a.id)).toEqual([
      "composition",
      "legibility",
      "style_fidelity",
      "grounding",
      "platform_fit",
    ]);
    expect(json.axes.every((a) => a.threshold === 70)).toBe(true);
    expect(json.checks.filter((c) => c.hard).map((c) => c.id)).toEqual([
      "SCHEMA_INVALID",
      "POLICY_VIOLATION",
      "SOURCE_MISSING",
      "BUDGET_SUM_MISMATCH",
      "SCHEDULE_OVERLAP",
      "DATE_INVALID",
      "DIM_ASPECT_MISMATCH",
      // New in OQS 1.0.1: unfinished text delivered to a buyer is a hard failure. It reads
      // as deliberate, which is worse than the omission it stands in for.
      "PLACEHOLDER_TEXT",
    ]);
  });
});

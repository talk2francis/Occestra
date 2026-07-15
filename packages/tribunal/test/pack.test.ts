/**
 * The pack profile — the whole delivery, graded once.
 *
 * A pack of individually-passing artifacts is not automatically a good pack: it can be missing
 * a deliverable, or contradict itself on the date. These are computed, not judged.
 */
import { describe, expect, it } from "vitest";
import { gradePack } from "../src/pack.js";
import { artifact, contract } from "./fixtures.js";

const passing = { pass: true } as never;

describe("completeness", () => {
  it("is 100 when every requested deliverable shipped", () => {
    const grade = gradePack({
      requested: ["plan", "budget"],
      artifacts: [artifact({ kind: "plan" }), artifact({ kind: "budget" })],
      contract: contract(),
    });
    expect(grade.completeness).toBe(100);
  });

  it("falls, and names what is missing, when a deliverable was not produced", () => {
    const grade = gradePack({
      requested: ["plan", "budget", "invitation"],
      artifacts: [artifact({ kind: "plan" }), artifact({ kind: "budget" })],
      contract: contract(),
    });
    expect(grade.completeness).toBe(67);
    expect(grade.pass).toBe(false);
    expect(grade.notes.join(" ")).toContain("invitation");
  });

  it("does not count an undelivered stub as delivered", () => {
    const grade = gradePack({
      requested: ["plan", "invitation"],
      artifacts: [
        artifact({ kind: "plan" }),
        artifact({ kind: "invitation", undelivered: { code: "image_provider:quota", message: "capped" } as never }),
      ],
      contract: contract(),
    });
    expect(grade.completeness).toBe(50);
  });
});

describe("cross-artifact consistency", () => {
  it("passes when the artifacts agree on the occasion date", () => {
    const grade = gradePack({
      requested: ["plan", "schedule"],
      artifacts: [
        artifact({ kind: "plan", data: JSON.stringify({ date: "2026-07-18" }) }),
        artifact({ kind: "schedule", data: JSON.stringify({ startLocal: "2026-07-18T18:00" }) }),
      ],
      contract: contract({ date: "2026-07-18" }),
    });
    expect(grade.cross_artifact_consistency).toBe(100);
  });

  it("catches an artifact that names a DIFFERENT date than the occasion", () => {
    // The invitation says the 19th; the occasion is the 18th. Neither artifact fails on its
    // own — the contradiction only exists between them.
    const grade = gradePack({
      requested: ["plan", "invitation"],
      artifacts: [
        artifact({ kind: "plan", data: JSON.stringify({ date: "2026-07-18" }) }),
        artifact({ kind: "invitation", data: "You're invited on 2026-07-19." }),
      ],
      contract: contract({ date: "2026-07-18" }),
    });
    expect(grade.cross_artifact_consistency).toBeLessThan(70);
    expect(grade.pass).toBe(false);
    expect(grade.notes.join(" ")).toContain("2026-07-18");
  });
});

describe("brief satisfaction", () => {
  it("is the fraction of delivered, graded artifacts that passed", () => {
    const grade = gradePack({
      requested: ["plan", "budget"],
      artifacts: [
        artifact({ kind: "plan", tribunal: { pass: true } as never }),
        artifact({ kind: "budget", tribunal: { pass: false } as never }),
      ],
      contract: contract(),
    });
    expect(grade.brief_satisfaction).toBe(50);
  });

  it("a clean, complete, consistent, all-passing pack passes as a whole", () => {
    const grade = gradePack({
      requested: ["plan", "budget"],
      artifacts: [
        artifact({ kind: "plan", data: JSON.stringify({ date: "2026-07-18" }), tribunal: passing }),
        artifact({ kind: "budget", tribunal: passing }),
      ],
      contract: contract({ date: "2026-07-18" }),
    });
    expect(grade.pass).toBe(true);
    expect(grade.completeness).toBe(100);
    expect(grade.brief_satisfaction).toBe(100);
  });
});

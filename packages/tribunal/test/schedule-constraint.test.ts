/**
 * THE TRIBUNAL HAS TO CATCH A BROKEN PROMISE.
 *
 * A paid anniversary lunch shipped scheduled 18:00–21:25 against a brief that said eleven
 * guests could not arrive before 12:30 and the family needed to be finished by 19:30. Both
 * sentences were in the request they paid for. Nothing caught it — the overlap check saw no
 * overlaps, the critic liked the prose, and the plan went out contradicting two facts its own
 * buyer had supplied.
 *
 * "A plan that ignores a stated requirement is the kind of failure the Tribunal exists to
 * catch, and it isn't catching it." So it is a hard check now, and it quotes the buyer back.
 */
import { describe, expect, it } from "vitest";
import { checkScheduleConstraint } from "../src/checks.js";
import { artifact, contract } from "./fixtures.js";

/** A running order with explicit local wall-clock times, as the pipeline emits them. */
const schedule = (
  items: Array<[start: string, end: string]>,
  constraints?: { earliestStartLocal?: string; latestEndLocal?: string; statedIn?: string[] },
) =>
  artifact({
    kind: "schedule",
    format: "json",
    title: "Running order",
    data: JSON.stringify({
      occasion: "Anniversary lunch",
      city: "Trieste",
      timezone: "Europe/Rome",
      notes: [],
      ...(constraints ? { constraints: { statedIn: [], ...constraints } } : {}),
      items: items.map(([startLocal, endLocal], index) => ({
        title: `Block ${index + 1}`,
        start: `2026-10-17T${startLocal}:00.000Z`,
        end: `2026-10-17T${endLocal}:00.000Z`,
        startLocal,
        endLocal,
      })),
    }),
  });

const run = (art: ReturnType<typeof schedule>) =>
  checkScheduleConstraint({ artifact: art, contract: contract() });

describe("a schedule may not cross a bound the client stated", () => {
  it("fails the Trieste plan that shipped", async () => {
    const result = await run(
      schedule(
        [
          ["18:00", "19:30"],
          ["19:30", "21:25"],
        ],
        {
          earliestStartLocal: "12:30",
          latestEndLocal: "19:30",
          statedIn: [
            "Eleven guests travel from Ljubljana and cannot arrive before 12:30",
            "The family want to be finished by 19:30",
          ],
        },
      ),
    );

    expect(result.passed).toBe(false);
    expect(result.hard).toBe(true);
    // It must quote the buyer's own sentence, not paraphrase it.
    expect(result.evidence.join(" ")).toContain("Ljubljana");
    expect(result.evidence.join(" ")).toContain("21:25");
  });

  it("fails a start before guests can arrive", async () => {
    const result = await run(
      schedule([["11:00", "13:00"]], { earliestStartLocal: "12:30" }),
    );
    expect(result.passed).toBe(false);
    expect(result.evidence.join(" ")).toContain("11:00");
  });

  it("fails an overrun past the stated finish", async () => {
    const result = await run(
      schedule([["18:00", "22:30"]], { latestEndLocal: "22:00" }),
    );
    expect(result.passed).toBe(false);
    expect(result.evidence.join(" ")).toContain("22:30");
  });

  it("passes a running order that sits inside both bounds", async () => {
    const result = await run(
      schedule(
        [
          ["12:30", "14:00"],
          ["14:00", "16:00"],
        ],
        { earliestStartLocal: "12:30", latestEndLocal: "19:30" },
      ),
    );
    expect(result.passed).toBe(true);
    expect(result.detail).toContain("12:30");
  });

  it("passes, without inventing a bound, when the brief stated none", async () => {
    const result = await run(schedule([["18:00", "21:25"]]));
    expect(result.passed).toBe(true);
    expect(result.detail).toContain("no timing bound");
  });

  it("abstains rather than passing when the payload cannot be read", async () => {
    const unreadable = artifact({ kind: "schedule", format: "json", data: "{ not json" });
    const result = await checkScheduleConstraint({ artifact: unreadable, contract: contract() });
    expect(result.skipped).toBe(true);
  });

  it("ignores artifacts that are not schedules", async () => {
    const result = await checkScheduleConstraint({
      artifact: artifact({ kind: "toast", format: "md", data: "To Amalia." }),
      contract: contract(),
    });
    expect(result.passed).toBe(true);
  });
});

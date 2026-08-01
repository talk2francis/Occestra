/**
 * A LUNCH THAT STARTS AT 18:00.
 *
 * Every schedule anchored at 18:00. For a dinner that is correct, which is exactly why it
 * survived: nobody looks twice at a dinner starting at six. But the same anchor put a paid
 * anniversary LUNCH in Trieste at 18:00–21:25, an 80th birthday AFTERNOON TEA at 18:00, and in
 * that Trieste plan it silently crossed two bounds the buyer had typed into the brief — eleven
 * guests arriving from Ljubljana who could not be there before 12:30, and a family who needed
 * to be finished by 19:30 so the older guests could travel home.
 *
 * The second half is the one that matters. A plan that ignores a stated requirement is worse
 * than a vague plan, because the buyer supplied the very fact it broke.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_START_MINUTES,
  occasionStartMinutes,
  parseClockMinutes,
  parseTimingBounds,
  resolveStartMinutes,
} from "../src/occasion-time.js";

const at = (h: number, m = 0) => h * 60 + m;

describe("the occasion says when it starts", () => {
  it("reads the meal out of the occasion", () => {
    const cases: Array<[string, number]> = [
      ["Anniversary lunch for eighteen", at(12, 30)],
      ["80th birthday afternoon tea", at(15, 30)],
      ["Sunday brunch for the team", at(11)],
      ["Farewell breakfast", at(8, 30)],
      ["Retirement dinner for Amalia", at(18)],
      ["Drinks reception before the show", at(17, 30)],
    ];
    for (const [occasion, expected] of cases) {
      expect(occasionStartMinutes(occasion)?.minutes, occasion).toBe(expected);
    }
  });

  it("prefers the more specific phrase — 'afternoon tea' is not 'tea' by accident", () => {
    expect(occasionStartMinutes("A grand afternoon tea")?.minutes).toBe(at(15, 30));
  });

  it("leaves 18:00 alone when no mealtime is named", () => {
    expect(occasionStartMinutes("Housewarming")).toBeUndefined();
    expect(
      resolveStartMinutes({ occasion: "Housewarming", lines: [], totalMinutes: 180 }).minutes,
    ).toBe(DEFAULT_START_MINUTES);
  });
});

describe("clock literals", () => {
  it("reads the shapes people actually write", () => {
    expect(parseClockMinutes("12:30")).toBe(at(12, 30));
    expect(parseClockMinutes("7.30pm")).toBe(at(19, 30));
    expect(parseClockMinutes("2pm")).toBe(at(14));
    expect(parseClockMinutes("19:30")).toBe(at(19, 30));
    expect(parseClockMinutes("noon")).toBe(at(12));
    expect(parseClockMinutes("midnight")).toBe(0);
  });

  it("refuses a bare number, because '7 guests' is not 07:00", () => {
    expect(parseClockMinutes("7")).toBeUndefined();
    expect(parseClockMinutes("34")).toBeUndefined();
    expect(parseClockMinutes("half past six")).toBeUndefined();
  });
});

describe("a stated bound is a bound, not colour", () => {
  it("reads the Trieste brief the way its buyer meant it", () => {
    const bounds = parseTimingBounds([
      "Eleven guests travel from Ljubljana and cannot arrive before 12:30",
      "The family want to be finished by 19:30 so the older guests can travel home",
    ]);

    expect(bounds.earliestStartMinutes).toBe(at(12, 30));
    expect(bounds.latestEndMinutes).toBe(at(19, 30));
    // The buyer's own sentences are kept so a failure can quote them rather than paraphrase.
    expect(bounds.evidence.join(" ")).toContain("Ljubljana");
  });

  it("reads other common phrasings", () => {
    expect(parseTimingBounds(["nothing before 11:00"]).earliestStartMinutes).toBe(at(11));
    expect(parseTimingBounds(["everyone out by 22:00"]).latestEndMinutes).toBe(at(22));
    expect(parseTimingBounds(["speeches must be finished before 22:00"]).latestEndMinutes).toBe(at(22));
    expect(parseTimingBounds(["doors at 7.30pm"]).explicitStartMinutes).toBe(at(19, 30));
  });

  it("stays quiet when nothing was stated", () => {
    const bounds = parseTimingBounds(["candlelit, unfussy, warm", "no amplified music"]);
    expect(bounds.earliestStartMinutes).toBeUndefined();
    expect(bounds.latestEndMinutes).toBeUndefined();
  });
});

describe("resolving the start", () => {
  it("fixes the Trieste plan: a lunch, held to the arrival floor, finished in time", () => {
    const resolved = resolveStartMinutes({
      occasion: "Anniversary lunch in Trieste",
      lines: [
        "Eleven guests travel from Ljubljana and cannot arrive before 12:30",
        "We must be finished by 19:30",
      ],
      totalMinutes: 205, // the 18:00–21:25 running order that shipped
    });

    expect(resolved.minutes).toBe(at(12, 30));
    expect(resolved.minutes + 205).toBeLessThanOrEqual(at(19, 30));
    expect(resolved.reason).toContain("lunch");
  });

  it("pulls the whole thing earlier when a finish time demands it", () => {
    const resolved = resolveStartMinutes({
      occasion: "Retirement dinner",
      lines: ["Everything must be over by 21:00"],
      totalMinutes: 240,
    });
    expect(resolved.minutes).toBe(at(17)); // 21:00 minus four hours, not 18:00
  });

  it("never starts before guests can physically arrive, even to meet a finish time", () => {
    // Impossible on its face: 12:30 earliest, 15:00 latest end, but four hours of programme.
    const resolved = resolveStartMinutes({
      occasion: "Lunch",
      lines: ["nobody can arrive before 12:30", "must be finished by 15:00"],
      totalMinutes: 240,
    });

    // The arrival floor wins — we do not invent an earlier start nobody could attend. The
    // overrun is left visible so SCHEDULE_CONSTRAINT fails it and quotes the brief.
    expect(resolved.minutes).toBe(at(12, 30));
    expect(resolved.bounds.latestEndMinutes).toBe(at(15));
  });

  it("an explicit stated start outranks the occasion's own shape", () => {
    const resolved = resolveStartMinutes({
      occasion: "Anniversary lunch",
      lines: ["The restaurant can only seat us from 14:00"],
      totalMinutes: 120,
    });
    expect(resolved.bounds.earliestStartMinutes).toBe(at(14));
    expect(resolved.minutes).toBe(at(14));
  });
});

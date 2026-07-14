/**
 * PLACEHOLDER_TEXT — the hard check.
 *
 * Both cases below are real. The model invented "Starting at $49 per event" for a product
 * whose tools cost cents; the fabrication filter swapped the number for [YOUR PRICE HERE],
 * and the pack then SHIPPED carrying that bracket. And once, told to write that placeholder
 * where a price belongs, the model put it in a call to action: "Visit us at [YOUR PRICE HERE]".
 *
 * Unfinished text delivered to a buyer reads as deliberate, which is worse than saying less.
 * So no critic score may argue it away: this is hard.
 */
import { describe, expect, it } from "vitest";
import { checkPlaceholderText } from "../src/checks.js";

const artifact = (data?: string, format = "md") =>
  ({
    id: "launch_thread",
    kind: "launch_thread",
    title: "Thread",
    format,
    sources: [],
    version: 1 as const,
    ...(data === undefined ? {} : { data }),
  }) as never;

const run = (data?: string, format = "md") =>
  checkPlaceholderText({
    artifact: artifact(data, format),
    contract: {} as never,
    deps: {} as never,
  } as never);

describe("checkPlaceholderText", () => {
  it("fails hard on the bracket that actually shipped", async () => {
    const result = await run("Occestra makes keepsakes. Pricing starts at [YOUR PRICE HERE].");
    expect(result.passed).toBe(false);
    expect(result.hard).toBe(true);
  });

  it("fails on the misused placeholder that landed in a call to action", async () => {
    const result = await run("Try it today. Visit us at [YOUR PRICE HERE]");
    expect(result.passed).toBe(false);
  });

  it("catches the whole family of unfinished text", async () => {
    for (const bad of [
      "Price: TBD",
      "Contact us at [INSERT EMAIL]",
      "Put your headline here and ship it",
      "Lorem ipsum dolor sit amet",
      "Pricing: coming soon",
      "Revenue was XXX last quarter",
    ]) {
      const result = await run(bad);
      expect(result.passed, `should have caught: ${bad}`).toBe(false);
    }
  });

  it("does NOT fire on legitimate brackets — markdown links are not placeholders", async () => {
    const result = await run(
      "Read [the published standard](https://occestra.xyz/standard) before you buy. It costs 0.01 USDT.",
    );
    expect(result.passed).toBe(true);
  });

  it("does not fire on ordinary prose that merely contains the word 'here'", async () => {
    const result = await run("Everything here is graded before you see it. Here is the rubric.");
    expect(result.passed).toBe(true);
  });

  it("skips artifacts that carry no text at all, rather than failing them", async () => {
    const result = await run(undefined);
    expect(result.passed).toBe(true); // skip, not fail — an image has no copy to check
  });

  /**
   * THE FALSE POSITIVE THAT HARD-FAILED A GOOD PLAN ON ITS FIRST LIVE RUN.
   *
   * The first version of the bracket rule fired on any bracketed capitals — so it matched
   * the JSON the plan is MADE of: `[{"text":"Aqui há Peixe — 18A Rua da Trindade..."`.
   * Brackets are syntax in JSON and links in markdown. "Shouting" is not evidence.
   */
  describe("the plan that this check wrongly killed", () => {
    // Verbatim shape from pack oce_01kxgpantjtm9a6ve9qf22, 2026-07-14.
    const plan = JSON.stringify({
      summary: "Make her feel genuinely celebrated by the people who watched her grow.",
      constraints: ["NO STAIRS", "ONE GUEST IS VEGAN"],
      claims: [{ text: "Aqui há Peixe — 18A Rua da Trindade, Lisboa, 1200-466", source: "openstreetmap" }],
    });

    it("does not fire on the brackets and capitals that JSON is built from", async () => {
      const result = await run(plan, "json");
      expect(result.passed).toBe(true);
    });

    it("still catches a real placeholder INSIDE a JSON value", async () => {
      const bad = JSON.stringify({ budget: { note: "Venue deposit: [YOUR PRICE HERE]" } });
      const result = await run(bad, "json");
      expect(result.passed).toBe(false);
      expect(result.hard).toBe(true);
    });
  });
});

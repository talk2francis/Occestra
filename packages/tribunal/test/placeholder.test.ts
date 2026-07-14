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

const artifact = (data?: string) =>
  ({
    id: "launch_thread",
    kind: "launch_thread",
    title: "Thread",
    format: "md",
    sources: [],
    version: 1 as const,
    ...(data === undefined ? {} : { data }),
  }) as never;

const run = (data?: string) =>
  checkPlaceholderText({ artifact: artifact(data), contract: {} as never, deps: {} as never } as never);

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
});

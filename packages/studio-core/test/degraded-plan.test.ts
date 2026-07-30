/**
 * THE TWO WAYS A PAID PLAN CAME BACK WRONG.
 *
 * A buyer paid 0.30 for an anniversary lunch in Trieste on 2026-07-29 and got a plan that was
 * honest about being useless. Two independent defects, both fixed here:
 *
 *   1. The planner's reply died mid-array — "Expected ',' or ']' … at position 2492" — and the
 *      pipeline gave up after a single repair, shipping a generic shape instead of the buyer's
 *      occasion. A truncated reply is the common failure and most of it is perfectly good; the
 *      unfinished tail is the only part worth discarding.
 *
 *   2. "Trieste" was not in the timezone table, so the running order was emitted in UTC and a
 *      LUNCH appeared as 18:00–21:25 on the artifact the buyer would hand to guests. The
 *      fallback said so in the notes, which is honest, but honest and wrong still ruins it.
 */
import { describe, expect, it } from "vitest";
import { closeTruncatedJson } from "../src/pipelines/celebrate.js";
import { zoneFor } from "../src/zones.js";

describe("a truncated model reply is salvaged, not thrown away", () => {
  it("drops the unfinished element and keeps the complete ones", () => {
    const truncated = '{"throughline":"A quiet lunch","blocks":[{"t":"Arrival"},{"t":"Lunch"},{"t":"Toa';
    const salvaged = closeTruncatedJson(truncated);

    expect(salvaged).toBeDefined();
    const parsed = JSON.parse(salvaged as string) as { blocks: unknown[] };
    expect(parsed.blocks).toHaveLength(2);
  });

  it("closes what was open at the REWIND point, not at the end of the truncation", () => {
    // The half-written third object must not contribute its brace to the repair.
    const salvaged = closeTruncatedJson('{"x":{"y":[{"z":1},{"z":2},{"z"');
    expect(JSON.parse(salvaged as string)).toEqual({ x: { y: [{ z: 1 }, { z: 2 }] } });
  });

  it("survives a truncation that lands inside a string", () => {
    // The usual shape of a cut-off reply, and it used to veto the salvage entirely.
    expect(JSON.parse(closeTruncatedJson('{"a":1,"b":"unfinis') as string)).toEqual({ a: 1 });
  });

  it("never returns something that does not parse", () => {
    const inputs = [
      '{"a":1,"blocks":[{"t":"one"},{"t":"two"},{"t":"thr',
      '{"a":1,"b":[1,2,',
      '[{"a":1},{"a":2},{"a"',
      '{"deep":{"deeper":{"deepest":["x","y","z',
      '{"escaped":"a \\" quote","next":[1,2,3},',
    ];

    for (const input of inputs) {
      const out = closeTruncatedJson(input);
      if (out !== undefined) expect(() => JSON.parse(out), input).not.toThrow();
    }
  });

  it("declines to salvage what is already whole, or is not JSON at all", () => {
    expect(closeTruncatedJson('{"a":1}')).toBeUndefined();
    expect(closeTruncatedJson("not json at all")).toBeUndefined();
  });
});

describe("the occasion's timezone", () => {
  it("resolves Trieste — the city that turned a lunch into an evening", () => {
    expect(zoneFor("Trieste")).toBe("Europe/Rome");
  });

  it("falls back to the country when only the country is recognisable", () => {
    expect(zoneFor("Trieste, Italy")).toBe("Europe/Rome");
    expect(zoneFor("a village in Portugal")).toBe("Europe/Lisbon");
  });

  it("still refuses to guess when it genuinely does not know", () => {
    // Undefined is a legitimate answer; the pipeline says so in the artifact. A guessed zone
    // would silently move every time on the page, which is worse than admitting ignorance.
    expect(zoneFor("Nowhereville")).toBeUndefined();
  });

  it("does not invent a single zone for countries that span several", () => {
    expect(zoneFor("somewhere in the United States")).toBeUndefined();
    expect(zoneFor("regional Australia")).toBeUndefined();
  });

  it("keeps resolving the cities it already served", () => {
    expect(zoneFor("Porto")).toBe("Europe/Lisbon");
    expect(zoneFor("Lisbon")).toBe("Europe/Lisbon");
    expect(zoneFor("Lagos")).toBe("Africa/Lagos");
    expect(zoneFor("New York")).toBe("America/New_York");
  });
});

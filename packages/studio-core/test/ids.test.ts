import { describe, expect, it } from "vitest";
import {
  CROCKFORD_LOWER,
  KEEPSAKE_ID_REGEX,
  isKeepsakeId,
  keepsakeIdTime,
  newKeepsakeId,
} from "../src/ids.js";

describe("keepsake ids", () => {
  it("matches the published format: oce_ + 22 crockford chars", () => {
    const id = newKeepsakeId(1_752_000_000_000);
    expect(id).toMatch(KEEPSAKE_ID_REGEX);
    expect(id.startsWith("oce_")).toBe(true);
    expect(id).toHaveLength(4 + 22);
    for (const ch of id.slice(4)) {
      expect(CROCKFORD_LOWER).toContain(ch);
    }
    // Crockford excludes i, l, o, u — no ambiguous characters may ever appear.
    expect(id.slice(4)).not.toMatch(/[ilou]/);
  });

  it("sorts lexicographically by time, and round-trips the timestamp", () => {
    const early = newKeepsakeId(1_700_000_000_000);
    const mid = newKeepsakeId(1_752_000_000_000);
    const late = newKeepsakeId(1_752_000_000_001);

    expect([late, early, mid].sort()).toEqual([early, mid, late]);
    expect(keepsakeIdTime(mid)).toBe(1_752_000_000_000);
    expect(keepsakeIdTime(late)).toBe(1_752_000_000_001);
  });

  it("rejects malformed ids and never collides", () => {
    expect(isKeepsakeId("oce_short")).toBe(false);
    expect(isKeepsakeId("xyn_0123456789abcdefghjkmn")).toBe(false);
    expect(isKeepsakeId("oce_0123456789ABCDEFGHJKMN")).toBe(false); // uppercase
    expect(isKeepsakeId(42)).toBe(false);
    expect(() => keepsakeIdTime("nope")).toThrow();
    expect(() => newKeepsakeId(-1)).toThrow(RangeError);

    const minted = new Set(Array.from({ length: 2_000 }, () => newKeepsakeId(1_752_000_000_000)));
    expect(minted.size).toBe(2_000);
  });
});

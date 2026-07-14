/**
 * The hour that would have sent everybody to dinner early.
 *
 * The schedule anchored every occasion at `${date}T18:00:00.000Z` while the comment beside
 * it claimed "18:00 local-ish". Those are not the same thing, and the code knew it. Lisbon
 * in August is UTC+1, so 18:00Z renders as 19:00 on a guest's phone — an hour of ten people
 * standing outside a restaurant that is not expecting them yet.
 *
 * The Tribunal caught it on a real paid run. A plan whose times are wrong is not a plan.
 */
import { describe, expect, it } from "vitest";
import { localTimeToInstant, wallClock, zoneFor } from "../src/zones.js";

describe("zoneFor", () => {
  it("knows where the cities we actually serve are", () => {
    expect(zoneFor("Lisbon")).toBe("Europe/Lisbon");
    expect(zoneFor("Lagos")).toBe("Africa/Lagos");
    expect(zoneFor("New York")).toBe("America/New_York");
    expect(zoneFor("Tokyo")).toBe("Asia/Tokyo");
  });

  it("says nothing rather than guessing — a guessed timezone is a guessed exchange rate", () => {
    expect(zoneFor("Narnia")).toBeUndefined();
  });
});

describe("localTimeToInstant — 18:00 on the clock in THAT city", () => {
  it("anchors a Lisbon dinner at 18:00 LOCAL, which is 17:00 UTC in August (WEST, UTC+1)", () => {
    const instant = localTimeToInstant("2026-08-08", 18, "Europe/Lisbon");

    // The bug: the old code produced 18:00Z. The truth is 17:00Z.
    expect(new Date(instant).toISOString()).toBe("2026-08-08T17:00:00.000Z");
    // And what the guest reads is 18:00, which is what we promised them.
    expect(wallClock(instant, "Europe/Lisbon")).toBe("18:00");
  });

  it("gets WINTER right too, when the same city is at UTC+0", () => {
    const instant = localTimeToInstant("2026-01-10", 18, "Europe/Lisbon");
    expect(new Date(instant).toISOString()).toBe("2026-01-10T18:00:00.000Z");
    expect(wallClock(instant, "Europe/Lisbon")).toBe("18:00");
  });

  it("holds across the world, and across the date line", () => {
    // Tokyo is UTC+9 and has no DST: 18:00 local is 09:00Z.
    expect(new Date(localTimeToInstant("2026-08-08", 18, "Asia/Tokyo")).toISOString()).toBe(
      "2026-08-08T09:00:00.000Z",
    );
    // New York in August is EDT (UTC−4): 18:00 local is 22:00Z, same day.
    expect(new Date(localTimeToInstant("2026-08-08", 18, "America/New_York")).toISOString()).toBe(
      "2026-08-08T22:00:00.000Z",
    );
    // Lagos is UTC+1, no DST.
    expect(wallClock(localTimeToInstant("2026-08-08", 18, "Africa/Lagos"), "Africa/Lagos")).toBe(
      "18:00",
    );
  });

  it("survives a DST boundary — the correction is applied twice for exactly this", () => {
    // Europe springs forward on 2026-03-29. An evening on that date is already at UTC+1.
    const instant = localTimeToInstant("2026-03-29", 18, "Europe/Lisbon");
    expect(wallClock(instant, "Europe/Lisbon")).toBe("18:00");
  });

  it("reads back the guest's clock for any instant we hand it", () => {
    const start = localTimeToInstant("2026-08-08", 18, "Europe/Lisbon");
    const twoHoursLater = start + 2 * 60 * 60 * 1000;
    expect(wallClock(twoHoursLater, "Europe/Lisbon")).toBe("20:00");
  });
});

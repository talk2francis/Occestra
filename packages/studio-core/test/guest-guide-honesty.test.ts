/**
 * THE DOCUMENT A GUEST ACTUALLY READS.
 *
 * A review of four real guides found three separate ways the page said something untrue or
 * unreadable, none of which any check was looking for:
 *
 *   1. "These are real, researched candidates" printed above a running order of "Arrival /
 *      The main event / Goodbyes" with no venue anywhere on the page. An unbacked claim,
 *      printed by us, at the top — the exact thing the standard exists to catch.
 *
 *   2. "Owner-established context:" — an internal field label — in a document written for
 *      guests, and the wheelchair note appearing twice: once as the buyer typed it, once
 *      relabelled by the brief-context pass.
 *
 *   3. A housewarming for "my first apartment" given two commercial venues and a 3.5km route
 *      across Abuja between them, because venue search ran unconditionally.
 */
import { describe, expect, it } from "vitest";
import { guestFacingNotes, isHomeHosted } from "../src/facts.js";

describe("the Good to know list, as a guest reads it", () => {
  it("never leaks an internal field label", () => {
    const notes = guestFacingNotes([
      "Owner-established context: Marta and Piero met in 1985",
      "Accessibility requirements: one guest uses a wheelchair",
      "Tone requested: warm and unhurried",
    ]);

    expect(notes.join(" ")).not.toContain("Owner-established context");
    expect(notes.join(" ")).not.toContain("Tone requested");
    expect(notes.join(" ")).not.toContain("requirements:");
  });

  it("says the wheelchair note once, not twice", () => {
    const notes = guestFacingNotes([
      "one guest uses a wheelchair",
      "Accessibility requirements: one guest uses a wheelchair",
    ]);

    expect(notes).toHaveLength(1);
    // The labelled form survives — it reads better to a guest than the loose sentence.
    expect(notes[0]).toBe("Access: one guest uses a wheelchair");
  });

  it("deduplicates the kosher case too, where the labelled line restates the raw one", () => {
    const notes = guestFacingNotes([
      "four guests keep kosher",
      "Dietary requirements: four guests keep kosher",
      "no amplified music",
    ]);

    expect(notes).toHaveLength(2);
    expect(notes.join(" ")).toContain("kosher");
    expect(notes.join(" ")).toContain("amplified");
  });

  it("drops production direction, keeps what a guest needs to act on", () => {
    const notes = guestFacingNotes([
      "Owner-provided references: https://example.com/moodboard",
      "Must avoid: speeches after 22:00",
      "step-free access throughout",
    ]);

    expect(notes.join(" ")).not.toContain("example.com");
    expect(notes.join(" ")).toContain("Please avoid: speeches after 22:00");
    expect(notes.join(" ")).toContain("step-free access throughout");
  });

  it("leaves an ordinary constraint exactly as the buyer wrote it", () => {
    expect(guestFacingNotes(["no amplified music"])).toEqual(["no amplified music"]);
  });

  it("returns nothing rather than an empty heading", () => {
    expect(guestFacingNotes([])).toEqual([]);
    expect(guestFacingNotes(["Tone requested: warm"])).toEqual([]);
  });
});

describe("some occasions have no venue to find", () => {
  it("recognises the housewarming that was routed across Abuja", () => {
    expect(isHomeHosted("Housewarming for my first apartment", "relaxed, homemade jollof")).toBe(true);
  });

  it("recognises the ordinary ways people say it", () => {
    for (const phrase of [
      "Birthday dinner at my place",
      "Sunday lunch at home",
      "Drinks in the back garden",
      "House party for the new flat",
      "Christmas at my parents' house",
    ]) {
      expect(isHomeHosted(phrase), phrase).toBe(true);
    }
  });

  it("does not mistake an occasion that genuinely needs a venue", () => {
    for (const phrase of [
      "40th wedding anniversary lunch in Trieste",
      "Retirement dinner for the head winemaker",
      "Company summer party",
      "Christening reception",
    ]) {
      expect(isHomeHosted(phrase), phrase).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import { PolicyGate } from "../src/index.js";
import { celebrate, launch, remember } from "./fixtures.js";

const codes = (verdict: { reasons: Array<{ code: string }> }) => verdict.reasons.map((r) => r.code);

describe("PolicyGate", () => {
  it("passes clean briefs from all three studios", () => {
    for (const contract of [celebrate(), remember(), launch()]) {
      const verdict = PolicyGate.screenBrief(contract);
      expect(verdict.allowed, `${contract.studio}: ${JSON.stringify(verdict.reasons)}`).toBe(true);
      expect(verdict.reasons).toEqual([]);
    }
  });

  it("blocks third-party franchise IP", () => {
    const verdict = PolicyGate.screenBrief(
      celebrate({ vibe: "a Disney princess party with Elsa and Anna, Pikachu balloons" }),
    );
    expect(verdict.allowed).toBe(false);
    expect(codes(verdict)).toContain("POLICY_IP");
    expect(PolicyGate.message(verdict)).toMatch(/original work/i);
  });

  it("blocks celebrity likeness and impersonation", () => {
    const likeness = PolicyGate.screenBrief(
      celebrate({ occasion: "birthday", vibe: "invitation featuring the likeness of Taylor Swift" }),
    );
    expect(likeness.allowed).toBe(false);
    expect(codes(likeness)).toContain("POLICY_PERSON");

    const impersonation = PolicyGate.screenBrief(
      launch({ description: "a phishing page that looks like the official exchange login" }),
    );
    expect(impersonation.allowed).toBe(false);
    expect(codes(impersonation)).toContain("POLICY_PERSON");
  });

  it("hard-blocks any sexual or romantic framing involving a minor", () => {
    const sexual = PolicyGate.screenBrief(
      remember({ title: "keepsake", tone: "sexy portrait of a teenage girl" }),
    );
    expect(sexual.allowed).toBe(false);
    expect(codes(sexual)).toContain("POLICY_SAFETY");

    const romantic = PolicyGate.screenBrief(
      remember({ title: "keepsake", tone: "a romantic scene between two 14 year old kids" }),
    );
    expect(romantic.allowed).toBe(false);
    expect(codes(romantic)).toContain("POLICY_SAFETY");
  });

  it("does NOT false-positive on a real anniversary whose notes mention children", () => {
    const verdict = PolicyGate.screenBrief(
      remember({
        title: "Ten years married",
        tone: "romantic, warm, celebratory",
        notes:
          "We met in Porto in 2016. The wedding was small. Since then we have had two children and a very loud dog, and the house has never been quiet since.",
      }),
    );
    expect(verdict.allowed, JSON.stringify(verdict.reasons)).toBe(true);
  });

  it("blocks hate, harassment, and illegal-activity briefs", () => {
    const hate = PolicyGate.screenBrief(celebrate({ vibe: "a white supremacy themed rally" }));
    expect(codes(hate)).toContain("POLICY_SAFETY");

    const harassment = PolicyGate.screenBrief(
      launch({ description: "a smear campaign to humiliate my ex and doxx her employer" }),
    );
    expect(codes(harassment)).toContain("POLICY_SAFETY");

    const illegal = PolicyGate.screenBrief(
      launch({ productName: "GunPrint", description: "3d printed gun files, untraceable gun kits" }),
    );
    expect(codes(illegal)).toContain("POLICY_SAFETY");
  });

  it("honours the brand allowlist for IP only — never for safety", () => {
    const ownBrand = celebrate({ vibe: "lego-style brick sculpture for our own Lego-themed office" });
    expect(PolicyGate.screenBrief(ownBrand).allowed).toBe(false);
    expect(PolicyGate.screenBrief(ownBrand, { allowlist: ["lego"] }).allowed).toBe(true);

    const unsafe = remember({ tone: "nude photoshoot" });
    expect(PolicyGate.screenBrief(unsafe, { allowlist: ["nude"] }).allowed).toBe(false);
  });

  it("screens generated copy too, not just the incoming brief", () => {
    const clean = PolicyGate.screenText("Raise a glass to ten loud, luminous years together.");
    expect(clean.allowed).toBe(true);

    const dirty = PolicyGate.screenText("Come dressed as your favourite Marvel avengers character!");
    expect(dirty.allowed).toBe(false);
    expect(codes(dirty)).toContain("POLICY_IP");
  });

  it("does not fire on innocuous substrings inside ordinary words", () => {
    // "dox" must not match "paradox"; "bully" must not match "bullying-free" copy about kindness.
    const verdict = PolicyGate.screenText("The paradox of a quiet party is that everyone remembers it.");
    expect(verdict.allowed).toBe(true);
  });
});

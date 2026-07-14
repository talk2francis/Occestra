/**
 * THE STANDING RULE: every deterministic check must be exercised against a clean JSON
 * artifact, a clean markdown artifact, and clean prose — and must not fire on any of them.
 *
 * This exists because PLACEHOLDER_TEXT shipped with a rule that matched any bracketed
 * capitals. It was written and tested against markdown, where `[YOUR PRICE HERE]` is the
 * enemy. Nobody ran it against JSON — where a bracket is *syntax*. On its first live run it
 * hard-failed a perfectly good Celebrate plan by matching the plan's own structure:
 *
 *   [{"text":"Aqui há Peixe — 18A Rua da Trindade, Lisboa, 1200-466"
 *
 * A hard check that fires on correct work is worse than no check: it destroys good packs
 * and teaches everyone to distrust the grade. So every check now faces every format it can
 * legally be handed, and a false positive is a test failure.
 *
 * Adding a check to CHECKS without adding it here is a build error, by construction — the
 * table below is keyed off CHECKS itself.
 */
import { describe, expect, it } from "vitest";
import { runChecks } from "../src/checks.js";
import { CHECKS } from "../src/rubric.js";
import type { Artifact, OccasionContract } from "@occestra/studio-core";

const contract = {
  id: "c_1",
  studio: "celebrate",
  styleId: "atlas_ink",
  createdAt: "2026-07-14T10:00:00.000Z",
  requester: "agent",
  occasion: "a farewell dinner for a colleague",
  city: "Lisbon",
  date: "2026-08-08",
  headcount: 10,
  vibe: "warm, candlelit, long table",
  constraints: [],
  deliverables: ["plan", "schedule", "budget"],
  locale: "en",
} as unknown as OccasionContract;

/**
 * Clean work, in every shape a studio actually delivers. Every one of these is CORRECT:
 * nothing here should trip a single hard check.
 */
const CLEAN: ReadonlyArray<{ what: string; artifact: Artifact }> = [
  {
    what: "a JSON plan — brackets, braces, CAPS in values, a real address",
    artifact: {
      id: "plan",
      kind: "plan",
      title: "Farewell dinner — the plan",
      format: "json",
      version: 1,
      sources: [
        { source: "openstreetmap", retrievedAt: "2026-07-14T10:00:00.000Z", url: "https://openstreetmap.org" },
      ],
      // A REAL plan payload, valid against PlanPayloadSchema. The point of this fixture is
      // the shape of the DATA — brackets, braces, ALL-CAPS values, an address with digits —
      // all of which the placeholder rule once mistook for unfinished text.
      data: JSON.stringify({
        date: "2026-08-08",
        summary: "Make her feel celebrated by the people who watched her grow. NO STAIRS; one guest is vegan.",
        claims: [
          {
            text: "Aqui há Peixe — 18A Rua da Trindade, Lisboa, 1200-466",
            grounded: true,
            source: {
              source: "openstreetmap",
              retrievedAt: "2026-07-14T10:00:00.000Z",
              url: "https://openstreetmap.org",
            },
          },
        ],
        uncertainties: ["August weather is beyond any real forecast horizon, so none is claimed."],
        prepChecklist: ["Call the venue to confirm the long table", "Confirm the vegan main"],
      }),
    },
  },
  {
    what: "a markdown brand kit — real links, bold, italics, hex codes, snake_case",
    artifact: {
      id: "brand_kit",
      kind: "brand_kit",
      title: "Tidepool — brand genome",
      format: "md",
      version: 1,
      sources: [],
      data: [
        "# Tidepool",
        "",
        "## Positioning",
        "Tidepool batches your notifications so you read them once a day.",
        "",
        "## Palette",
        "**The product's own colours:** #F7F4F0 · #D8D4D3",
        "_Not adopted, and why:_",
        "- `#F7F4F0` — already effectively in the House Style palette",
        "",
        "## Notes",
        "Read [the published standard](https://occestra.xyz/standard). The axes are style_fidelity and platform_fit.",
      ].join("\n"),
    },
  },
  {
    what: "prose — a toast, with an em dash, a quote and a number",
    artifact: {
      id: "toast",
      kind: "toast",
      title: "A toast",
      format: "md",
      version: 1,
      sources: [],
      data: "Nine years ago she asked whether anyone had actually read the brief. Nobody had. She read it — and then she rewrote it, and it was better. Raise a glass.",
    },
  },
];

describe("no deterministic check fires on correct work, in any format", () => {
  for (const { what, artifact } of CLEAN) {
    it(`stays silent on ${what}`, async () => {
      const results = await runChecks({ artifact, contract });

      const wrongly = results.filter((r) => r.hard && !r.passed);
      const detail = wrongly.map((r) => `${r.id}: ${r.detail} ${JSON.stringify(r.evidence ?? [])}`);

      // A hard check that fires on correct work destroys a good pack and teaches everyone
      // to distrust the grade. There is no acceptable number of these except zero.
      expect(wrongly.map((r) => r.id), detail.join("\n")).toEqual([]);
    });
  }

  it("exercises EVERY check in the published rubric — none may go untested against a format", async () => {
    const seen = new Set<string>();
    for (const { artifact } of CLEAN) {
      for (const result of await runChecks({ artifact, contract })) seen.add(result.id);
    }

    // Image-only checks cannot run against text, and say so by being absent. Everything
    // that CAN see a text artifact must have been given all three shapes above.
    const textCapable = CHECKS.filter((c) => !/images/.test(c.scope)).map((c) => c.id);
    for (const id of textCapable) {
      expect(seen.has(id), `${id} was never run against JSON, markdown or prose`).toBe(true);
    }
  });
});

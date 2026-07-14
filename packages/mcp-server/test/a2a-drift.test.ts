/**
 * THE A2A DECLARATION IS A PROMISE, AND NOTHING WAS CHECKING WE COULD KEEP IT.
 *
 * `/a2a/capabilities` tells another agent what Occestra takes on as negotiated work: the task
 * types, the deliverables inside each one, and the price floor. The negotiation skill quotes from
 * it. But the deliverables are just strings in a list, and the things Occestra can actually MAKE
 * are the kind unions in studio-core — two lists, in two packages, with nothing between them.
 *
 * Add a deliverable to the declaration and forget the pipeline, and Occestra has sold, at a
 * negotiated price, a piece of work it cannot produce. It would discover this after taking the
 * money — which, in this codebase, is now a refund and a public debt.
 *
 * The other drift is quieter and worse: **a package that costs less than its own parts.** If the
 * A2A floor ever falls below what the same deliverables cost à la carte from the storefront, we
 * have built an arbitrage against ourselves, and the first agent to notice buys the bundle and
 * resells the pieces.
 */
import { describe, expect, it } from "vitest";
import { CELEBRATE_KINDS, LAUNCH_KINDS, REMEMBER_KINDS } from "@occestra/studio-core";
import { PRICING, TASK_TYPES, capabilities } from "../src/a2a/capability.js";
import { PRICES } from "../src/gate.js";

/** What each studio can actually produce, straight from the schemas the pipelines validate. */
const PRODUCIBLE: Record<string, readonly string[]> = {
  celebrate: CELEBRATE_KINDS,
  remember: REMEMBER_KINDS,
  launch: LAUNCH_KINDS,
};

/** The storefront price of buying a task type's deliverables one at a time. */
const A_LA_CARTE: Record<string, number> = {
  // A full occasion: the plan (which carries schedule, budget, contingency and guest guide),
  // plus the invitation, the toast and the moodboard as separate calls.
  occasion_pack:
    PRICES.oce_plan_occasion + PRICES.oce_design_invite + PRICES.oce_write_toast + PRICES.oce_moodboard,
  launch_pack: PRICES.oce_launch_kit,
  keepsake_commission: PRICES.oce_make_keepsake,
};

describe("the A2A declaration cannot promise work the pipelines cannot do", () => {
  for (const task of TASK_TYPES) {
    it(`${task.id}: every deliverable it sells is one the ${task.studio} studio can actually make`, () => {
      const producible = PRODUCIBLE[task.studio]!;

      for (const deliverable of task.deliverables) {
        expect(
          producible,
          `${task.id} sells "${deliverable}", which the ${task.studio} studio cannot produce`,
        ).toContain(deliverable);
      }
    });

    it(`${task.id}: asks for everything the pipeline REQUIRES before it can quote`, () => {
      // A quote given without the grounding inputs is a quote for work that will come back
      // ungrounded — and ungrounded work fails SOURCE_MISSING, which is a hard check.
      const required = task.parameters.filter((param) => param.required).map((param) => param.name);
      expect(required.length).toBeGreaterThan(0);

      if (task.studio === "celebrate") {
        // Without a city and a date there are no real venues and no real forecast.
        expect(required).toContain("city");
        expect(required).toContain("date");
      }
    });
  }
});

describe("a negotiated package must never cost less than its own parts", () => {
  for (const task of TASK_TYPES) {
    it(`${task.id}: the A2A floor is at or above the à la carte price`, () => {
      const parts = A_LA_CARTE[task.id]!;

      // If a bundle is cheaper than the sum of its pieces, the first agent to notice buys the
      // bundle and resells the pieces. That is not a discount, it is a hole.
      expect(
        PRICING.floor,
        `${task.id} costs ${parts} USDT à la carte, but the A2A floor is only ${PRICING.floor}`,
      ).toBeGreaterThanOrEqual(parts);
    });
  }

  it("the floor covers the measured cost of the most expensive thing it could be asked for", () => {
    // A launch pack is the dearest run we do — $0.5964 of real provider spend (see
    // docs/pricing-rationale.md). A floor beneath that would be a promise to lose money on
    // every negotiation that lands at the bottom of the range.
    expect(PRICING.floor).toBeGreaterThan(0.6);
  });

  it("the tiers ascend, and do not overlap", () => {
    const tiers = [PRICING.tiers.essential, PRICING.tiers.signature, PRICING.tiers.monumental];

    for (const tier of tiers) expect(tier.range[0]).toBeLessThan(tier.range[1]);
    expect(tiers[0]!.range[1]).toBeLessThan(tiers[1]!.range[0]);
    expect(tiers[1]!.range[1]).toBeLessThan(tiers[2]!.range[0]);

    expect(PRICING.tiers.essential.range[0]).toBe(PRICING.floor);
    expect(PRICING.tiers.monumental.range[1]).toBe(PRICING.ceiling);
  });
});

describe("the served declaration IS the declaration", () => {
  it("serves the same task types and pricing the negotiation skill enforces", () => {
    const served = capabilities();

    expect(served.taskTypes).toBe(TASK_TYPES); // the same object, not a copy that can drift
    expect(served.pricing).toBe(PRICING);
    expect(served.standard).toContain("/standard");
    expect(served.agentId).toBe(5213);
  });
});

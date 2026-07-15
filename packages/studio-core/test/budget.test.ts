/**
 * The budget, after the Tribunal caught it lying by omission.
 *
 * Both of these are real. On a paid Celebrate run (pack oce_01kxgpantjtm9a6ve9qf22), the
 * Claude critic failed the budget for two things, and it was right about both:
 *
 *   "USD is used as the currency for a dinner in Lisbon. No rationale or conversion note is
 *    provided. Lisbon transactions would ordinarily be in EUR. Using USD without explanation
 *    is either an error or an undisclosed assumption — either way it is not grounded."
 *
 *   "The brief lists 'contingency' as a required deliverable. No contingency line,
 *    percentage, or reserve amount appears anywhere in this artifact."
 *
 * The fix belongs in the GENERATOR, not in the grader. Lowering the bar so the defect passes
 * would be the cowardly repair.
 */
import { describe, expect, it } from "vitest";
import { BudgetPayloadSchema, runCelebrate, type CelebrateContract } from "../src/index.js";
import type { CelebrateDeps, HouseStyle, TextModelPort } from "../src/index.js";

const style: HouseStyle = {
  id: "atlas_ink",
  name: "Atlas Ink",
  version: "1.0.0",
  promptSystem: "map and ledger",
  palette: ["#F4EFE2", "#3E3428", "#8A6A4B", "#B5623C"],
  typeDirection: "small-caps grotesk",
  negativePrompt: "no gloss",
  seedStrategy: "contract_hash",
  appliesTo: { studios: ["celebrate", "remember", "launch"] },
  bestFor: "test",
  wrongFor: "test",
};

/** Returns a valid work order; the arithmetic under test is ours, never the model's. */
class Planner implements TextModelPort {
  async complete() {
    return {
      model: "fake",
      usdCost: 0,
      text: JSON.stringify({
        throughline: "Send her off properly, with the people who watched her grow.",
        venueQueries: ["tasca with a long table"],
        blocks: [
          { title: "Aperitivo", minutes: 30, venueIndex: null },
          { title: "Dinner", minutes: 120, venueIndex: null },
        ],
        budgetWeights: { "Food and drink": 0.65, Venue: 0.2, Flowers: 0.15 },
        prepChecklist: ["Call the venue to confirm the long table", "Confirm the vegan main"],
        risks: ["The private room may already be taken on a Friday."],
      }),
    };
  }
}

const deps = (): CelebrateDeps => ({
  text: new Planner(),
  image: { async generate() { throw new Error("no images in this test"); } },
  storage: {
    async put(k: string) { return k; },
    async get() { return undefined; },
    async delete() {},
    async signedUrl(k: string) { return k; },
  },
  clock: { now: () => Date.parse("2026-07-14T10:00:00.000Z") },
  styleFor: () => style,
});

const contract = (over: Partial<CelebrateContract> = {}): CelebrateContract =>
  ({
    id: "c_1",
    studio: "celebrate",
    styleId: "atlas_ink",
    createdAt: "2026-07-14T10:00:00.000Z",
    requester: "agent",
    occasion: "a farewell dinner for a colleague leaving to start her own studio",
    city: "Lisbon",
    date: "2026-08-08",
    headcount: 10,
    vibe: "warm, candlelit, long table",
    budgetUsd: 450,
    constraints: [],
    deliverables: ["budget"],
    locale: "en",
    ...over,
  }) as CelebrateContract;

async function budgetOf(over: Partial<CelebrateContract> = {}) {
  const { pack } = await runCelebrate(contract(over), deps());
  const artifact = pack.artifacts.find((a) => a.kind === "budget");
  expect(artifact, "the budget was not produced at all").toBeDefined();
  return BudgetPayloadSchema.parse(JSON.parse(artifact!.data!));
}

describe("the budget the Tribunal failed", () => {
  it("still sums EXACTLY — the reserve must not break the arithmetic", async () => {
    const budget = await budgetOf();
    const sum = budget.lineItems.reduce((n, item) => n + item.amount, 0);
    expect(Math.abs(sum - budget.total)).toBeLessThan(0.01);
  });

  it("holds back a contingency reserve — a budget with no reserve is a wish", async () => {
    const budget = await budgetOf();
    const reserve = budget.lineItems.find((item) => /contingency/i.test(item.label));

    expect(reserve, "no contingency line at all — the exact defect Claude failed us for").toBeDefined();
    expect(reserve!.amount).toBeCloseTo(45, 2); // 10% of 450
  });

  it("says WHY it is in dollars, for a dinner in Lisbon", async () => {
    const budget = await budgetOf({ city: "Lisbon" });
    const notes = budget.notes.join(" ");

    expect(notes).toMatch(/in USD, because that is the currency the budget was given in/i);
    // And it names what the venue will ACTUALLY ask for.
    expect(notes).toContain("EUR");
  });

  it("refuses to invent an exchange rate — a made-up rate is a lie with a decimal point", async () => {
    const budget = await budgetOf({ city: "Lisbon" });
    const notes = budget.notes.join(" ");

    expect(notes).toMatch(/no exchange rate is applied/i);
    // No number pretending to be a rate.
    expect(notes).not.toMatch(/1 USD\s*=|\d+\.\d{2,}\s*EUR/);
  });

  it("says nothing about a foreign currency when there is not one", async () => {
    const budget = await budgetOf({ city: "Austin" });
    expect(budget.notes.join(" ")).not.toMatch(/Venues will quote you in/);
  });

  it("reports the per-head figure — a budget you cannot check per person is not checkable", async () => {
    const budget = await budgetOf();
    expect(budget.perHead).toBeCloseTo(45, 2); // 450 / 10
  });
});

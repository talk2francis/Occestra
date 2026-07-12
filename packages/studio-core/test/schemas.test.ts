import { describe, expect, it } from "vitest";
import {
  ArtifactSchema,
  CelebrateContractSchema,
  LaunchContractSchema,
  OccasionContractSchema,
  PackKindCode,
  PackSchema,
  RememberContractSchema,
} from "../src/index.js";
import { artifact, celebrate, launch, pack, remember } from "./fixtures.js";

describe("occasion contracts", () => {
  it("accepts a well-formed contract from each studio via the discriminated union", () => {
    for (const contract of [celebrate(), remember(), launch()]) {
      const parsed = OccasionContractSchema.parse(contract);
      expect(parsed.studio).toBe(contract.studio);
    }
  });

  it("applies defaults (locale, constraints, mediaRefs) without the caller supplying them", () => {
    const { locale: _l, constraints: _c, ...bare } = celebrate();
    const parsed = CelebrateContractSchema.parse(bare);
    expect(parsed.locale).toBe("en");
    expect(parsed.constraints).toEqual([]);

    const { locale: _l2, mediaRefs: _m, ...bareRemember } = remember();
    expect(RememberContractSchema.parse(bareRemember).mediaRefs).toEqual([]);
  });

  it("rejects impossible calendar dates, not just badly-shaped ones", () => {
    expect(CelebrateContractSchema.safeParse(celebrate({ date: "2026-02-31" })).success).toBe(false);
    expect(CelebrateContractSchema.safeParse(celebrate({ date: "18/07/2026" })).success).toBe(false);
    expect(CelebrateContractSchema.safeParse(celebrate({ date: "2026-07-18" })).success).toBe(true);
    // Leap day in a leap year is real.
    expect(CelebrateContractSchema.safeParse(celebrate({ date: "2028-02-29" })).success).toBe(true);
  });

  it("rejects an empty deliverables list in every studio", () => {
    expect(CelebrateContractSchema.safeParse(celebrate({ deliverables: [] })).success).toBe(false);
    expect(RememberContractSchema.safeParse(remember({ deliverables: [] })).success).toBe(false);
    expect(LaunchContractSchema.safeParse(launch({ deliverables: [] })).success).toBe(false);
  });

  it("refuses deliverables that belong to a different studio", () => {
    const crossed = { ...celebrate(), deliverables: ["keepsake_art"] };
    expect(CelebrateContractSchema.safeParse(crossed).success).toBe(false);

    const crossedLaunch = { ...launch(), deliverables: ["budget"] };
    expect(LaunchContractSchema.safeParse(crossedLaunch).success).toBe(false);
  });

  it("rejects nonsense scalars: zero headcount, negative budget, bad url", () => {
    expect(CelebrateContractSchema.safeParse(celebrate({ headcount: 0 })).success).toBe(false);
    expect(CelebrateContractSchema.safeParse(celebrate({ budgetUsd: -5 })).success).toBe(false);
    expect(LaunchContractSchema.safeParse(launch({ url: "not-a-url" })).success).toBe(false);
  });
});

describe("artifacts and packs", () => {
  it("defaults sources to [] and pins version to 1", () => {
    const { sources: _s, ...bare } = artifact();
    const parsed = ArtifactSchema.parse(bare);
    expect(parsed.sources).toEqual([]);
    expect(ArtifactSchema.safeParse({ ...artifact(), version: 2 }).success).toBe(false);
  });

  it("requires pack ids to be keepsake ids and passRate to be a fraction", () => {
    expect(PackSchema.safeParse(pack()).success).toBe(true);
    expect(PackSchema.safeParse(pack({ id: "pack_1" })).success).toBe(false);
    expect(
      PackSchema.safeParse(pack({ quality: { oqsVersion: "1.0.0", passRate: 1.5, repairedCount: 0 } }))
        .success,
    ).toBe(false);
  });

  it("pins the on-chain pack kind codes — changing these invalidates every existing seal", () => {
    expect(PackKindCode).toEqual({ celebrate: 0, remember: 1, launch: 2, tool: 3 });
  });
});

import { describe, expect, it } from "vitest";
import type { Artifact } from "@occestra/studio-core";
import {
  checkBudgetSum,
  checkContrast,
  checkDateInvalid,
  checkImage,
  checkLinks,
  checkPolicyViolation,
  checkScheduleOverlap,
  checkSchemaInvalid,
  checkSourceMissing,
  checkTextOverflow,
  contrastRatio,
  runChecks,
  sortFindings,
} from "../src/index.js";
import { artifact, contract, jsonArtifact, png, sunprint } from "./fixtures.js";

const ctx = (a: Artifact, extra: Record<string, unknown> = {}) => ({
  artifact: a,
  contract: contract(),
  ...extra,
});

const loader = (bytes: Uint8Array) => ({ imageBytes: async () => bytes });

describe("SCHEMA_INVALID", () => {
  it("passes a well-formed payload and fails a malformed one", async () => {
    const good = await checkSchemaInvalid(ctx(artifact()));
    expect(good.passed).toBe(true);
    expect(good.hard).toBe(true);

    const bad = await checkSchemaInvalid(ctx(jsonArtifact("budget", { total: 100 })));
    expect(bad.passed).toBe(false);
    expect(bad.evidence[0]).toContain("lineItems");
  });

  it("fails json artifacts whose body is not parseable at all", async () => {
    const broken = artifact({ kind: "plan", format: "json", data: "{not json" });
    expect((await checkSchemaInvalid(ctx(broken))).passed).toBe(false);
  });
});

describe("POLICY_VIOLATION", () => {
  it("re-screens the FINAL copy, catching what the brief did not", async () => {
    const clean = await checkPolicyViolation(ctx(artifact({ kind: "toast", format: "md", data: "To ten loud years." })));
    expect(clean.passed).toBe(true);

    const dirty = artifact({
      kind: "toast",
      format: "md",
      data: "Raise a glass — and come dressed as your favourite Marvel avengers character!",
    });
    const result = await checkPolicyViolation(ctx(dirty));
    expect(result.passed).toBe(false);
    expect(result.hard).toBe(true);
    expect(result.evidence.join(" ")).toContain("POLICY_IP");
  });
});

describe("DATE_INVALID", () => {
  it("accepts the contract's real date and rejects an impossible or contradictory one", async () => {
    const ok = jsonArtifact("plan", { date: "2026-07-18", summary: "s", claims: [], uncertainties: [] });
    expect((await checkDateInvalid(ctx(ok))).passed).toBe(true);

    const impossible = jsonArtifact("plan", { date: "2026-02-31", summary: "s", claims: [], uncertainties: [] });
    expect((await checkDateInvalid(ctx(impossible))).passed).toBe(false);

    const contradictory = jsonArtifact("plan", { date: "2026-09-01", summary: "s", claims: [], uncertainties: [] });
    const result = await checkDateInvalid(ctx(contradictory));
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("contradicts");
  });
});

describe("SCHEDULE_OVERLAP", () => {
  const item = (title: string, start: string, end: string, venue?: string) => ({
    title,
    start,
    end,
    ...(venue ? { venue: { name: venue } } : {}),
  });

  it("passes a schedule that is physically possible", async () => {
    const good = jsonArtifact("schedule", {
      items: [
        item("Drinks", "2026-07-18T18:00:00.000Z", "2026-07-18T19:00:00.000Z", "Bar A"),
        item("Dinner", "2026-07-18T19:30:00.000Z", "2026-07-18T21:30:00.000Z", "Taberna B"),
      ],
    });
    expect((await checkScheduleOverlap(ctx(good))).passed).toBe(true);
  });

  it("fails overlapping items", async () => {
    const overlapping = jsonArtifact("schedule", {
      items: [
        item("Drinks", "2026-07-18T18:00:00.000Z", "2026-07-18T20:00:00.000Z", "Bar A"),
        item("Dinner", "2026-07-18T19:30:00.000Z", "2026-07-18T21:30:00.000Z", "Taberna B"),
      ],
    });
    const result = await checkScheduleOverlap(ctx(overlapping));
    expect(result.passed).toBe(false);
    expect(result.evidence[0]).toContain("overlaps");
  });

  it("fails a teleporting guest: under 5 minutes between two different venues", async () => {
    const impossible = jsonArtifact("schedule", {
      items: [
        item("Drinks", "2026-07-18T18:00:00.000Z", "2026-07-18T19:00:00.000Z", "Bar A"),
        item("Dinner", "2026-07-18T19:02:00.000Z", "2026-07-18T21:00:00.000Z", "Taberna B"),
      ],
    });
    const result = await checkScheduleOverlap(ctx(impossible));
    expect(result.passed).toBe(false);
    expect(result.evidence[0]).toContain("physically honest");
  });

  it("allows a tight gap when the party never leaves the venue", async () => {
    const sameVenue = jsonArtifact("schedule", {
      items: [
        item("Toasts", "2026-07-18T20:00:00.000Z", "2026-07-18T20:20:00.000Z", "Taberna B"),
        item("Cake", "2026-07-18T20:22:00.000Z", "2026-07-18T20:40:00.000Z", "Taberna B"),
      ],
    });
    expect((await checkScheduleOverlap(ctx(sameVenue))).passed).toBe(true);
  });
});

describe("BUDGET_SUM_MISMATCH", () => {
  it("passes when line items sum to the total within a cent, fails when they don't", async () => {
    const good = jsonArtifact("budget", {
      currency: "USD",
      total: 600,
      lineItems: [
        { label: "Dinner", amount: 420 },
        { label: "Cake", amount: 80 },
        { label: "Flowers", amount: 100 },
      ],
    });
    expect((await checkBudgetSum(ctx(good))).passed).toBe(true);

    const bad = jsonArtifact("budget", {
      currency: "USD",
      total: 600,
      lineItems: [
        { label: "Dinner", amount: 420 },
        { label: "Cake", amount: 80 },
      ],
    });
    const result = await checkBudgetSum(ctx(bad));
    expect(result.passed).toBe(false);
    expect(result.hard).toBe(true);
    expect(result.evidence.join(" ")).toContain("100.00");
  });
});

describe("SOURCE_MISSING", () => {
  it("demands a source for grounded claims, but not for interpretive prose", async () => {
    const unsourced = jsonArtifact("plan", {
      date: "2026-07-18",
      summary: "s",
      claims: [{ text: "Taberna B opens at 19:00 on Saturdays.", grounded: true }],
      uncertainties: [],
    });
    const result = await checkSourceMissing(ctx(unsourced));
    expect(result.passed).toBe(false);
    expect(result.hard).toBe(true);

    const sourced = jsonArtifact("plan", {
      date: "2026-07-18",
      summary: "s",
      claims: [
        {
          text: "Taberna B opens at 19:00 on Saturdays.",
          grounded: true,
          source: { source: "google_places", retrievedAt: "2026-07-12T09:00:00.000Z" },
        },
        { text: "The room will feel warmer with candles low.", grounded: false },
      ],
      uncertainties: [],
    });
    expect((await checkSourceMissing(ctx(sourced))).passed).toBe(true);
  });
});

describe("image checks", () => {
  it("passes an image rendered at exactly the requested size", async () => {
    const bytes = await png(512, 512, { r: 30, g: 90, b: 140 });
    const a = artifact({ kind: "keepsake_art", format: "png", data: undefined, uri: "k.png", spec: { size: "512x512" } });
    const [dim] = await checkImage({ ...ctx(a, { style: sunprint, deps: loader(bytes) }) });
    expect(dim!.id).toBe("DIM_ASPECT_MISMATCH");
    expect(dim!.passed).toBe(true);
  });

  it("hard-fails an image whose dimensions do not match the spec", async () => {
    const bytes = await png(512, 300, { r: 30, g: 90, b: 140 });
    const a = artifact({ kind: "keepsake_art", format: "png", data: undefined, uri: "k.png", spec: { size: "512x512" } });
    const [dim] = await checkImage({ ...ctx(a, { style: sunprint, deps: loader(bytes) }) });
    expect(dim!.passed).toBe(false);
    expect(dim!.hard).toBe(true);
    expect(dim!.evidence).toContain("rendered: 512x300");
  });

  it("PALETTE_DRIFT: an off-palette red image drifts from sunprint; an in-palette blue does not", async () => {
    const a = artifact({ kind: "keepsake_art", format: "png", data: undefined, uri: "k.png", spec: { size: "64x64" } });

    const red = await png(64, 64, { r: 220, g: 30, b: 30 });
    const drifted = (await checkImage({ ...ctx(a, { style: sunprint, deps: loader(red) }) })).find(
      (r) => r.id === "PALETTE_DRIFT",
    )!;
    expect(drifted.passed).toBe(false);
    expect(drifted.hard).toBe(false); // soft — it degrades quality, it does not invalidate the work

    const blue = await png(64, 64, { r: 30, g: 95, b: 140 });
    const onPalette = (await checkImage({ ...ctx(a, { style: sunprint, deps: loader(blue) }) })).find(
      (r) => r.id === "PALETTE_DRIFT",
    )!;
    expect(onPalette.passed).toBe(true);
  });

  it("skips image checks (and says so) when the bytes cannot be loaded", async () => {
    const a = artifact({ kind: "keepsake_art", format: "png", data: undefined, uri: "k.png", spec: { size: "64x64" } });
    const results = await checkImage({ ...ctx(a, { style: sunprint }) });
    expect(results.every((r) => r.skipped)).toBe(true);
    expect(results.every((r) => r.passed)).toBe(true); // skipped is not failed — but it IS a coverage gap
  });
});

describe("CONTRAST_LOW", () => {
  it("computes real WCAG ratios and fails body text below 4.5:1", async () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);

    const bad = artifact({
      kind: "invitation",
      format: "svg",
      data: "<svg/>",
      spec: { layers: [{ role: "body", fg: "#C8B4FF", bg: "#FAF7F2", body: true }] },
    });
    const result = await checkContrast(ctx(bad));
    expect(result.passed).toBe(false);
    expect(result.hard).toBe(false);
    expect(result.evidence[0]).toContain("needs 4.5:1");

    const good = artifact({
      kind: "invitation",
      format: "svg",
      data: "<svg/>",
      spec: { layers: [{ role: "body", fg: "#17141A", bg: "#FAF7F2", body: true }] },
    });
    expect((await checkContrast(ctx(good))).passed).toBe(true);
  });

  it("does not apply to artifacts with no text surface — a budget has no contrast", async () => {
    // The published rubric scopes this check to invites/cards. Running it on a JSON budget
    // and calling the result a coverage gap is noise that means nothing.
    const budget = jsonArtifact("budget", { currency: "USD", total: 1, lineItems: [{ label: "x", amount: 1 }] });
    const result = await checkContrast(ctx(budget));
    expect(result.passed).toBe(true);
    expect(result.skipped).toBeUndefined(); // NOT a gap — it simply does not apply
    expect(result.detail).toContain("does not apply");
  });

  it("exempts large display type from the body-copy floor", async () => {
    const display = artifact({
      kind: "invitation",
      format: "svg",
      data: "<svg/>",
      spec: { layers: [{ role: "display", fg: "#C8B4FF", bg: "#FAF7F2", body: false }] },
    });
    expect((await checkContrast(ctx(display))).passed).toBe(true);
  });
});

describe("TEXT_OVERFLOW_RISK", () => {
  it("fails copy that exceeds its layout budget and passes copy that fits", async () => {
    const long = artifact({ kind: "invitation", format: "md", data: "x".repeat(500) });
    const result = await checkTextOverflow(ctx(long));
    expect(result.passed).toBe(false);
    expect(result.evidence[0]).toContain("budget 420");

    const fits = artifact({ kind: "invitation", format: "md", data: "x".repeat(200) });
    expect((await checkTextOverflow(ctx(fits))).passed).toBe(true);
  });
});

describe("LINK_DEAD", () => {
  it("skips when no checker is injected, and fails a dead link when one is", async () => {
    const a = artifact({
      kind: "brand_kit",
      format: "md",
      data: "kit",
      spec: { links: ["https://example.com/live", "https://example.com/dead"] },
    });

    const skipped = await checkLinks(ctx(a));
    expect(skipped.skipped).toBe(true);
    expect(skipped.passed).toBe(true);

    const checked = await checkLinks(
      ctx(a, { deps: { linkChecker: async (url: string) => !url.endsWith("/dead") } }),
    );
    expect(checked.passed).toBe(false);
    expect(checked.evidence).toEqual(["https://example.com/dead"]);
  });
});

describe("findings ordering", () => {
  it("sorts severity-first: hard failures, then soft, then skips, then passes", async () => {
    const broken = jsonArtifact("budget", {
      currency: "USD",
      total: 600,
      lineItems: [{ label: "Dinner", amount: 1 }],
    });
    const results = await runChecks(ctx(broken));
    const first = results[0]!;
    expect(first.passed).toBe(false);
    expect(first.hard).toBe(true);

    const ranks = results.map((r) => (!r.passed && r.hard ? 0 : !r.passed ? 1 : r.skipped ? 2 : 3));
    expect([...ranks]).toEqual([...ranks].sort((a, b) => a - b));
    expect(sortFindings(results)).toEqual(results);
  });
});

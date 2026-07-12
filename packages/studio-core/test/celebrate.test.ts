import { describe, expect, it } from "vitest";
import corpus from "./corpus/celebrate.json" with { type: "json" };
import {
  PolicyRefusal,
  estimateTravel,
  haversineKm,
  layOutSchedule,
  runCelebrate,
  type CelebrateContract,
  type CelebrateDeps,
  type GradePort,
  type HouseStyle,
  type ImageModelPort,
  type Place,
  type PlacesPort,
  type StoragePort,
  type TextModelPort,
  type WeatherPort,
} from "../src/index.js";

const NOW = Date.parse("2026-07-12T10:00:00.000Z");

/* ------------------------------------------------------------------- fakes */

/** Two venues 400m apart (walkable) — or 30km apart when the corpus asks for a day trip. */
const venuesNear = (city: string): Place[] => [
  {
    name: `${city} Wine Room`,
    address: `1 First Street, ${city}`,
    lat: 38.72,
    lng: -9.14,
    source: { source: "openstreetmap", retrievedAt: "2026-07-12T09:00:00.000Z", url: "https://osm.org/node/1" },
  },
  {
    name: `${city} Taberna`,
    address: `2 Second Street, ${city}`,
    lat: 38.7232,
    lng: -9.1435,
    source: { source: "openstreetmap", retrievedAt: "2026-07-12T09:00:00.000Z", url: "https://osm.org/node/2" },
  },
];

const venuesFar = (city: string): Place[] => [
  {
    name: `${city} Pier`,
    address: `The seafront, ${city}`,
    lat: 50.8198,
    lng: -0.1372,
    source: { source: "openstreetmap", retrievedAt: "2026-07-12T09:00:00.000Z", url: "https://osm.org/node/3" },
  },
  {
    name: "Seven Sisters",
    address: "Cliffs, East Sussex",
    lat: 50.7423,
    lng: 0.1673, // ~22 km away — a real hop, not a stroll
    source: { source: "openstreetmap", retrievedAt: "2026-07-12T09:00:00.000Z", url: "https://osm.org/node/4" },
  },
];

class FakePlaces implements PlacesPort {
  constructor(private readonly venues: (city: string) => Place[]) {}
  async search(query: { city: string }): Promise<Place[]> {
    if (query.city === "Nowhereton") throw new Error(`could not locate "${query.city}"`);
    return this.venues(query.city);
  }
}

class FakeWeather implements WeatherPort {
  constructor(private readonly override?: Record<string, unknown>) {}
  async forecast(_lat: number, _lng: number, dateISO: string) {
    const daysOut = Math.round((Date.parse(dateISO) - NOW) / 86_400_000);
    if (daysOut > 16) throw new Error("no forecast exists that far out");
    return {
      summary: "partly cloudy, 17-26C, 12% chance of rain",
      tempC: { min: 17, max: 26 },
      precipitationChance: 12,
      source: { source: "open-meteo", retrievedAt: "2026-07-12T09:00:00.000Z" },
      ...(this.override ?? {}),
    } as Awaited<ReturnType<WeatherPort["forecast"]>>;
  }
}

/** A planner that returns a valid work order — or a deliberately over-weighted one. */
class FakeText implements TextModelPort {
  constructor(private readonly seedBadWeights = false) {}

  async complete(request: { role: string; json?: boolean }) {
    if (request.role === "planner" && request.json) {
      return {
        model: "fake",
        usdCost: 0,
        text: JSON.stringify({
          throughline: "One long table, one good evening.",
          venueQueries: ["wine bar", "restaurant"],
          blocks: [
            { title: "Arrival and first drink", minutes: 45, venueIndex: 0 },
            { title: "Dinner", minutes: 110, venueIndex: 1 },
            { title: "Toasts and cake", minutes: 30, venueIndex: 1 },
          ],
          // The trap: these weights sum to 1.6, not 1. The pipeline must normalise and
          // force the total to match — a model must never be trusted with arithmetic.
          budgetWeights: this.seedBadWeights
            ? [
                { label: "Dinner", weight: 0.9 },
                { label: "Drinks", weight: 0.5 },
                { label: "Cake", weight: 0.2 },
              ]
            : [
                { label: "Dinner", weight: 0.62 },
                { label: "Drinks", weight: 0.22 },
                { label: "Flowers", weight: 0.16 },
              ],
          prepChecklist: ["Call the venue", "Confirm headcount 48h out"],
          risks: ["The venue is not booked yet."],
        }),
      };
    }

    if (request.json) {
      return {
        model: "fake",
        usdCost: 0,
        text: JSON.stringify({ warm: "Come eat with us.", formal: "Your company is requested.", plain: "Dinner. Come." }),
      };
    }

    return { model: "fake", usdCost: 0, text: "## The toast\n\nTo all of you.\n\n## The short version\n\nCheers." };
  }
}

class BrokenText implements TextModelPort {
  async complete() {
    return { model: "fake", usdCost: 0, text: "I'm afraid I can't do that." }; // never valid JSON
  }
}

class FakeImage implements ImageModelPort {
  async generate() {
    // A 1x1 PNG is enough: the Tribunal is faked here, and the pipeline only stores bytes.
    return {
      pngBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      model: "fake",
      usdCost: 0,
    };
  }
}

class MemStorage implements StoragePort {
  private readonly map = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array) {
    this.map.set(key, bytes);
    return key;
  }
  async get(key: string) {
    const bytes = this.map.get(key);
    return bytes ? { bytes, contentType: "image/png" } : undefined;
  }
  async delete(key: string) {
    this.map.delete(key);
  }
  async signedUrl(key: string) {
    return `https://test/${key}`;
  }
}

/** A grader that passes everything — the Tribunal has its own suite; here we test wiring. */
const passingGrader: GradePort = {
  async grade({ artifact }) {
    return { artifact: { ...artifact, tribunal: { pass: true } }, pass: true, repairs: 0, coverageGaps: [] };
  },
};

const style: HouseStyle = {
  id: "amethyst_editorial",
  name: "Amethyst Editorial",
  version: "1.0.0",
  promptSystem: "editorial collage",
  palette: ["#FAF7F2", "#F1ECE4", "#17141A", "#2D1B4E", "#6B3FA0", "#8E8A94"],
  typeDirection: "serif",
  negativePrompt: "no gloss",
  seedStrategy: "contract_hash",
};

const makeDeps = (over: Partial<CelebrateDeps> = {}): CelebrateDeps => ({
  text: new FakeText(),
  image: new FakeImage(),
  storage: new MemStorage(),
  clock: { now: () => NOW },
  places: new FakePlaces(venuesNear),
  weather: new FakeWeather(),
  grader: passingGrader,
  styleFor: () => style,
  ...over,
});

/* ---------------------------------------------------------------- the corpus */

interface CorpusEntry {
  label: string;
  contract: CelebrateContract;
  expect: Record<string, unknown>;
  weatherOverride?: Record<string, unknown>;
  farVenues?: boolean;
  noPlaces?: boolean;
}

const entries = corpus as unknown as CorpusEntry[];

describe("CELEBRATE corpus", () => {
  it("covers at least 12 labelled briefs", () => {
    expect(entries.length).toBeGreaterThanOrEqual(12);
    expect(new Set(entries.map((e) => e.label)).size).toBe(entries.length);
  });

  for (const entry of entries) {
    it(`${entry.label}`, async () => {
      const deps = makeDeps({
        ...(entry.weatherOverride ? { weather: new FakeWeather(entry.weatherOverride) } : {}),
        ...(entry.farVenues ? { places: new FakePlaces(venuesFar) } : {}),
        ...(entry.expect["seedBadWeights"] ? { text: new FakeText(true) } : {}),
      });

      /* --- a blocked brief must refuse BEFORE any work is done --- */
      if (entry.expect["policyBlocked"]) {
        await expect(runCelebrate(entry.contract, deps)).rejects.toBeInstanceOf(PolicyRefusal);
        return;
      }

      const { pack } = await runCelebrate(entry.contract, deps);

      expect(pack.id).toMatch(/^oce_[0-9a-z]{22}$/);
      expect(pack.studio).toBe("celebrate");

      /* --- every requested deliverable is present --- */
      const kinds = pack.artifacts.map((a) => a.kind);
      for (const kind of (entry.expect["kinds"] as string[]) ?? []) {
        expect(kinds, `${entry.label}: missing ${kind}`).toContain(kind);
      }

      /* --- the budget ALWAYS sums, even when the planner's weights are nonsense --- */
      const budget = pack.artifacts.find((a) => a.kind === "budget");
      if (budget) {
        const body = JSON.parse(budget.data!) as {
          total: number;
          lineItems: Array<{ amount: number }>;
        };
        const sum = body.lineItems.reduce((acc, item) => acc + item.amount, 0);
        expect(Math.abs(sum - body.total), `${entry.label}: budget does not sum`).toBeLessThanOrEqual(0.01);
        expect(body.total).toBe(entry.contract.budgetUsd ?? entry.contract.headcount * 45);
      }

      /* --- the schedule is physically possible, by construction --- */
      const schedule = pack.artifacts.find((a) => a.kind === "schedule");
      if (schedule) {
        const items = (JSON.parse(schedule.data!) as { items: Array<{ start: string; end: string; venue?: { name: string } }> }).items;
        for (let i = 1; i < items.length; i++) {
          const prev = items[i - 1]!;
          const curr = items[i]!;
          expect(Date.parse(curr.start), `${entry.label}: schedule overlaps`).toBeGreaterThanOrEqual(
            Date.parse(prev.end),
          );
          if (prev.venue && curr.venue && prev.venue.name !== curr.venue.name) {
            const gapMin = (Date.parse(curr.start) - Date.parse(prev.end)) / 60_000;
            expect(gapMin, `${entry.label}: teleporting between venues`).toBeGreaterThanOrEqual(5);
          }
        }
      }

      /* --- weather honesty beyond the horizon: no invented forecast, and it SAYS so --- */
      if (entry.expect["beyondHorizon"]) {
        expect(pack.coverageGaps.join(" ")).toContain("weather:beyond-horizon");
        const plan = pack.artifacts.find((a) => a.kind === "plan")!;
        expect(plan.data).toContain("beyond any real forecast horizon");
        const contingency = pack.artifacts.find((a) => a.kind === "contingency")!;
        expect(contingency.data).toContain("too far out");
      }

      /* --- rain must actually change the plan, not just get mentioned --- */
      if (entry.expect["rainBranch"]) {
        const contingency = pack.artifacts.find((a) => a.kind === "contingency")!;
        expect(contingency.data).toContain("Rain is likely");
        expect(contingency.data).toContain("PRIMARY");
      }

      /* --- a city we cannot look up degrades honestly instead of inventing venues --- */
      if (entry.expect["noPlaces"]) {
        expect(pack.coverageGaps.some((gap) => gap.startsWith("places:"))).toBe(true);
        const plan = pack.artifacts.find((a) => a.kind === "plan")!;
        expect(plan.data).toContain("No real venues could be shortlisted");
      }

      /* --- nothing, anywhere, is ever described as booked --- */
      const everything = JSON.stringify(pack);
      expect(everything).not.toMatch(/\b(reserved|booking confirmed|we have booked)\b/i);
    });
  }
});

/* ------------------------------------------------------- travel + buffers */

describe("travel feasibility", () => {
  it("measures real distance (Lisbon hop ~400m, Brighton→Seven Sisters ~22km)", () => {
    const near = haversineKm({ lat: 38.72, lng: -9.14 }, { lat: 38.7232, lng: -9.1435 });
    expect(near).toBeGreaterThan(0.3);
    expect(near).toBeLessThan(0.6);

    const far = haversineKm({ lat: 50.8198, lng: -0.1372 }, { lat: 50.7423, lng: 0.1673 });
    expect(far).toBeGreaterThan(18);
    expect(far).toBeLessThan(28);
  });

  it("picks a humane mode and never returns an instant hop", () => {
    const walk = estimateTravel({ lat: 38.72, lng: -9.14 }, { lat: 38.7232, lng: -9.1435 });
    expect(walk.mode).toBe("walk");
    expect(walk.minutes).toBeGreaterThanOrEqual(5); // includes the find-the-door overhead
    expect(walk.isEstimate).toBe(true);
    expect(walk.note).toContain("estimate, not a routed journey");

    const drive = estimateTravel({ lat: 50.8198, lng: -0.1372 }, { lat: 50.7423, lng: 0.1673 });
    expect(drive.mode).toBe("drive");
    expect(drive.minutes).toBeGreaterThan(60); // 22km of city driving is not 10 minutes
  });

  it("lays out a schedule with travel between venues and a buffer within one", () => {
    const timed = layOutSchedule("2026-07-18T18:00:00.000Z", [
      { title: "Drinks", minutes: 60, venue: { name: "Bar", lat: 38.72, lng: -9.14 } },
      { title: "Dinner", minutes: 90, venue: { name: "Taberna", lat: 38.7232, lng: -9.1435 } },
      { title: "Cake", minutes: 30, venue: { name: "Taberna", lat: 38.7232, lng: -9.1435 } },
    ]);

    // Hop 1 crosses venues: the gap equals the travel estimate, and it is recorded.
    const hop = (Date.parse(timed[1]!.start) - Date.parse(timed[0]!.end)) / 60_000;
    expect(hop).toBe(timed[1]!.travel!.minutes);
    expect(hop).toBeGreaterThanOrEqual(5);

    // Hop 2 stays put: a 5-minute buffer, not a travel estimate.
    const buffer = (Date.parse(timed[2]!.start) - Date.parse(timed[1]!.end)) / 60_000;
    expect(buffer).toBe(5);
    expect(timed[2]!.travel).toBeUndefined();

    // And it starts when it was told to.
    expect(timed[0]!.start).toBe("2026-07-18T18:00:00.000Z");
  });

  it("still separates venues it cannot measure — an unknown hop is not a free hop", () => {
    const timed = layOutSchedule("2026-07-18T18:00:00.000Z", [
      { title: "A", minutes: 60, venue: { name: "One" } },
      { title: "B", minutes: 60, venue: { name: "Two" } },
    ]);
    const gap = (Date.parse(timed[1]!.start) - Date.parse(timed[0]!.end)) / 60_000;
    expect(gap).toBe(20);
  });
});

/* --------------------------------------------------------- degradation */

describe("degradation", () => {
  it("survives a planner that never returns valid JSON — degraded, not dead", async () => {
    const { pack } = await runCelebrate(
      entries[0]!.contract,
      makeDeps({ text: new BrokenText() }),
    );

    expect(pack.artifacts.length).toBeGreaterThan(0);
    expect(pack.coverageGaps.join(" ")).toContain("planner:degraded");

    // The fallback still produces a budget that sums — arithmetic is never delegated.
    const budget = pack.artifacts.find((a) => a.kind === "budget");
    if (budget) {
      const body = JSON.parse(budget.data!) as { total: number; lineItems: Array<{ amount: number }> };
      const sum = body.lineItems.reduce((acc, i) => acc + i.amount, 0);
      expect(Math.abs(sum - body.total)).toBeLessThanOrEqual(0.01);
    }
  });

  it("says so loudly when it was never graded", async () => {
    const deps = makeDeps();
    delete (deps as { grader?: unknown }).grader;

    const { pack } = await runCelebrate(entries[0]!.contract, deps);
    expect(pack.coverageGaps).toContain("tribunal:not-wired — these artifacts were produced but NOT graded");
    expect(pack.quality.passRate).toBe(0);
  });

  it("produces a self-contained guest guide with no external requests", async () => {
    const contract = { ...entries[1]!.contract };
    const { pack } = await runCelebrate(contract, makeDeps());

    const guide = pack.artifacts.find((a) => a.kind === "guest_guide")!;
    expect(guide.format).toBe("html");
    expect(guide.data).toContain("<!doctype html>");
    expect(guide.data).not.toMatch(/<script/i); // no scripts, ever
    expect(guide.data).not.toMatch(/https?:\/\/(?!www\.openstreetmap)/); // only map links leave
    expect(guide.data).toContain("estimates, not routed journeys");
  });
});

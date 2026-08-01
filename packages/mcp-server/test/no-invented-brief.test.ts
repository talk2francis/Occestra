/**
 * NEVER ANSWER A QUESTION NOBODY ASKED.
 *
 * A brief for an anniversary lunch in Trieste was sent with the city under the key `location`
 * rather than `city`. The bodyless-replay defaults filled the gap with "Abuja", and the
 * pipeline produced a well-graded, internally consistent plan for the wrong continent —
 * venues, timezone and weather all faithfully wrong, and paid for.
 *
 * Nothing downstream could catch it. Every check the Tribunal runs asks whether the artifact
 * disagrees with itself or with the brief it was handed, and this artifact agreed perfectly
 * with a brief the buyer never wrote. The only place to stop it is the door.
 *
 * So the defaults still answer a genuinely empty probe — that is what they are for — but the
 * moment a buyer sends a body, a missing material fact is refused by name, before any money
 * moves. And an obvious synonym is read rather than ignored, because mapping the buyer's own
 * value is the opposite of inventing one.
 */
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  FakeCritique,
  FakeImageModel,
  FakePlaces,
  FakeTextModel,
  FakeWeather,
  FixedClock,
} from "@occestra/providers";
import type { EngineDeps } from "@occestra/studio-core";
import { OkxGate } from "../src/gate.js";
import { buildGrader } from "../src/grader.js";
import { buildApp, type AppContext } from "../src/http.js";
import { Store } from "../src/store.js";

const NOW = Date.parse("2026-07-14T10:00:00.000Z");
const dirs: string[] = [];
const servers: Server[] = [];

function makeApp(): string {
  const dataDir = mkdtempSync(join(tmpdir(), "occestra-brief-"));
  dirs.push(dataDir);
  const store = new Store({ dataDir, urlSecret: "test-secret", baseUrl: "http://test.local" });

  const deps: EngineDeps = {
    text: new FakeTextModel(() => "{}"),
    image: new FakeImageModel(),
    critique: new FakeCritique(88),
    storage: store.storage,
    clock: new FixedClock(NOW),
    weather: new FakeWeather(),
    places: new FakePlaces(),
  };

  const ctx = {
    deps,
    store,
    coverageGaps: [],
    grader: buildGrader({ deps }),
    publicBaseUrl: "http://test.local",
    chainId: 196,
    // The plain x402 route only exists in production payment mode. No settlement key, so
    // nothing reaches a chain — and validation runs before the gate either way, which is
    // the whole point: a malformed brief is refused before any money moves.
    gate: new OkxGate({ store, treasury: "0x0d63f9eeb86813230b72017444cea16cd4a453f2", publicBaseUrl: "http://test.local" }),
  } as unknown as AppContext;

  const server = buildApp(ctx).listen(0);
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const post = (base: string, body: unknown) =>
  fetch(`${base}/x402/oce_plan_occasion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

afterAll(() => {
  for (const server of servers) server.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("a brief with a hole in it is refused, not filled in", () => {
  it("refuses a plan whose city the buyer never gave — and does not charge", async () => {
    const base = makeApp();
    const res = await post(base, {
      occasion: "40th wedding anniversary lunch",
      date: "2027-05-22",
      headcount: 26,
      vibe: "warm, unhurried, a long table",
      // no city, under any name
    });

    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(400);
    expect(body["charged"]).toBe(false);
    // It must name the field, so the buyer can fix it in one go.
    expect(JSON.stringify(body)).toContain("city");
  });

  it("never invents Abuja — the actual failure", async () => {
    const base = makeApp();
    const res = await post(base, {
      occasion: "Anniversary lunch",
      date: "2027-05-22",
      headcount: 26,
      vibe: "warm",
    });
    expect(JSON.stringify(await res.json())).not.toContain("Abuja");
  });

  it("reads `location` as the city, because that is the buyer's own value", async () => {
    const base = makeApp();
    const res = await post(base, {
      occasion: "Anniversary lunch",
      location: "Trieste",
      date: "2027-05-22",
      headcount: 26,
      vibe: "warm, unhurried",
    });

    // Accepted — whatever the pipeline then does with fakes, it was NOT rejected for a
    // missing city and it did not silently become somewhere else.
    expect(res.status).not.toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("Abuja");
  });

  it("still answers a genuinely bodyless probe, which is what the defaults are for", async () => {
    const base = makeApp();
    const res = await fetch(`${base}/x402/oce_plan_occasion`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
    });
    // No body means nothing was asked, so a default is an honest answer rather than a guess
    // dressed as the buyer's intent. It must not 400.
    expect(res.status).not.toBe(400);
  });

  it("refuses an invitation with no date, the other checkable claim", async () => {
    const base = makeApp();
    const res = await fetch(`${base}/x402/oce_design_invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ occasion: "Marta and Piero's anniversary" }), // no date
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(400);
    expect(body["charged"]).toBe(false);
  });

  it("leaves neutral placeholders alone — they assert nothing about anybody", async () => {
    // "A keepsake with no invented personal details" is not a fabricated fact; it is a refusal
    // to fabricate one. A partial keepsake brief is still answerable.
    const base = makeApp();
    const res = await fetch(`${base}/x402/oce_make_keepsake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ title: "The summer we moved" }),
    });
    expect(res.status).not.toBe(400);
  });
});

/**
 * The Studio demo route: secret-gated, metered, and every SSE event must come
 * from a real execution point — the fakes here still exercise the genuine
 * pipeline, grader and sealer paths end to end.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { getAddress, type Hex } from "viem";
import { afterAll, describe, expect, it } from "vitest";
import {
  FakeCritique,
  FakeImageModel,
  FakePlaces,
  FakeTextModel,
  FakeWeather,
  FixedClock,
} from "@occestra/providers";
import { Sealer } from "@occestra/receipts";
import type { EngineDeps } from "@occestra/studio-core";
import { DevGate } from "../src/gate.js";
import { buildGrader } from "../src/grader.js";
import { buildApp, type AppContext } from "../src/http.js";
import { Store } from "../src/store.js";

const KEY: Hex = `0x${"11".repeat(32)}`;
const REGISTRY = getAddress("0x000000000000000000000000000000000000dead");
const NOW = Date.parse("2026-07-12T10:00:00.000Z");

const dirs: string[] = [];
const servers: Server[] = [];

function makeApp(over: Partial<AppContext> = {}, depsOver: Partial<EngineDeps> = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "occestra-demo-test-"));
  dirs.push(dataDir);

  const store = new Store({ dataDir, urlSecret: "test-secret", baseUrl: "http://test.local" });
  const deps: EngineDeps = {
    text: new FakeTextModel(() => "## The plan\n\nA real fake plan."),
    image: new FakeImageModel(),
    critique: new FakeCritique(88),
    storage: store.storage,
    clock: new FixedClock(NOW),
    weather: new FakeWeather(),
    places: new FakePlaces(),
    ...depsOver,
  };

  const ctx: AppContext = {
    deps,
    store,
    coverageGaps: [],
    grader: buildGrader({ deps }),
    sealer: new Sealer({ privateKey: KEY, chainId: 196, verifyingContract: REGISTRY }),
    publicBaseUrl: "http://test.local",
    chainId: 196,
    registry: REGISTRY,
    gate: new DevGate(),
    demoSecret: "shhh",
    demoDailyCap: 2,
    ...over,
  };

  const app = buildApp(ctx);
  const server = app.listen(0);
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, store };
}

afterAll(() => {
  for (const server of servers) server.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const BODY = {
  tool: "oce_make_keepsake",
  arguments: { title: "Test moment", description: "a quiet afternoon" },
};

async function runDemo(base: string, secret?: string, body: unknown = BODY) {
  return fetch(`${base}/internal/demo/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-oce-demo-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

function parseEvents(text: string): Array<Record<string, unknown>> {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)) as Record<string, unknown>);
}

describe("the internal demo route", () => {
  it("404s without the shared secret, and when no secret is configured at all", async () => {
    const { base } = makeApp();
    expect((await runDemo(base)).status).toBe(404);
    expect((await runDemo(base, "wrong")).status).toBe(404);

    const bare = makeApp({ demoSecret: undefined as never });
    expect((await runDemo(bare.base, "shhh")).status).toBe(404);
  });

  it("streams real pipeline events in order and finishes with the pack", async () => {
    const { base, store } = makeApp();
    const res = await runDemo(base, "shhh");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = parseEvents(await res.text());
    const types = events.map((event) => event["type"]);

    expect(types[0]).toBe("run_started");
    expect(types).toContain("grading");
    expect(types).toContain("graded");
    expect(types).toContain("sealing");
    expect(types.indexOf("sealing")).toBeLessThan(types.indexOf("run_complete"));
    expect(types.at(-1)).toBe("run_complete");

    // The finished pack is the store's pack, serialised for the client.
    const done = events.at(-1) as { pack: { keepsakeId: string; seal?: { anchored: boolean } } };
    expect(done.pack.keepsakeId).toMatch(/^oce_[0-9a-z]{22}$/);
    expect(store.getPack(done.pack.keepsakeId)).toBeDefined();
    // Sealed but not yet anchored — and it says so.
    expect(done.pack.seal?.anchored).toBe(false);

    // The run is recorded as demo, never as paid volume.
    const orders = store.orders(10);
    expect(orders[0]?.status).toBe("demo");
    expect(orders[0]?.priceUsdt).toBe(0);
  });

  it("recovers a completed run with its capability token, never with the run id alone", async () => {
    const { base } = makeApp();
    const res = await runDemo(base, "shhh", {
      ...BODY,
      runId: "demo_1234567890abcdef1234567890abcdef",
      recoveryToken: "recovery-token-that-is-long-and-random-enough-1234567890",
    });
    expect(res.status).toBe(200);
    await res.text();

    const runId = res.headers.get("x-oce-run-id");
    const token = res.headers.get("x-oce-recovery-token");
    expect(runId).toBe("demo_1234567890abcdef1234567890abcdef");
    expect(token).toBe("recovery-token-that-is-long-and-random-enough-1234567890");

    const withoutCapability = await fetch(`${base}/internal/demo/run/${runId}`, {
      headers: { "x-oce-demo-secret": "shhh" },
    });
    expect(withoutCapability.status).toBe(404);

    const recovered = await fetch(`${base}/internal/demo/run/${runId}`, {
      headers: {
        "x-oce-demo-secret": "shhh",
        "x-oce-recovery-token": token!,
      },
    });
    expect(recovered.status).toBe(200);
    const body = (await recovered.json()) as {
      state: string;
      events: Array<{ type: string }>;
      pack?: { keepsakeId: string };
    };
    expect(body.state).toBe("done");
    expect(body.events[0]?.type).toBe("run_started");
    expect(body.events.at(-1)?.type).toBe("run_complete");
    expect(body.pack?.keepsakeId).toMatch(/^oce_[0-9a-z]{22}$/);
  });

  it("enforces the daily allowance", async () => {
    const { base } = makeApp({ demoDailyCap: 1 });
    expect((await runDemo(base, "shhh")).status).toBe(200);
    const second = await runDemo(base, "shhh");
    expect(second.status).toBe(429);
  });

  it("rejects a malformed brief before spending anything", async () => {
    const { base, store } = makeApp();
    const res = await runDemo(base, "shhh", { tool: "oce_launch_kit", arguments: {} });
    expect(res.status).toBe(400);
    expect(store.demoRunsSince(0)).toBe(0);
  });

  it("completes and seals a launch pack when generated copy is honestly undelivered", async () => {
    // This is the production Archon failure shape: the writer failed schema validation,
    // the pure pipeline correctly kept honest undelivered stubs, and provenance used to
    // throw because those stubs intentionally have neither data nor a storage URI.
    const unusableWriter = new FakeTextModel(() => "{}");
    const { base, store } = makeApp({}, { text: unusableWriter });
    const res = await runDemo(base, "shhh", {
      tool: "oce_launch_kit",
      arguments: {
        productName: "Archon",
        description: "Evidence-backed security audits for smart contracts and wallet-enabled agents.",
        audience: "Web3 engineering and security teams.",
        styleId: "neon_reverie",
      },
    });

    expect(res.status).toBe(200);
    const events = parseEvents(await res.text());
    expect(events.at(-1)?.["type"]).toBe("run_complete");

    const complete = events.at(-1) as { pack: { keepsakeId: string; artifacts: Array<{ undelivered?: unknown }> } };
    const saved = store.getPack(complete.pack.keepsakeId);
    expect(saved?.seal).toBeDefined();
    expect(saved?.quality.undeliveredCount).toBeGreaterThan(0);
    expect(saved?.artifacts.some((artifact) => artifact.undelivered)).toBe(true);
  });
});

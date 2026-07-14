/**
 * THE DOOR.
 *
 * The listing says, in writing, that "the PolicyGate refuses those briefs before any money is
 * spent". That sentence was false in two independent ways, and each one on its own would have
 * been enough to make it false.
 *
 *   1. THREE OF THE SIX PAID PIPELINES NEVER SCREENED AT ALL. plan_occasion, launch_kit, and —
 *      worst of the three — make_keepsake, the one tool that ingests photographs of real
 *      people, went straight from the paywall to the model with nothing in between.
 *
 *   2. THE SCREENING THAT DID HAPPEN RAN TOO LATE. It lived inside the pipeline, and x402
 *      settles on chain BEFORE the pipeline is reached. So a refused brief was a brief we had
 *      already been paid for. A refusal you charge for is not a refusal, it is a fee.
 *
 * Both are fixed the same way, and it is not a patch: the screen now runs in the paywall, over
 * the raw tool arguments, before the gate is consulted at all. No pipeline calls it, so no new
 * pipeline can forget to call it. The door does it.
 *
 * These tests hold that door shut. Every paid tool, every time — including the ones nobody has
 * written yet, because the table below is generated from the price list rather than typed out.
 */
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FakeCritique, FakeImageModel, FakePlaces, FakeTextModel, FakeWeather, FixedClock } from "@occestra/providers";
import type { EngineDeps } from "@occestra/studio-core";
import { DevGate, PACK_TOOLS } from "../src/gate.js";
import { buildGrader } from "../src/grader.js";
import { buildApp, type AppContext } from "../src/http.js";
import { screenToolInput } from "../src/pipelines.js";
import { Store } from "../src/store.js";

const NOW = Date.parse("2026-07-14T10:00:00.000Z");
const dirs: string[] = [];
const servers: Server[] = [];

function makeApp(): { base: string; store: Store } {
  const dataDir = mkdtempSync(join(tmpdir(), "occestra-paywall-"));
  dirs.push(dataDir);

  const store = new Store({ dataDir, urlSecret: "test-secret", baseUrl: "http://test.local" });

  const deps: EngineDeps = {
    text: new FakeTextModel(() => "## The toast\n\nTo Mara.\n\n## The short version\n\nTo Mara.\n\n## If you get emotional\n\nRaise it."),
    image: new FakeImageModel(),
    critique: new FakeCritique(88),
    storage: store.storage,
    clock: new FixedClock(NOW),
    weather: new FakeWeather(),
    places: new FakePlaces(),
  };

  const ctx: AppContext = {
    deps,
    store,
    coverageGaps: [],
    grader: buildGrader({ deps }),
    gate: new DevGate(),
    publicBaseUrl: "http://test.local",
    chainId: 196,
  } as AppContext;

  const server = buildApp(ctx).listen(0);
  servers.push(server);

  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, store };
}

interface Reply {
  status: number;
  headers: Headers;
  text: string;
  json: Record<string, never> & Record<string, unknown>;
}

async function post(
  base: string,
  name: string,
  args: unknown,
  headers: Record<string, string> = {},
): Promise<Reply> {
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });

  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // an SSE body, not JSON — the tests that care read `text`
  }

  return { status: response.status, headers: response.headers, text, json: json as Reply["json"] };
}

/** The tool's own payload, dug out of whichever envelope the transport chose. */
function toolResult(reply: Reply): Record<string, unknown> {
  const line = reply.text.split("\n").find((row) => row.startsWith("data: "));
  const envelope = JSON.parse(line ? line.slice(6) : reply.text) as {
    result: { content: Array<{ text: string }> };
  };
  return JSON.parse(envelope.result.content[0]!.text) as Record<string, unknown>;
}

/** A brief that names a franchise character. Every tool must refuse it, unpaid. */
const BLOCKED: Record<string, unknown> = {
  oce_plan_occasion: {
    occasion: "a Spider-Man themed birthday party",
    city: "Lisbon",
    date: "2026-08-01",
    headcount: 12,
    vibe: "marvel superheroes everywhere",
  },
  oce_design_invite: { occasion: "a Spider-Man themed birthday", date: "August 1st" },
  oce_write_toast: { subject: "Spider-Man", details: "he saved the city" },
  oce_moodboard: { subject: "a Spider-Man themed launch party" },
  oce_make_keepsake: { title: "The day we met Spider-Man", description: "he was there, in the marvel costume" },
  oce_launch_kit: { productName: "Spider-Man Fan Club", description: "a marvel fan community" },
};

afterAll(() => {
  for (const server of servers) server.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("EVERY paid tool refuses a blocked brief, and NOTHING is charged", () => {
  for (const tool of PACK_TOOLS) {
    it(`${tool}: refuses at the door, records no order, makes no pack`, async () => {
      const { base, store } = makeApp();

      const reply = await post(base, tool, BLOCKED[tool]);

      expect(reply.status).toBe(403);
      expect(reply.json["charged"]).toBe(false);
      expect(String(reply.json["error"])).toMatch(/original work|third-party|can't/i);

      // The proof that it happened BEFORE the money: no order exists at all. Not a paid
      // one, not a refused one. The till never opened.
      expect(store.orders()).toHaveLength(0);
      expect(store.stats().packsCreated).toBe(0);
    });
  }

  it("refuses a blocked brief smuggled inside a JOB, before the job is even created", async () => {
    const { base, store } = makeApp();

    const reply = await post(base, "oce_create_pack_job", {
      tool: "oce_launch_kit",
      arguments: BLOCKED["oce_launch_kit"],
    });

    expect(reply.status).toBe(403);
    expect(store.orders()).toHaveLength(0);
    expect(store.jobQueueHealth().queued).toBe(0); // no job, no charge, no work
  });

  it("still does the work when the brief is fine — the door is a door, not a wall", async () => {
    const { base, store } = makeApp();

    const reply = await post(base, "oce_write_toast", {
      subject: "my sister Mara",
      details: "she taught me to drive, badly. she never once said I told you so.",
    });

    expect(reply.status).toBe(200);
    expect(store.orders().filter((order) => order.status === "paid")).toHaveLength(1);
  });
});

describe("the screen reads every string, wherever the caller puts it", () => {
  it("catches a franchise hidden in a nested array, not just the obvious field", () => {
    expect(() =>
      screenToolInput({ occasion: "a birthday", constraints: ["no stairs", "a Darth Vader cake"] }),
    ).toThrow(/original work/i);
  });

  it("does not read base64 image bytes as prose — that way lies nonsense", () => {
    // A PNG's base64 will contain all sorts of letter sequences by chance. Screening bytes
    // for words is not a safety check, it is a random refusal generator.
    expect(() => screenToolInput({ brief: "a wedding invitation", imageBase64: "bGVnbyBkaXNuZXk=" })).not.toThrow();
  });

  it("lets an ordinary occasion through, including one for a child", () => {
    // A birthday party for a seven-year-old is the single most normal brief this product
    // will ever receive. If the safety screen fires on it, the screen is broken.
    expect(() =>
      screenToolInput({
        occasion: "my daughter's 7th birthday party",
        city: "Lisbon",
        vibe: "warm, silly, a lot of cake",
      }),
    ).not.toThrow();
  });
});

describe("a job's arguments are validated BEFORE the payment, not after", () => {
  it("400s on arguments the target tool would have rejected — a typo is not a charge", async () => {
    const { base, store } = makeApp();

    const reply = await post(base, "oce_create_pack_job", {
      tool: "oce_plan_occasion",
      arguments: { occasion: "a birthday", city: "Lisbon" }, // no date, no headcount, no vibe
    });

    expect(reply.status).toBe(400);
    expect(reply.json["charged"]).toBe(false);
    expect(String((reply.json["detail"] as string[]).join(" "))).toMatch(/date|headcount|vibe/);
    expect(store.orders()).toHaveLength(0);
  });

  it("accepts a valid job and hands back an id immediately", async () => {
    const { base, store } = makeApp();

    const reply = await post(base, "oce_create_pack_job", {
      tool: "oce_write_toast",
      arguments: { subject: "my sister Mara", details: "she taught me to drive, badly" },
    });

    expect(reply.status).toBe(200);

    const result = toolResult(reply) as { jobId: string; state: string };
    expect(result.state).toBe("queued");
    expect(store.getJob(result.jobId)!.tool).toBe("oce_write_toast");
  });
});

describe("idempotency over HTTP: the same key twice is one charge", () => {
  it("replays the first response and does not run the tool again", async () => {
    const { base, store } = makeApp();

    const args = { subject: "my sister Mara", details: "she taught me to drive, badly" };
    const key = { "Idempotency-Key": "buyer-key-1" };

    const first = await post(base, "oce_write_toast", args, key);
    expect(first.status).toBe(200);
    expect(first.headers.get("idempotency-replayed")).toBeNull();

    const second = await post(base, "oce_write_toast", args, key);
    expect(second.status).toBe(200);
    expect(second.headers.get("idempotency-replayed")).toBe("true");

    // The same pack, handed back a second time. Not a new one that happens to look alike:
    // the SAME keepsake id, which is the only thing that proves no second run happened.
    expect(toolResult(second)["keepsakeId"]).toBe(toolResult(first)["keepsakeId"]);

    // ONE order, ONE pack. The retry cost the buyer nothing, and it cost us nothing.
    expect(store.orders().filter((order) => order.status === "paid")).toHaveLength(1);
    expect(store.stats().packsCreated).toBe(1);
  });

  it("422s a key reused for a DIFFERENT brief", async () => {
    const { base } = makeApp();
    const key = { "Idempotency-Key": "buyer-key-2" };

    await post(base, "oce_write_toast", { subject: "Mara", details: "she taught me to drive" }, key);
    const conflict = await post(base, "oce_write_toast", { subject: "Mara", details: "something else" }, key);

    expect(conflict.status).toBe(422);
    expect(conflict.json["charged"]).toBe(false);
  });
});

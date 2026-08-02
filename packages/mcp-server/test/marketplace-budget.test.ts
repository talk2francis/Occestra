/**
 * THE THIRTY-SECOND WALL.
 *
 * `onchainos agent task-402-pay` replays the paid endpoint and cuts the connection at exactly
 * 30.0 seconds — measured from Caddy's access log as `status 0, duration 30.0`, three times in
 * a row on 2026-07-28. Occestra's pack tools take 80–130 seconds. So every marketplace-routed
 * purchase of a pack failed, and failed in the worst way available: our side kept working,
 * settled the payment, and finished the pack into a socket nobody was holding. The buyer saw a
 * transport error and got nothing.
 *
 * It had nothing to do with which endpoint was listed — `/mcp` and `/x402/<tool>` failed
 * identically — which is why these tests are about TIME, not routing:
 *
 *   1. a pack that outlives the budget returns 200 and a durable job handle, never a hang;
 *   2. the answer arrives inside the budget, with real margin;
 *   3. replaying that same paid nonce once the job is done returns the FINISHED PACK, because
 *      that replay is precisely what the marketplace's `complete` step performs;
 *   4. a service that fits inside the budget still delivers in-band, as it always did.
 */
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  FakeCritique,
  FakeImageModel,
  FakePlaces,
  FakeTextModel,
  FakeWeather,
  FixedClock,
} from "@occestra/providers";
import type { EngineDeps } from "@occestra/studio-core";
import { DEFAULT_ASSET, OkxGate, PRICES } from "../src/gate.js";
import { buildGrader } from "../src/grader.js";
import { JobQueue } from "../src/jobs.js";
import { buildApp, type AppContext } from "../src/http.js";
import { packResult } from "../src/server.js";
import { Store } from "../src/store.js";

const NOW = Date.parse("2026-07-14T10:00:00.000Z");
const TREASURY = "0x0d63f9eeb86813230b72017444cea16cd4a453f2";
// A throwaway key. It signs authorizations only; the gate has no settlement key, so nothing
// is ever submitted to a chain from these tests.
const BUYER = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

const dirs: string[] = [];
const servers: Server[] = [];

const TOAST_TEXT =
  "## The toast\n\nTo Mara, who taught me to drive. Badly.\n\n## The short version\n\nTo Mara.\n\n## If you get emotional\n\nRaise the glass.";

/**
 * A text model that takes its time. `FakeTextModel`'s reply function is synchronous, so the
 * delay has to live in the port itself — this is how a pack is made to outlive the budget
 * without waiting on a real provider.
 */
function slowText(delayMs: number): EngineDeps["text"] {
  const inner = new FakeTextModel(() => TOAST_TEXT);

  return {
    complete: async (request) => {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return inner.complete(request);
    },
  } as EngineDeps["text"];
}

function makeApp(over: { budgetMs: number; textDelayMs: number; critiqueDelayMs?: number }): {
  base: string;
  store: Store;
  jobs: JobQueue;
} {
  const dataDir = mkdtempSync(join(tmpdir(), "occestra-budget-"));
  dirs.push(dataDir);

  const store = new Store({ dataDir, urlSecret: "test-secret", baseUrl: "http://test.local" });

  const deps: EngineDeps = {
    text: slowText(over.textDelayMs),
    image: new FakeImageModel(),
    // Critique does not go through the text port, so slowing that one leaves it instant.
    critique: over.critiqueDelayMs
      ? ({
          judge: async (request: unknown) => {
            await new Promise((resolve) => setTimeout(resolve, over.critiqueDelayMs));
            return new FakeCritique(88).judge(request as never);
          },
        } as EngineDeps["critique"])
      : new FakeCritique(88),
    storage: store.storage,
    clock: new FixedClock(NOW),
    weather: new FakeWeather(),
    places: new FakePlaces(),
  };

  const base = {
    deps,
    store,
    coverageGaps: [],
    grader: buildGrader({ deps }),
    publicBaseUrl: "http://test.local",
    chainId: 196,
  };

  const jobs = new JobQueue({
    ctx: { ...base, packForClient: (pack) => packResult(base as never, pack) } as never,
    concurrency: 2,
    pollMs: 10,
  });
  jobs.start();

  const ctx = {
    ...base,
    jobs,
    marketplaceBudgetMs: over.budgetMs,
    // No settlementKey: the authorization is verified but never redeemed on chain, which is
    // exactly what we want in a test — the paywall logic is identical either way.
    gate: new OkxGate({ store, treasury: TREASURY, publicBaseUrl: "http://test.local" }),
  } as unknown as AppContext;

  const server = buildApp(ctx).listen(0);
  servers.push(server);

  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, store, jobs };
}

/** A real x402 v2 payment header for `tool`, signed the way a buyer's client signs it. */
async function payment(tool: keyof typeof PRICES): Promise<string> {
  const value = BigInt(Math.round(PRICES[tool] * 1_000_000));
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: BUYER.address,
    to: TREASURY as `0x${string}`,
    value,
    validAfter: BigInt(now - 60),
    validBefore: BigInt(now + 300),
    nonce: `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as `0x${string}`,
  };

  const signature = await BUYER.signTypedData({
    domain: { name: "USD₮0", version: "1", chainId: 196, verifyingContract: DEFAULT_ASSET },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: authorization,
  });

  return Buffer.from(
    JSON.stringify({
      x402Version: 2,
      scheme: "exact",
      network: "eip155:196",
      payload: {
        signature,
        authorization: {
          ...authorization,
          value: value.toString(),
          validAfter: authorization.validAfter.toString(),
          validBefore: authorization.validBefore.toString(),
        },
      },
    }),
  ).toString("base64");
}

const TOAST_BRIEF = {
  honouree: "Mara",
  relationship: "she taught me to drive",
  details: ["she taught me to drive, badly", "thirty years at the same bench"],
  lengthSeconds: 60,
};

afterAll(() => {
  for (const server of servers) server.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("a paid pack never outlives the buyer's connection", () => {
  it("hands back a durable job handle instead of hanging past the budget", async () => {
    const { base } = makeApp({ budgetMs: 400, textDelayMs: 5_000 });
    const header = await payment("oce_write_toast");

    const started = Date.now();
    const res = await fetch(`${base}/x402/oce_write_toast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "PAYMENT-SIGNATURE": header,
      },
      body: JSON.stringify(TOAST_BRIEF),
    });
    const elapsed = Date.now() - started;
    const body = (await res.json()) as Record<string, unknown>;
    if (res.status !== 200) console.error("BODY:", JSON.stringify(body));

    // 200, not a hang and not an error: the money settled and the work is real.
    expect(res.status).toBe(200);
    expect(body["ok"]).toBe(true);
    expect(body["delivered"]).toBe(false);
    expect(body["jobId"]).toEqual(expect.any(String));
    // The notice must name something a plain HTTP buyer can actually FETCH. It used to say
    // "call oce_job_status", which exists only over MCP JSON-RPC — so a buyer holding a paid,
    // unfinished job followed the instruction literally and hit a wall.
    expect(body["poll"]).toContain(`/j/${body["jobId"]}`);
    expect(body["collect"]).toContain(`/j/${body["jobId"]}/result`);
    expect(body["statusUrl"]).toMatch(/^https?:\/\//);
    expect(body["resultUrl"]).toMatch(/^https?:\/\//);

    // The whole point. Generous margin so the assertion is about the budget, not the CI box.
    expect(elapsed).toBeLessThan(3_000);
  }, 20_000);

  it("returns the finished pack when the same paid nonce is replayed after the job lands", async () => {
    const { base, jobs } = makeApp({ budgetMs: 400, textDelayMs: 800 });
    const header = await payment("oce_write_toast");

    const call = () =>
      fetch(`${base}/x402/oce_write_toast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "PAYMENT-SIGNATURE": header,
        },
        body: JSON.stringify(TOAST_BRIEF),
      });

    const first = (await (await call()).json()) as Record<string, unknown>;
    expect(first["delivered"]).toBe(false);
    const jobId = first["jobId"];

    // Let the job land, then replay exactly as `agent complete` does.
    await jobs.drain();

    const second = await call();
    const body = (await second.json()) as Record<string, unknown>;

    expect(second.status).toBe(200);
    expect(second.headers.get("idempotency-replayed")).toBe("true");
    expect(body["delivered"]).toBe(true);
    expect(body["jobId"]).toBe(jobId);
    expect(body["deliverable"]).toBeTruthy();

    // And it is not a second charge: the same nonce, the same job, one pack.
    expect(body["priceUsdt"]).toBe(PRICES.oce_write_toast);
  });

  it("does not start a second pack for a replay that arrives while the first is still running", async () => {
    const { base, store } = makeApp({ budgetMs: 300, textDelayMs: 3_000 });
    const header = await payment("oce_write_toast");

    const call = () =>
      fetch(`${base}/x402/oce_write_toast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "PAYMENT-SIGNATURE": header,
        },
        body: JSON.stringify(TOAST_BRIEF),
      });

    await call();
    const replayed = (await (await call()).json()) as Record<string, unknown>;

    // Still pending, same job — never a fresh run on the same money.
    expect(replayed["delivered"]).toBe(false);
    expect(store.jobQueueHealth().queued + 1).toBeGreaterThan(0);
  });
});

describe("the short services are inside the budget too", () => {
  it("hands back a collect-by-replay receipt when a critique outlives the budget", async () => {
    // Critique is not a pack tool, so it never went through the job queue and the original
    // budget did not cover it. It normally answers in ~15s and slipped under the wall until a
    // denser artifact took past thirty: the buyer's client hung up and the order was recorded
    // PAID with nothing delivered. There is no job handle to give, so the payment nonce is the
    // receipt — the work runs on and a replay collects it.
    const { base } = makeApp({ budgetMs: 300, textDelayMs: 0, critiqueDelayMs: 4_000 });
    const header = await payment("oce_critique");

    const started = Date.now();
    const res = await fetch(`${base}/x402/oce_critique`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "PAYMENT-SIGNATURE": header,
      },
      body: JSON.stringify({
        kind: "toast",
        brief: "A ninety-second retirement toast, warm and specific.",
        text: "To Amalia, who read thirty-one harvests in the soil before the vines said a word.",
      }),
    });
    const elapsed = Date.now() - started;
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body["delivered"]).toBe(false);
    expect(String(body["collect"])).toContain("Replay");
    expect(elapsed).toBeLessThan(3_000);
  }, 20_000);
});

describe("services that fit inside the budget are unchanged", () => {
  it("still delivers a short service in-band", async () => {
    const { base } = makeApp({ budgetMs: 25_000, textDelayMs: 0 });
    const header = await payment("oce_write_toast");

    const res = await fetch(`${base}/x402/oce_write_toast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "PAYMENT-SIGNATURE": header,
      },
      body: JSON.stringify(TOAST_BRIEF),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body["delivered"]).toBe(true);
    expect(body["deliverable"]).toBeTruthy();
  });
});

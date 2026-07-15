import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import sharp from "sharp";
import { OQS_VERSION } from "@occestra/tribunal";
import { encodeAbiParameters, getAddress, keccak256, parseAbiParameters, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FakeCritique,
  FakeImageModel,
  FakePlaces,
  FakeTextModel,
  FakeWeather,
  FixedClock,
} from "@occestra/providers";
import { Sealer, verifySeal } from "@occestra/receipts";
import type { EngineDeps } from "@occestra/studio-core";
import { DevGate, OkxGate, PRICES, TOOL_NAMES, toAtomic } from "../src/gate.js";
import { buildGrader } from "../src/grader.js";
import { buildApp } from "../src/http.js";
import { buildServer, type ServerContext } from "../src/server.js";
import { Store } from "../src/store.js";

const KEY: Hex = `0x${"11".repeat(32)}`;
const BUYER_KEY: Hex = `0x${"22".repeat(32)}`;
const REGISTRY = getAddress("0x000000000000000000000000000000000000dead");
const TREASURY = getAddress("0x000000000000000000000000000000000000beef");
const NOW = Date.parse("2026-07-12T10:00:00.000Z");

const dirs: string[] = [];

function makeCtx(over: Partial<ServerContext> = {}): ServerContext & { store: Store } {
  const dataDir = mkdtempSync(join(tmpdir(), "occestra-test-"));
  dirs.push(dataDir);

  const store = new Store({ dataDir, urlSecret: "test-secret", baseUrl: "http://test.local" });

  const deps: EngineDeps = {
    text: new FakeTextModel(() => "## The toast\n\nTo Mara, who taught me to drive. Badly.\n\n## The short version\n\nTo Mara.\n\n## If you get emotional\n\nJust raise the glass."),
    image: new FakeImageModel(),
    critique: new FakeCritique(88),
    storage: store.storage,
    clock: new FixedClock(NOW),
    weather: new FakeWeather(),
    places: new FakePlaces(),
  };

  return {
    deps,
    store,
    coverageGaps: [],
    // The real Tribunal, injected through the GradePort exactly as main.ts does it.
    grader: buildGrader({ deps }),
    sealer: new Sealer({ privateKey: KEY, chainId: 196, verifyingContract: REGISTRY }),
    publicBaseUrl: "http://test.local",
    chainId: 196,
    registry: REGISTRY,
    ...over,
  } as ServerContext & { store: Store };
}

async function connect(ctx: ServerContext) {
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    buildServer(ctx).connect(serverTransport),
  ]);
  return client;
}

const parse = (result: unknown): Record<string, unknown> => {
  const content = (result as { content: Array<{ text: string }> }).content;
  return JSON.parse(content[0]!.text) as Record<string, unknown>;
};

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------- tools */

describe("the tools", () => {
  it("lists exactly the priced tools, and nothing else", async () => {
    const ctx = makeCtx();
    const client = await connect(ctx);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();

    // Everything in the price table, plus the one tool whose price is not its own:
    // oce_create_pack_job costs exactly what the tool it runs costs.
    expect(names).toEqual([...TOOL_NAMES, "oce_create_pack_job"].sort());
    expect(names).toContain("oce_verify_keepsake");

    // Descriptions are the storefront — they must actually sell, and state the price.
    for (const tool of tools) {
      expect(tool.description!.length).toBeGreaterThan(200);
    }
    const critique = tools.find((tool) => tool.name === "oce_critique")!;
    expect(critique.description).toContain("0.01 USDT");
    expect(critique.description).toContain("/standard");
  });

  it("plans an occasion: real sources, a report, a sealed keepsake id", async () => {
    const ctx = makeCtx();
    const client = await connect(ctx);

    const result = parse(
      await client.callTool({
        name: "oce_plan_occasion",
        arguments: {
          occasion: "30th birthday dinner",
          city: "Lisbon",
          date: "2026-07-18",
          headcount: 12,
          vibe: "warm, candlelit",
          budgetUsd: 600,
        },
      }),
    );

    expect(result["keepsakeId"]).toMatch(/^oce_[0-9a-z]{22}$/);
    expect(result["studio"]).toBe("celebrate");

    const artifacts = result["artifacts"] as Array<Record<string, unknown>>;
    // Phase 7: the deep CELEBRATE pipeline also ships a self-contained guest guide.
    expect(artifacts.map((a) => a["kind"])).toEqual([
      "plan",
      "schedule",
      "budget",
      "contingency",
      "guest_guide",
    ]);
    const guide = artifacts.find((a) => a["kind"] === "guest_guide")!;
    expect(guide["content"]).toContain("<!doctype html>");
    expect(guide["content"]).not.toMatch(/<script/i);

    // Every grounded claim carries a source, and every artifact carries its report.
    const plan = artifacts[0]!;
    expect((plan["sources"] as unknown[]).length).toBeGreaterThan(0);
    for (const artifact of artifacts) {
      expect(artifact["tribunal"]).toBeDefined();
    }

    // The budget adds up, because the Tribunal would have hard-failed it otherwise.
    const budget = JSON.parse(artifacts.find((a) => a["kind"] === "budget")!["content"] as string) as {
      total: number;
      lineItems: Array<{ amount: number }>;
    };
    const sum = budget.lineItems.reduce((acc, item) => acc + item.amount, 0);
    expect(Math.abs(sum - budget.total)).toBeLessThanOrEqual(0.01);

    // It never claims a booking.
    expect(JSON.stringify(result)).toContain("NOT booked");
  });

  it("writes a toast and seals it — signature recovers to the sealer", async () => {
    const ctx = makeCtx();
    const client = await connect(ctx);

    const result = parse(
      await client.callTool({
        name: "oce_write_toast",
        arguments: { subject: "my sister Mara", relationship: "younger brother" },
      }),
    );

    const seal = result["seal"] as Record<string, unknown>;
    expect(seal["signer"]).toBe(privateKeyToAccount(KEY).address);
    expect(seal["packKind"]).toBe(1); // remember
    expect(seal["leaf"]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(seal["anchored"]).toBe(false); // queued, and honest about it

    // The leaf is exactly what the contract will store.
    const expectedLeaf = keccak256(
      encodeAbiParameters(parseAbiParameters("bytes32, bytes32, uint8, uint64"), [
        keccak256(toBytes(result["keepsakeId"] as string)),
        seal["manifestHash"] as Hex,
        1,
        BigInt(seal["createdAt"] as number),
      ]),
    );
    expect(seal["leaf"]).toBe(expectedLeaf);
  });

  it("critique: hard-fails a submitted image whose dimensions lie about themselves", async () => {
    const ctx = makeCtx();
    const client = await connect(ctx);

    const png = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 220, g: 30, b: 30 } },
    })
      .png()
      .toBuffer();

    const result = parse(
      await client.callTool({
        name: "oce_critique",
        arguments: {
          kind: "invitation",
          brief: "a formal wedding invitation, portrait",
          imageBase64: png.toString("base64"),
          size: "1024x1536", // it is NOT this size
          styleId: "sunprint",
        },
      }),
    );

    expect(result["verdict"]).toBe("FAIL");

    const hard = result["hardFailures"] as Array<Record<string, unknown>>;
    expect(hard.map((check) => check["id"])).toContain("DIM_ASPECT_MISMATCH");

    // A red image against the sunprint blues is a soft palette failure, not a hard one.
    const soft = result["softFailures"] as Array<Record<string, unknown>>;
    expect(soft.map((check) => check["id"])).toContain("PALETTE_DRIFT");

    expect(result["repairBrief"]).toContain("MUST");
    expect(result["oqsVersion"]).toBe(OQS_VERSION);
  });

  it("refuses a policy-violating brief politely — and does no work", async () => {
    const ctx = makeCtx();
    const client = await connect(ctx);

    const result = (await client.callTool({
      name: "oce_design_invite",
      arguments: {
        occasion: "a Disney princess party with Elsa and Pikachu",
        date: "2026-08-01",
      },
    })) as { isError?: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/original work/i);
    expect(ctx.store.orders()).toHaveLength(0); // nothing was made, nothing was charged
  });

  it("verify_keepsake round-trips a sealed pack, and says 'not found' for anything else", async () => {
    const ctx = makeCtx();
    const client = await connect(ctx);

    const made = parse(
      await client.callTool({
        name: "oce_write_toast",
        arguments: { subject: "Mara" },
      }),
    );

    const verified = parse(
      await client.callTool({
        name: "oce_verify_keepsake",
        arguments: { keepsakeId: made["keepsakeId"] },
      }),
    );

    expect(verified["found"]).toBe(true);
    expect((verified["seal"] as Record<string, unknown>)["signatureValid"]).toBe(true);
    expect(verified["anchored"]).toBe(false);
    expect(verified["note"]).toContain("queued");

    // Independently: the seal verifies against the pack alone, with no server involved.
    const pack = ctx.store.getPack(made["keepsakeId"] as string)!;
    expect(await verifySeal(pack.seal!)).toBe(true);

    const missing = parse(
      await client.callTool({
        name: "oce_verify_keepsake",
        arguments: { keepsakeId: "oce_0zzzzzzzzzzzzzzzzzzzzz" },
      }),
    );
    expect(missing["found"]).toBe(false);
  });
});

/* -------------------------------------------------------------------- gate */

describe("payment gate", () => {
  it("issues a documented x402 v2 challenge for an unpaid call", async () => {
    const store = makeCtx().store;
    const gate = new OkxGate({
      store,
      treasury: TREASURY,
      chainId: 196,
      publicBaseUrl: "https://api.occestra.xyz",
      now: () => NOW,
    });

    const verdict = await gate.check({ headers: {} }, "oce_design_invite", 0.1);
    expect(verdict.ok).toBe(false);
    if (verdict.ok || verdict.status !== 402) throw new Error("expected a 402");

    // The exact shape from the OKX A2MCP docs, read 2026-07-12.
    expect(verdict.challenge.x402Version).toBe(2);
    const accepts = verdict.challenge.accepts[0]!;
    expect(accepts.scheme).toBe("exact");
    expect(accepts.network).toBe("eip155:196");
    expect(accepts.payTo).toBe(TREASURY);
    expect(accepts.amount).toBe("100000"); // 0.10 USDT at 6dp
    expect(accepts.maxTimeoutSeconds).toBe(300);
    expect(accepts.extra).toEqual({ name: "USD₮0", version: "1" });

    // And the same challenge, base64, is what goes in the PAYMENT-REQUIRED header.
    expect(JSON.parse(Buffer.from(verdict.headerValue, "base64").toString())).toEqual(
      verdict.challenge,
    );
  });

  it("accepts a correctly-signed EIP-3009 authorization, and refuses a replay of it", async () => {
    const store = makeCtx().store;
    const asset = "0x779ded0c9e1022225f8e0630b35a9b54be713736" as const;

    const gate = new OkxGate({
      store,
      treasury: TREASURY,
      asset,
      chainId: 196,
      now: () => NOW,
      // No settlementKey: verify-only, so the test never touches the chain.
    });

    const buyer = privateKeyToAccount(BUYER_KEY);
    const nonce = keccak256(toBytes("nonce-1"));
    const authorization = {
      from: buyer.address,
      to: TREASURY,
      value: toAtomic(0.1),
      validAfter: 0n,
      validBefore: BigInt(Math.floor(NOW / 1000) + 300),
      nonce,
    };

    const signature = await buyer.signTypedData({
      domain: { name: "USD₮0", version: "1", chainId: 196, verifyingContract: asset },
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

    const header = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        scheme: "exact",
        network: "eip155:196",
        payload: {
          signature,
          authorization: {
            ...authorization,
            value: authorization.value.toString(),
            validAfter: "0",
            validBefore: authorization.validBefore.toString(),
          },
        },
      }),
    ).toString("base64");

    const paid = await gate.check(
      { headers: { "payment-signature": header } },
      "oce_design_invite",
      0.1,
    );
    expect(paid.ok).toBe(true);
    if (!paid.ok) throw new Error("expected payment to verify");
    expect(paid.payerRef).toBe(buyer.address.toLowerCase());
    expect(paid.settled).toBe(false); // verified, not redeemed — and it says so

    // The same authorization, presented twice, is not two payments.
    const replayed = await gate.check(
      { headers: { "payment-signature": header } },
      "oce_design_invite",
      0.1,
    );
    expect(replayed.ok).toBe(false);
    if (replayed.ok || replayed.status !== 400) throw new Error("expected a rejected replay");
    expect(replayed.reason).toContain("already been used");
  });

  it("refuses payment addressed elsewhere, short payment, and an expired window", async () => {
    const store = makeCtx().store;
    const gate = new OkxGate({ store, treasury: TREASURY, chainId: 196, now: () => NOW });

    const buyer = privateKeyToAccount(BUYER_KEY);

    const sign = async (over: Record<string, unknown>) => {
      const authorization = {
        from: buyer.address,
        to: TREASURY,
        value: toAtomic(0.1),
        validAfter: 0n,
        validBefore: BigInt(Math.floor(NOW / 1000) + 300),
        nonce: keccak256(toBytes(`n-${Math.random()}`)),
        ...over,
      };
      return Buffer.from(
        JSON.stringify({
          payload: {
            // The signature does not need to be valid for the checks that run BEFORE it.
            signature: `0x${"ab".repeat(65)}`,
            authorization: {
              ...authorization,
              value: String(authorization.value),
              validAfter: String(authorization.validAfter),
              validBefore: String(authorization.validBefore),
            },
          },
        }),
      ).toString("base64");
    };

    const wrongPayee = await gate.check(
      { headers: { "payment-signature": await sign({ to: getAddress("0x00000000000000000000000000000000000000aa") }) } },
      "oce_design_invite",
      0.1,
    );
    expect(wrongPayee).toMatchObject({ ok: false, status: 400 });
    expect((wrongPayee as { reason: string }).reason).toContain("not addressed to the Occestra treasury");

    const short = await gate.check(
      { headers: { "payment-signature": await sign({ value: toAtomic(0.01) }) } },
      "oce_design_invite",
      0.1,
    );
    expect((short as { reason: string }).reason).toContain("payment is short");

    const expired = await gate.check(
      { headers: { "payment-signature": await sign({ validBefore: BigInt(Math.floor(NOW / 1000) - 10) }) } },
      "oce_design_invite",
      0.1,
    );
    expect((expired as { reason: string }).reason).toContain("validity window");
  });

  it("gives the nonce back when settlement fails — no money moved, so the authorization stands", async () => {
    const store = makeCtx().store;
    const nonce = keccak256(toBytes("released"));

    expect(store.claimNonce(nonce, "0xabc", "oce_critique")).toBe(true);
    expect(store.claimNonce(nonce, "0xabc", "oce_critique")).toBe(false); // spent

    store.releaseNonce(nonce);

    // The buyer signed a good authorization; we simply failed to collect it. They must be
    // able to present it again rather than re-sign a payment they already made.
    expect(store.claimNonce(nonce, "0xabc", "oce_critique")).toBe(true);
  });

  it("never gates the free tool, even in deny mode", async () => {
    const store = makeCtx().store;
    const gate = new OkxGate({ store, treasury: TREASURY, chainId: 196 });

    const verdict = await gate.check({ headers: {} }, "oce_verify_keepsake", PRICES.oce_verify_keepsake);
    expect(verdict).toMatchObject({ ok: true, payerRef: "free" });
  });
});

/* -------------------------------------------------------------------- http */

describe("http surface", () => {
  let server: ReturnType<ReturnType<typeof buildApp>["listen"]>;
  let base: string;
  let ctx: ServerContext & { store: Store };

  const start = async (gate: DevGate | OkxGate) => {
    ctx = makeCtx();
    const app = buildApp({ ...ctx, gate, sealerAddress: privateKeyToAccount(KEY).address, live: { text: true } });
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const rpc = (name: string, args: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });

  it("serves /health and the well-known manifest", async () => {
    await start(new DevGate());

    const health = await (await fetch(`${base}/health`)).json();
    expect(health).toMatchObject({ ok: true, service: "occestra", oqsVersion: OQS_VERSION });

    const manifest = await (await fetch(`${base}/.well-known/occestra.json`)).json();
    expect(manifest.name).toBe("Occestra");
    expect(manifest.transport).toMatchObject({ type: "mcp", protocol: "streamable-http" });
    expect(manifest.payment).toMatchObject({
      standard: "x402",
      x402Version: 2,
      proofHeader: "PAYMENT-SIGNATURE",
    });
    // Everything in the price table, plus oce_create_pack_job — whose price is not its own.
    expect(manifest.tools).toHaveLength(TOOL_NAMES.length + 1);
    expect(manifest.async.create).toBe("oce_create_pack_job");
    expect(manifest.idempotency.header).toBe("Idempotency-Key");

    // The manifest is what a buying agent reads BEFORE it can sign anything, and the standard,
    // the styles and the refund policy are the three things it cannot get anywhere else.
    expect(manifest.quality.profiles).toHaveLength(4);
    const visualProfile = manifest.quality.profiles.find((p: { id: string }) => p.id === "visual");
    expect(visualProfile.axes).toContain("subject_fidelity"); // the map-incident axis, published
    expect(manifest.quality.checks.length).toBeGreaterThanOrEqual(13);
    expect(manifest.styles[0].bestFor).toBeTruthy();
    expect(manifest.refunds.policy).toContain("settles before the work runs");
    expect(manifest.provenance.verify).toContain("free");
    expect(manifest.tools.find((t: { name: string }) => t.name === "oce_verify_keepsake").free).toBe(true);
    expect(manifest.styles).toHaveLength(4);
    expect(manifest.quality.version).toBe(OQS_VERSION);
  });

  it("publishes the rubric it actually runs", async () => {
    await start(new DevGate());

    const rubric = await (await fetch(`${base}/standard`, { headers: { accept: "application/json" } })).json();
    expect(rubric.oqsVersion).toBe(OQS_VERSION);
    expect(rubric.checks).toHaveLength(13);
    expect(
      rubric.profiles.every((p: { axes: { threshold: number }[] }) =>
        p.axes.every((axis) => axis.threshold === 70),
      ),
    ).toBe(true);
  });

  it("402s an unpaid paid tool with the challenge in the PAYMENT-REQUIRED header", async () => {
    await start(new OkxGate({ store: makeCtx().store, treasury: TREASURY, chainId: 196 }));

    const response = await rpc("oce_design_invite", { occasion: "a party", date: "2026-08-01" });

    expect(response.status).toBe(402);

    const header = response.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();

    const decoded = JSON.parse(Buffer.from(header!, "base64").toString());
    expect(decoded.x402Version).toBe(2);

    // And the manifest advertises the SAME asset, so a buyer never has to provoke a 402 to
    // find out what token we take. This field used to be `undefined : undefined` — a ternary
    // with the same answer on both branches — so the one thing needed before signing anything
    // was the one thing we never said.
    const manifest = await (await fetch(`${base}/.well-known/occestra.json`)).json();
    expect(manifest.payment.asset).toBe(decoded.accepts[0].asset);
    expect(manifest.payment.payTo).toBe(decoded.accepts[0].payTo);
    expect(manifest.payment.decimals).toBe(6);
    // Priced from the table, never from a number typed into a test — a repricing must not
    // need this file edited, or the test is asserting history rather than behaviour.
    expect(decoded.accepts[0].amount).toBe(toAtomic(PRICES.oce_design_invite).toString());
    expect(decoded.accepts[0].network).toBe("eip155:196");

    const body = await response.json();
    expect(body).toEqual(decoded); // body and header agree
  });

  it("does the work in dev mode, and never gates the free tool even under a real gate", async () => {
    await start(new DevGate());

    const paid = await rpc("oce_write_toast", { subject: "Mara" });
    expect(paid.status).toBe(200);

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await start(new OkxGate({ store: makeCtx().store, treasury: TREASURY, chainId: 196 }));

    const free = await rpc("oce_verify_keepsake", { keepsakeId: "oce_0zzzzzzzzzzzzzzzzzzzzz" });
    expect(free.status).toBe(200); // free forever, even with the paywall armed
  });

  it("rejects GET and DELETE on the stateless endpoint", async () => {
    await start(new DevGate());
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
    expect((await fetch(`${base}/mcp`, { method: "DELETE" })).status).toBe(405);
  });

  it("serves artifact bytes ONLY with a valid, unexpired token", async () => {
    await start(new DevGate());

    await ctx.store.storage.put("test/a.png", new Uint8Array([137, 80, 78, 71]), "image/png");
    const signed = ctx.store.signedUrlFor("test/a.png", 3600);
    const path = signed.replace("http://test.local", base);

    expect((await fetch(path)).status).toBe(200);

    // Tampered token, and a bare URL with no token at all.
    expect((await fetch(path.replace(/tok=.{8}/, "tok=deadbeef"))).status).toBe(403);
    expect((await fetch(`${base}/a/test/a.png`)).status).toBe(403);

    // An expired link is dead even though the signature is otherwise correct.
    const expired = ctx.store.signedUrlFor("test/a.png", -10).replace("http://test.local", base);
    expect((await fetch(expired)).status).toBe(403);
  });

  it("rate-limits a burst from one IP", async () => {
    await start(new DevGate());

    // A caller off the internet. Caddy stamps x-forwarded-for on everything it proxies, so
    // a request that carries one is public traffic and is limited exactly as before.
    const responses = await Promise.all(
      Array.from({ length: 70 }, () =>
        fetch(`${base}/health`, { headers: { "x-forwarded-for": "203.0.113.7" } }),
      ),
    );
    const limited = responses.filter((response) => response.status === 429);

    expect(limited.length).toBeGreaterThan(0);
    expect(responses.filter((r) => r.status === 200).length).toBeLessThanOrEqual(60);
  });

  it("does NOT rate-limit our own server-side renders", async () => {
    await start(new DevGate());

    // The web app fetches packs over loopback while rendering a page, and the gallery needs
    // seventeen of them for ONE view. Counting those against a 60/min ceiling took the site
    // down: the ASP 429'd, /k pages 404'd, and the gallery emptied — for everyone at once.
    const responses = await Promise.all(Array.from({ length: 90 }, () => fetch(`${base}/health`)));

    expect(responses.every((response) => response.status === 200)).toBe(true);
  });
});

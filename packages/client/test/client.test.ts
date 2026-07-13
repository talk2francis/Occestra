/**
 * SDK round-trips against a real local server instance (fake providers, real
 * pipelines, real Tribunal, real sealer) — the same wiring production uses,
 * minus the network and the models.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { getAddress, verifyTypedData, type Hex } from "viem";
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
import { DevGate } from "@occestra/mcp-server/dist/gate.js";
import { buildGrader } from "@occestra/mcp-server/dist/grader.js";
import { buildApp, type AppContext } from "@occestra/mcp-server/dist/http.js";
import { Store } from "@occestra/mcp-server/dist/store.js";
import { Occestra, buildPaymentProof } from "../src/index.js";

const KEY: Hex = `0x${"11".repeat(32)}`;
const REGISTRY = getAddress("0x000000000000000000000000000000000000dead");

const dirs: string[] = [];
const servers: Server[] = [];

function startServer(): string {
  const dataDir = mkdtempSync(join(tmpdir(), "occestra-sdk-test-"));
  dirs.push(dataDir);
  const store = new Store({ dataDir, urlSecret: "test", baseUrl: "http://sdk.local" });
  const deps: EngineDeps = {
    text: new FakeTextModel(() => "## The toast\n\nTo Mara, who taught me to drive. Badly."),
    image: new FakeImageModel(),
    critique: new FakeCritique(88),
    storage: store.storage,
    clock: new FixedClock(Date.parse("2026-07-13T10:00:00Z")),
    weather: new FakeWeather(),
    places: new FakePlaces(),
  };
  const ctx: AppContext = {
    deps,
    store,
    coverageGaps: [],
    grader: buildGrader({ deps }),
    sealer: new Sealer({ privateKey: KEY, chainId: 196, verifyingContract: REGISTRY }),
    publicBaseUrl: "http://sdk.local",
    chainId: 196,
    registry: REGISTRY,
    gate: new DevGate(),
  };
  const server = buildApp(ctx).listen(0);
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterAll(() => {
  for (const server of servers) server.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("SDK round-trips", () => {
  it("1 · writeToast returns a graded, sealed PackResult", async () => {
    const studio = new Occestra({ endpoint: startServer() });
    const pack = await studio.writeToast({ subject: "Mara", details: "she taught me to drive" });
    expect(pack.keepsakeId).toMatch(/^oce_[0-9a-z]{22}$/);
    expect(pack.artifacts[0]?.tribunal?.pass).toBe(true);
    expect(pack.seal?.signer).toBeTruthy();
    expect(pack.publicPage).toContain(pack.keepsakeId);
  });

  it("2 · critique grades an external artifact and reports honestly", async () => {
    const studio = new Occestra({ endpoint: startServer() });
    const report = await studio.critique({
      kind: "launch_thread",
      brief: "announce a CLI tool without hype",
      text: "Post 1: our tool does one thing well and here is exactly what.",
    });
    expect(report.artifacts[0]?.tribunal).toBeDefined();
    expect(report.quality.oqsVersion).toBe("1.0.0");
  });

  it("3 · verifyKeepsake round-trips the seal of a pack we just made — free path", async () => {
    const endpoint = startServer();
    const studio = new Occestra({ endpoint });
    const pack = await studio.moodboard({ subject: "a rooftop dinner at dusk" });
    const verdict = await studio.verifyKeepsake(pack.keepsakeId);
    expect(verdict.found).toBe(true);
    expect(verdict.seal?.signatureValid).toBe(true);
    expect(verdict.seal?.leaf).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("4 · getPack serves the public pack with fresh artifact URLs", async () => {
    const endpoint = startServer();
    const studio = new Occestra({ endpoint });
    const made = await studio.moodboard({ subject: "sunprint botanicals" });
    const publicPack = await studio.getPack(made.keepsakeId);
    expect(publicPack?.studio).toBeDefined();
    expect(publicPack?.artifacts.length).toBeGreaterThan(0);
    expect(await studio.getPack("oce_0000000000000000000000")).toBeUndefined();
  });

  it("5 · capabilities + stats are reachable through the client", async () => {
    const studio = new Occestra({ endpoint: startServer() });
    const caps = (await studio.capabilities()) as { taskTypes: unknown[] };
    expect(caps.taskTypes).toHaveLength(3);
    const stats = await studio.stats();
    expect(typeof stats["packsCreated"]).toBe("number");
  });

  it("6 · a paid tool without a payment key throws a useful error, not a mystery", async () => {
    // DevGate never 402s, so simulate the gate's answer with a fetch shim.
    const studio = new Occestra({
      endpoint: "http://paid.local",
      fetch: (async () =>
        new Response(JSON.stringify({ x402Version: 2, accepts: [] }), { status: 402 })) as typeof fetch,
    });
    await expect(studio.writeToast({ subject: "x" })).rejects.toThrow(/payment key/);
  });

  it("7 · buildPaymentProof signs a verifiable EIP-3009 authorization for the exact amount", async () => {
    const proof = await buildPaymentProof(
      {
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:196",
            asset: getAddress("0x779ded0c9e1022225f8e0630b35a9b54be713736"),
            amount: "10000",
            payTo: getAddress("0x000000000000000000000000000000000000beef"),
            maxTimeoutSeconds: 300,
            extra: { name: "USD₮0", version: "1" },
          },
        ],
      },
      KEY,
    );

    const decoded = JSON.parse(Buffer.from(proof, "base64").toString("utf8")) as {
      payload: { signature: Hex; authorization: Record<string, string> };
    };
    const auth = decoded.payload.authorization;
    expect(auth["value"]).toBe("10000");
    expect(auth["to"]).toBe(getAddress("0x000000000000000000000000000000000000beef"));

    const valid = await verifyTypedData({
      address: getAddress("0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A"), // the address of KEY
      domain: {
        name: "USD₮0",
        version: "1",
        chainId: 196,
        verifyingContract: getAddress("0x779ded0c9e1022225f8e0630b35a9b54be713736"),
      },
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
      message: {
        from: auth["from"] as Hex,
        to: auth["to"] as Hex,
        value: BigInt(auth["value"]!),
        validAfter: BigInt(auth["validAfter"]!),
        validBefore: BigInt(auth["validBefore"]!),
        nonce: auth["nonce"] as Hex,
      },
      signature: decoded.payload.signature,
    });
    expect(valid).toBe(true);
  });
});

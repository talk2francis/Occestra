import { keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { manifestHash, type Artifact, type Pack } from "@occestra/studio-core";
import {
  EIP712_TYPES,
  Sealer,
  chainFor,
  domain,
  leafOf,
  leafOfSeal,
  recoverSealer,
  verifyPack,
  verifySeal,
} from "../src/index.js";

const KEY: Hex = `0x${"11".repeat(32)}`;
const OTHER_KEY: Hex = `0x${"22".repeat(32)}`;
const REGISTRY = "0x000000000000000000000000000000000000dEaD" as const;

const artifact = (over: Partial<Artifact> = {}): Artifact => ({
  id: "a_1",
  kind: "keepsake_art",
  title: "Porto, at dusk",
  format: "png",
  uri: "keepsakes/porto.png",
  sources: [],
  version: 1,
  ...over,
});

const pack = (over: Partial<Pack> = {}): Pack => ({
  id: "oce_0abcdefghjkmnpqrstvwxy",
  contractId: "r_1",
  studio: "remember",
  artifacts: [artifact()],
  coverageGaps: [],
  quality: { oqsVersion: "1.0.0", passRate: 1, repairedCount: 0 },
  createdAt: "2026-07-12T10:00:00.000Z",
  ...over,
});

const baseLeaf = {
  keepsakeId: "oce_0abcdefghjkmnpqrstvwxy",
  manifestHash: keccak256(toBytes("manifest")) as Hex,
  packKind: 1,
  createdAt: 1_752_314_400,
};

const sealerOf = (key: Hex = KEY) =>
  new Sealer({ privateKey: key, chainId: 196, verifyingContract: REGISTRY });

describe("leaf encoding", () => {
  it("is deterministic — the same inputs always produce the same 32 bytes", () => {
    const a = leafOf(baseLeaf);
    const b = leafOf({ ...baseLeaf });
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes if ANY field changes — id, manifest, kind, or timestamp", () => {
    const base = leafOf(baseLeaf);
    expect(leafOf({ ...baseLeaf, keepsakeId: "oce_1abcdefghjkmnpqrstvwxy" })).not.toBe(base);
    expect(leafOf({ ...baseLeaf, manifestHash: keccak256(toBytes("tampered")) })).not.toBe(base);
    expect(leafOf({ ...baseLeaf, packKind: 2 })).not.toBe(base);
    expect(leafOf({ ...baseLeaf, createdAt: baseLeaf.createdAt + 1 })).not.toBe(base);
  });

  it("is exactly keccak256(abi.encode(...)) — hand-computed, so Solidity can be held to it", () => {
    // abi.encode packs each value into a 32-byte word, in order.
    const idHash = keccak256(toBytes(baseLeaf.keepsakeId)).slice(2);
    const manifest = baseLeaf.manifestHash.slice(2);
    const kind = baseLeaf.packKind.toString(16).padStart(64, "0");
    const created = baseLeaf.createdAt.toString(16).padStart(64, "0");
    const expected = keccak256(`0x${idHash}${manifest}${kind}${created}` as Hex);

    expect(leafOf(baseLeaf)).toBe(expected);
  });
});

describe("EIP-712 seals", () => {
  it("seals a degraded pack while committing to its honest undelivered record", async () => {
    const degraded = pack({
      artifacts: [
        artifact({
          format: "md",
          uri: undefined,
          data: undefined,
          undelivered: {
            code: "writer:no_usable_output",
            reason: "The writer could not produce usable copy for this piece.",
          },
        }),
      ],
      quality: { oqsVersion: "1.2.0", passRate: 1, repairedCount: 0, undeliveredCount: 1 },
    });

    const sealed = await sealerOf().seal(degraded);
    expect(sealed.seal.manifestHash).toBe(manifestHash(degraded));
    expect(await verifyPack(sealed)).toMatchObject({ valid: true });
  });

  it("signs a pack and the signature recovers to the sealer's own address", async () => {
    const sealer = sealerOf();
    const sealed = await sealer.seal(pack());

    expect(sealed.seal.signer).toBe(privateKeyToAccount(KEY).address);
    expect(await recoverSealer(sealed.seal)).toBe(sealer.signer);
    expect(await verifySeal(sealed.seal)).toBe(true);
    expect(sealed.seal.packKind).toBe(1); // remember
    expect(sealed.seal.manifestHash).toBe(manifestHash(pack()));
  });

  it("never mutates the pack it seals", async () => {
    const original = pack();
    const snapshot = JSON.stringify(original);
    const sealed = await sealerOf().seal(original);

    expect(JSON.stringify(original)).toBe(snapshot);
    expect(original).not.toHaveProperty("seal");
    expect(sealed).not.toBe(original);
  });

  it("rejects a signature checked against the wrong signer", async () => {
    const sealed = await sealerOf().seal(pack());
    const stranger = privateKeyToAccount(OTHER_KEY).address;

    expect(await verifySeal(sealed.seal, stranger)).toBe(false);
    expect(await verifySeal(sealed.seal, sealed.seal.signer)).toBe(true);
  });

  it("catches a pack tampered with AFTER sealing — the whole point of the seal", async () => {
    const sealed = await sealerOf().seal(pack());
    expect((await verifyPack(sealed)).valid).toBe(true);

    // Swap the artwork for a different file, keeping the seal attached.
    const tampered = {
      ...sealed,
      artifacts: [artifact({ uri: "keepsakes/not-the-same-image.png" })],
    };
    const verdict = await verifyPack(tampered);

    expect(verdict.valid).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("altered since it was sealed");
    // ...and the leaf it would anchor to is a different leaf entirely.
    expect(leafOfSeal(sealed.seal)).not.toBe(
      leafOf({
        keepsakeId: tampered.id,
        manifestHash: manifestHash(tampered),
        packKind: tampered.seal.packKind,
        createdAt: tampered.seal.createdAt,
      }),
    );
  });

  it("binds the signature to the Occestra domain, chain, and registry", async () => {
    const sealed = await sealerOf().seal(pack());
    const d = domain({ chainId: 196, verifyingContract: REGISTRY });

    expect(d.name).toBe("Occestra");
    expect(d.version).toBe("1");
    expect(EIP712_TYPES.Keepsake.map((f) => f.name)).toEqual([
      "keepsakeId",
      "manifestHash",
      "packKind",
      "createdAt",
    ]);

    // The same bytes signed for a different chain must not verify against this seal.
    const crossChain = { ...sealed.seal, chainId: 195 };
    expect(await verifySeal(crossChain)).toBe(false);
  });
});

describe("chains", () => {
  it("knows X Layer mainnet and testnet, and refuses anywhere else", () => {
    expect(chainFor(196).id).toBe(196);
    expect(chainFor(196).rpcUrls.default.http[0]).toBe("https://rpc.xlayer.tech");
    expect(chainFor(195).testnet).toBe(true);
    expect(() => chainFor(1)).toThrow(/only seals on X Layer/);
  });
});

import { keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";
import { canonicalJson, hashCanonical, manifestHash, manifestOf } from "../src/index.js";
import { artifact, pack } from "./fixtures.js";

describe("canonicalJson", () => {
  it("is invariant to key insertion order, at every depth", () => {
    const a = { b: 1, a: { z: [1, 2], y: { q: true, p: null } } };
    const b = { a: { y: { p: null, q: true }, z: [1, 2] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"y":{"p":null,"q":true},"z":[1,2]},"b":1}');
  });

  it("preserves array order — arrays are meaning, not sets", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it("renders bigint as a decimal string and drops undefined from objects", () => {
    expect(canonicalJson({ n: 10n ** 20n })).toBe('{"n":"100000000000000000000"}');
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson({})).toBe("{}");
  });

  it("refuses values it cannot represent deterministically", () => {
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
    expect(() => canonicalJson([1, undefined, 2])).toThrow(TypeError); // would shift indices
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson({ b: new Uint8Array([1]) })).toThrow(TypeError);
  });
});

describe("manifest hashing", () => {
  it("is stable across re-serialisation of the same pack", () => {
    const p = pack();
    const roundTripped = JSON.parse(JSON.stringify(p)) as typeof p;
    expect(manifestHash(p)).toBe(manifestHash(roundTripped));
    expect(manifestHash(p)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("ignores fields provenance does not cover (titles, seal, tribunal report)", () => {
    const base = pack();
    const noisy = pack({
      artifacts: [artifact({ title: "A completely different title", tribunal: { pass: false } })],
      seal: undefined,
    });
    expect(manifestHash(noisy)).toBe(manifestHash(base));
  });

  it("changes if ANY covered part of ANY artifact changes", () => {
    const base = manifestHash(pack());

    expect(manifestHash(pack({ artifacts: [artifact({ data: '{"steps":["arrive"]}' })] }))).not.toBe(base);
    expect(manifestHash(pack({ artifacts: [artifact({ id: "a_2" })] }))).not.toBe(base);
    expect(manifestHash(pack({ artifacts: [artifact({ kind: "toast" })] }))).not.toBe(base);
    expect(manifestHash(pack({ createdAt: "2026-07-12T10:00:01.000Z" }))).not.toBe(base);
    expect(manifestHash(pack({ id: "oce_1abcdefghjkmnpqrstvwxy" }))).not.toBe(base);
    // Reordering artifacts is a different pack.
    const two = [artifact({ id: "a_1" }), artifact({ id: "a_2", data: "second" })];
    expect(manifestHash(pack({ artifacts: two }))).not.toBe(
      manifestHash(pack({ artifacts: [...two].reverse() })),
    );
  });

  it("hashes binary artifacts by storage key, and refuses artifacts with no content at all", () => {
    const withUri = pack({
      artifacts: [artifact({ format: "png", data: undefined, uri: "s/keepsake.png" })],
    });
    expect(manifestOf(withUri).artifacts[0]!.hash).toBe(keccak256(toBytes("s/keepsake.png")));
    expect(manifestHash(withUri)).toMatch(/^0x[0-9a-f]{64}$/);

    const empty = pack({ artifacts: [artifact({ data: undefined, uri: undefined })] });
    expect(() => manifestHash(empty)).toThrow(TypeError);
  });

  it("hashCanonical is exactly keccak256 over the canonical utf8 bytes — verifiable by anyone", () => {
    const value = { b: 2, a: 1 };
    expect(hashCanonical(value)).toBe(keccak256(toBytes('{"a":1,"b":2}')));
  });
});

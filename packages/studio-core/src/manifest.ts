/**
 * Canonical JSON + manifest hashing.
 *
 * This is the trust spine: manifestHash is what gets anchored on X Layer, so the bytes
 * produced here must be reproducible by anyone, forever, from the published pack. Any
 * change to canonicalJson's semantics is a breaking, un-verifiable change to every seal
 * already on chain. Treat it as frozen (AGENTS.md).
 */
import { concat, keccak256, toBytes, type Hex } from "viem";
import { PackKindCode, type Artifact, type Pack, type PackKind } from "./types.js";

/**
 * Deterministic JSON: object keys sorted recursively, no whitespace, bigint as a decimal
 * string, undefined dropped (from objects) and rejected (in arrays, where dropping would
 * silently shift indices).
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined) {
    throw new TypeError("canonicalJson: undefined is not representable at the top level");
  }
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "bigint":
      return `"${value.toString(10)}"`;
    case "number": {
      if (!Number.isFinite(value)) {
        throw new TypeError(`canonicalJson: ${value} is not representable`);
      }
      // JSON.stringify already emits the shortest round-trippable form.
      return JSON.stringify(value);
    }
    case "object":
      break;
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map((item) => {
        if (item === undefined) {
          throw new TypeError("canonicalJson: undefined inside an array would shift indices");
        }
        return serialize(item);
      })
      .join(",")}]`;
  }

  if (value instanceof Uint8Array) {
    throw new TypeError("canonicalJson: hash bytes before hashing the manifest");
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${serialize(v)}`).join(",")}}`;
}

/** keccak256 over the utf8 bytes of a canonical JSON string. */
export function hashCanonical(value: unknown): `0x${string}` {
  return keccak256(toBytes(canonicalJson(value)));
}

/** Content hash of a single artifact: its inline data if present, else its storage key. */
export function artifactContentHash(artifact: Artifact): `0x${string}` {
  const content = artifact.data ?? artifact.uri;
  if (content === undefined) {
    throw new TypeError(`artifact ${artifact.id} has neither data nor uri — nothing to hash`);
  }
  return keccak256(toBytes(content));
}

export interface PackManifest {
  id: string;
  studio: string;
  oqsVersion: string;
  createdAt: string;
  artifacts: Array<{ id: string; kind: string; hash: `0x${string}` }>;
}

/**
 * The stable subset of a pack that provenance covers. Deliberately excludes mutable or
 * non-essential fields (titles, tribunal reports, seal) so that re-serialising a stored
 * pack always reproduces the same hash. Artifacts keep their order — order is meaning.
 */
export function manifestOf(pack: Pack): PackManifest {
  return {
    id: pack.id,
    studio: pack.studio,
    oqsVersion: pack.quality.oqsVersion,
    createdAt: pack.createdAt,
    artifacts: pack.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      hash: artifactContentHash(artifact),
    })),
  };
}

export function manifestHash(pack: Pack): `0x${string}` {
  return hashCanonical(manifestOf(pack));
}

/**
 * A SALTED manifest commitment: keccak256(salt || canonicalManifest).
 *
 * For a private keepsake, the bare manifest hash is a problem even though it is a hash: it is
 * DETERMINISTIC, so anyone who obtains the pack can recompute it and confirm it is the thing on
 * chain, and two identical manifests commit to the same leaf, which is linkable. Prepending 32
 * random bytes fixes both — the on-chain leaf reveals nothing and links to nothing without the
 * salt, and the owner, holding the salt, can still verify the commitment independently.
 *
 * The salt is 32 bytes (0x-prefixed hex). It is concatenated BEFORE the canonical manifest bytes
 * and the whole is hashed. Order matters and is frozen, exactly like canonicalJson.
 */
export function saltedManifestCommitment(pack: Pack, salt: Hex): `0x${string}` {
  const saltBytes = toBytes(salt);
  if (saltBytes.length !== 32) {
    throw new TypeError(`salt must be 32 bytes, got ${saltBytes.length}`);
  }
  return keccak256(concat([saltBytes, toBytes(canonicalJson(manifestOf(pack)))]));
}

export function packKindCode(kind: PackKind): number {
  return PackKindCode[kind];
}

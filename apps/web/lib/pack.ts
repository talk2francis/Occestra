/**
 * The public keepsake shape served by the ASP at /k/:id, plus the seal-leaf
 * math — the exact construction published in AGENTS.md and implemented by
 * KeepsakeRegistry.sol, so the browser can verify without trusting us.
 */
import { encodeAbiParameters, keccak256, toBytes, type Hex } from "viem";

export interface PublicSeal {
  keepsakeId: string;
  manifestHash: Hex;
  packKind: number;
  createdAt: number;
  signature: Hex;
  signer: string;
  chainId: number;
  verifyingContract: Hex;
  /** Private keepsakes seal a salted commitment rather than a public manifest. */
  salted?: boolean;
}

/**
 * A coverage gap as the public sees it: a stable code and one plain sentence.
 * The server sanitizes these — no provider URL, HTTP status or error body reaches here.
 */
export interface PublicGap {
  code: string;
  note: string;
}

export interface PublicArtifact {
  id: string;
  kind: string;
  title: string;
  format: string;
  styleId?: string;
  url?: string;
  data?: string;
  sources: Array<{ source: string; retrievedAt: string; url?: string }>;
  tribunal?: {
    oqsVersion: string;
    pass: boolean;
    repairs: number;
    axes?: Record<string, number>;
    issues: string[];
    coverageGaps: string[];
    deterministic: Array<{ id: string; hard: boolean; passed: boolean; detail: string }>;
  };
  /** Set when the studio could not produce this. Never graded, never counted. */
  undelivered?: { code: string; reason: string };
}

export interface PublicPack {
  id: string;
  studio: "celebrate" | "remember" | "launch";
  createdAt: string;
  quality: {
    oqsVersion: string;
    passRate: number;
    repairedCount: number;
    undeliveredCount?: number;
  };
  coverageGaps: PublicGap[];
  artifacts: PublicArtifact[];
  seal?: PublicSeal;
}

/** The deliberately sparse shape returned for a private Remember pack. */
export interface PrivatePack {
  id: string;
  studio: "remember";
  createdAt: string;
  private: true;
  note: string;
  seal?: PublicSeal;
}

export type KeepsakePack = PublicPack | PrivatePack;

export function isPrivatePack(pack: KeepsakePack): pack is PrivatePack {
  return "private" in pack && pack.private === true;
}

const INTERNAL = process.env.OCE_INTERNAL_API ?? "http://127.0.0.1:8412";

export interface RecentPublicPack {
  id: string;
  studio: PublicPack["studio"];
  createdAt: string;
  descriptor: string;
  deliveredCount: number;
}

/** Real recent activity from the store; private packs and user titles are excluded upstream. */
export async function fetchRecentPublicPacks(limit = 8): Promise<RecentPublicPack[]> {
  try {
    const res = await fetch(`${INTERNAL}/recent-packs?limit=${Math.max(1, Math.min(20, limit))}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { packs?: RecentPublicPack[] };
    return Array.isArray(body.packs) ? body.packs : [];
  } catch {
    return [];
  }
}

/** Server-side fetch; signed artifact URLs are minted per request. */
export async function fetchPack(id: string): Promise<PublicPack | undefined> {
  const pack = await fetchKeepsake(id);
  return pack && !isPrivatePack(pack) ? pack : undefined;
}

/** Fetch either a public pack or the provenance-only shell of a private one. */
export async function fetchKeepsake(id: string): Promise<KeepsakePack | undefined> {
  if (!/^oce_[0-9a-z]{22}$/.test(id)) return undefined;
  try {
    const res = await fetch(`${INTERNAL}/k/${id}`, { cache: "no-store" });
    if (!res.ok) return undefined;
    return (await res.json()) as KeepsakePack;
  } catch {
    return undefined;
  }
}

/** leaf = keccak256(abi.encode(keccak256(bytes(keepsakeId)), manifestHash, packKind, createdAt)) */
export function leafOfSeal(seal: PublicSeal): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint8" }, { type: "uint64" }],
      [keccak256(toBytes(seal.keepsakeId)), seal.manifestHash, seal.packKind, BigInt(seal.createdAt)],
    ),
  );
}

export const STYLE_NAMES: Record<string, string> = {
  amethyst_editorial: "Amethyst Editorial",
  gilded_noir: "Gilded Noir",
  sunprint: "Sunprint",
  atlas_ink: "Atlas Ink",
};

export const X_LAYER_RPC = "https://rpc.xlayer.tech";
export const EXPLORER_TX = "https://www.oklink.com/x-layer/tx/";
export const EXPLORER_ADDR = "https://www.oklink.com/x-layer/address/";

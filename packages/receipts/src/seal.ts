/**
 * Seals. This is the trust spine, and it is deliberately small.
 *
 * The leaf encoding below is duplicated, byte for byte, inside KeepsakeRegistry's
 * documentation and exercised against the REAL compiled bytecode in the contracts package's
 * cross-language EVM test. If you change the encoding here without changing it there, that
 * test fails — which is the point. Every seal already anchored on X Layer depends on these
 * exact bytes staying exact.
 */
import {
  defineChain,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  recoverTypedDataAddress,
  toBytes,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  PackKindCode,
  manifestHash,
  saltedManifestCommitment,
  type Pack,
  type PackKind,
  type Seal,
} from "@occestra/studio-core";

/* ------------------------------------------------------------------- chains */

export const X_LAYER_MAINNET = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } },
  blockExplorers: { default: { name: "OKLink", url: "https://www.oklink.com/x-layer" } },
});

/**
 * X Layer's testnet is chain 1952, NOT the 195 that older docs (and our own AGENTS.md)
 * record. Verified against the live RPC on 2026-07-12: eth_chainId at testrpc.xlayer.tech
 * returns 1952. Signing with 195 makes every transaction bounce with an unhelpful
 * "missing or invalid parameters".
 */
export const X_LAYER_TESTNET = defineChain({
  id: 1952,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://testrpc.xlayer.tech"] } },
  blockExplorers: { default: { name: "OKLink", url: "https://www.oklink.com/x-layer-testnet" } },
  testnet: true,
});

export function chainFor(chainId: number) {
  if (chainId === 196) return X_LAYER_MAINNET;
  // 195 is accepted as a legacy alias for the testnet, but it resolves to the real id.
  if (chainId === 1952 || chainId === 195) return X_LAYER_TESTNET;
  throw new Error(`Occestra only seals on X Layer (196 mainnet or 1952 testnet), not chain ${chainId}`);
}

/* --------------------------------------------------------------------- leaf */

export interface LeafInput {
  keepsakeId: string;
  manifestHash: Hex;
  packKind: number;
  /** Unix seconds. */
  createdAt: number;
}

/**
 * leaf = keccak256(abi.encode(keccak256(bytes(keepsakeId)), manifestHash, packKind, createdAt))
 *
 * Solidity equivalent (KeepsakeRegistry docs):
 *   keccak256(abi.encode(keccak256(bytes(keepsakeId)), bytes32 manifestHash, uint8 packKind, uint64 createdAt))
 */
export function leafOf(input: LeafInput): Hex {
  const idHash = keccak256(toBytes(input.keepsakeId));
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, bytes32, uint8, uint64"), [
      idHash,
      input.manifestHash,
      input.packKind,
      BigInt(input.createdAt),
    ]),
  );
}

/* ------------------------------------------------------------------ EIP-712 */

export const EIP712_TYPES = {
  Keepsake: [
    { name: "keepsakeId", type: "string" },
    { name: "manifestHash", type: "bytes32" },
    { name: "packKind", type: "uint8" },
    { name: "createdAt", type: "uint64" },
  ],
} as const;

export interface DomainInput {
  chainId: number;
  verifyingContract: Address;
}

export function domain({ chainId, verifyingContract }: DomainInput) {
  return {
    name: "Occestra",
    version: "1",
    chainId,
    verifyingContract,
  } as const;
}

function messageOf(input: LeafInput) {
  return {
    keepsakeId: input.keepsakeId,
    manifestHash: input.manifestHash,
    packKind: input.packKind,
    createdAt: BigInt(input.createdAt),
  } as const;
}

/* ------------------------------------------------------------------- sealer */

export interface SealerConfig {
  privateKey: Hex;
  chainId: number;
  verifyingContract: Address;
}

export class Sealer {
  private readonly account: ReturnType<typeof privateKeyToAccount>;
  readonly chainId: number;
  readonly verifyingContract: Address;

  constructor(config: SealerConfig) {
    this.account = privateKeyToAccount(config.privateKey);
    this.chainId = config.chainId;
    this.verifyingContract = config.verifyingContract;
  }

  get signer(): Address {
    return this.account.address;
  }

  /**
   * Sign a keepsake. Returns a NEW pack — the input is never mutated.
   *
   * Pass a 32-byte `salt` to commit to a SALTED manifest — keccak256(salt || canonicalManifest)
   * — instead of the bare manifest hash. Private keepsakes are sealed this way: the on-chain leaf
   * then reveals nothing and links to nothing without the salt, which is stored with the pack and
   * shown only to its owner. Omit the salt and the seal is public and verifiable by anyone against
   * the pack alone, exactly as before.
   */
  async seal(pack: Pack, kind: PackKind = pack.studio, salt?: Hex): Promise<Pack & { seal: Seal }> {
    const input: LeafInput = {
      keepsakeId: pack.id,
      manifestHash: salt ? saltedManifestCommitment(pack, salt) : manifestHash(pack),
      packKind: PackKindCode[kind],
      createdAt: Math.floor(Date.parse(pack.createdAt) / 1000),
    };

    const signature = await this.account.signTypedData({
      domain: domain({ chainId: this.chainId, verifyingContract: this.verifyingContract }),
      types: EIP712_TYPES,
      primaryType: "Keepsake",
      message: messageOf(input),
    });

    const seal: Seal = {
      keepsakeId: input.keepsakeId,
      manifestHash: input.manifestHash,
      packKind: input.packKind,
      createdAt: input.createdAt,
      signature,
      signer: this.account.address,
      chainId: this.chainId,
      verifyingContract: this.verifyingContract,
      ...(salt ? { salted: true } : {}),
    };

    return { ...pack, seal };
  }
}

/** The leaf a seal anchors — what actually lands on chain. */
export function leafOfSeal(seal: Seal): Hex {
  return leafOf({
    keepsakeId: seal.keepsakeId,
    manifestHash: seal.manifestHash as Hex,
    packKind: seal.packKind,
    createdAt: seal.createdAt,
  });
}

/** Verify a seal's signature. Anyone can run this, against the pack alone. */
export async function verifySeal(seal: Seal, expectedSigner?: Address): Promise<boolean> {
  const valid = await verifyTypedData({
    address: (expectedSigner ?? seal.signer) as Address,
    domain: domain({
      chainId: seal.chainId,
      verifyingContract: seal.verifyingContract as Address,
    }),
    types: EIP712_TYPES,
    primaryType: "Keepsake",
    message: messageOf({
      keepsakeId: seal.keepsakeId,
      manifestHash: seal.manifestHash as Hex,
      packKind: seal.packKind,
      createdAt: seal.createdAt,
    }),
    signature: seal.signature as Hex,
  });
  return valid;
}

/** Who actually signed this seal (independent of what the seal claims). */
export async function recoverSealer(seal: Seal): Promise<Address> {
  return recoverTypedDataAddress({
    domain: domain({
      chainId: seal.chainId,
      verifyingContract: seal.verifyingContract as Address,
    }),
    types: EIP712_TYPES,
    primaryType: "Keepsake",
    message: messageOf({
      keepsakeId: seal.keepsakeId,
      manifestHash: seal.manifestHash as Hex,
      packKind: seal.packKind,
      createdAt: seal.createdAt,
    }),
    signature: seal.signature as Hex,
  });
}

/**
 * Full verification of a sealed pack: the manifest still hashes to what was signed, the
 * signature is real, and the signer is who we expect. Everything except the on-chain lookup,
 * which RegistryClient.anchoredAt does.
 *
 * A SALTED (private) seal cannot have its manifest checked without the salt — that is the whole
 * point of salting. Pass the pack owner's `salt` to verify the manifest match; without it, the
 * signature is still verified but the manifest check is reported as skipped, not failed. Anyone
 * can confirm the sealer signed *some* commitment; only the owner can confirm it is THIS pack.
 */
export async function verifyPack(
  pack: Pack,
  expectedSigner?: Address,
  salt?: Hex,
): Promise<{ valid: boolean; reasons: string[]; manifestChecked: boolean }> {
  const reasons: string[] = [];
  if (!pack.seal) return { valid: false, reasons: ["pack carries no seal"], manifestChecked: false };

  let manifestChecked = true;

  if (pack.seal.salted) {
    if (salt) {
      const recomputed = saltedManifestCommitment(pack, salt);
      if (recomputed.toLowerCase() !== pack.seal.manifestHash.toLowerCase()) {
        reasons.push(
          "salted manifest mismatch: the salt does not open the sealed commitment for this pack — either the salt is wrong or the pack has been altered",
        );
      }
    } else {
      // No salt: the signature can be checked, but not that the commitment is this manifest.
      manifestChecked = false;
    }
  } else {
    const recomputed = manifestHash(pack);
    if (recomputed.toLowerCase() !== pack.seal.manifestHash.toLowerCase()) {
      reasons.push(
        `manifest hash mismatch: pack hashes to ${recomputed}, seal claims ${pack.seal.manifestHash} — the pack has been altered since it was sealed`,
      );
    }
  }

  if (!(await verifySeal(pack.seal, expectedSigner))) {
    reasons.push("EIP-712 signature does not verify");
  }

  if (expectedSigner && pack.seal.signer.toLowerCase() !== expectedSigner.toLowerCase()) {
    reasons.push(`signed by ${pack.seal.signer}, expected ${expectedSigner}`);
  }

  return { valid: reasons.length === 0, reasons, manifestChecked };
}

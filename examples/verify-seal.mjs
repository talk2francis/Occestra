/**
 * Verify a real Occestra seal end-to-end, without trusting Occestra.
 *
 *   npm i viem && node verify-seal.mjs
 *
 * Two independent checks:
 *   1. The EIP-712 signature — did Occestra's sealer really sign this manifest?
 *   2. The on-chain anchor  — is the seal's leaf recorded in KeepsakeRegistry
 *      on X Layer mainnet, and when?
 *
 * The values below are a REAL production seal (pack oce_01kxbz33bb4grnd1xh0gev,
 * served publicly at https://api.occestra.xyz/k/oce_01kxbz33bb4grnd1xh0gev).
 * Swap in any pack's `seal` object to verify it the same way.
 */
import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
  toBytes,
  verifyTypedData,
} from "viem";

const seal = {
  keepsakeId: "oce_01kxbz33bb4grnd1xh0gev",
  manifestHash: "0x619057ca10f52bfe9e0a620bb475c224e8d1b7de1d1f93b308a6fe26983a8e25",
  packKind: 0, // celebrate=0, remember=1, launch=2, tool=3
  createdAt: 1783886884,
  signature:
    "0x4bc804f0674a40332dc7891f6c8e2ac28f4d6d11f934790ff450ff48443c32e43c5a941aa1116754e8fd320ac52ad4c9ffbd1ca0760ed7b690c8b0b90d08213c1c",
  signer: "0x0d63f9EeB86813230B72017444cea16Cd4A453F2",
  chainId: 196,
  verifyingContract: "0x1653509df702b45d67b3eb12ca37de9f5fc21f08",
};

/* 1 ── the signature: EIP-712, domain and types exactly as published */

const signatureValid = await verifyTypedData({
  address: seal.signer,
  domain: {
    name: "Occestra",
    version: "1",
    chainId: seal.chainId,
    verifyingContract: seal.verifyingContract,
  },
  types: {
    Keepsake: [
      { name: "keepsakeId", type: "string" },
      { name: "manifestHash", type: "bytes32" },
      { name: "packKind", type: "uint8" },
      { name: "createdAt", type: "uint64" },
    ],
  },
  primaryType: "Keepsake",
  message: {
    keepsakeId: seal.keepsakeId,
    manifestHash: seal.manifestHash,
    packKind: seal.packKind,
    createdAt: BigInt(seal.createdAt),
  },
  signature: seal.signature,
});

console.log("signature valid :", signatureValid);

/* 2 ── the anchor: leaf = keccak256(abi.encode(keccak256(id), hash, kind, ts)) */

const leaf = keccak256(
  encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint8" }, { type: "uint64" }],
    [keccak256(toBytes(seal.keepsakeId)), seal.manifestHash, seal.packKind, BigInt(seal.createdAt)],
  ),
);

const client = createPublicClient({ transport: http("https://rpc.xlayer.tech") });
const anchoredAt = await client.readContract({
  address: seal.verifyingContract,
  abi: [
    {
      name: "anchoredAt",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "leaf", type: "bytes32" }],
      outputs: [{ type: "uint64" }],
    },
  ],
  functionName: "anchoredAt",
  args: [leaf],
});

console.log("leaf            :", leaf);
console.log(
  "anchored        :",
  anchoredAt > 0n ? `yes — ${new Date(Number(anchoredAt) * 1000).toISOString()}` : "not yet (0)",
);

if (!signatureValid || anchoredAt === 0n) process.exit(1);
console.log("\nBoth checks passed. This pack is exactly what Occestra says it is.");

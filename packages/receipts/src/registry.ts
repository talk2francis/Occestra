/**
 * KeepsakeRegistry client. Anchoring is the only place Occestra touches the chain, and it
 * touches it with exactly one 32-byte leaf per keepsake — never content, never anything
 * personal (AGENTS.md hard rule).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainFor } from "./seal.js";

export const KEEPSAKE_REGISTRY_ABI = [
  {
    type: "function",
    name: "seal",
    stateMutability: "nonpayable",
    inputs: [{ name: "leaf", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "sealBatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "leaves", type: "bytes32[]" }],
    outputs: [],
  },
  {
    type: "function",
    name: "anchoredAt",
    stateMutability: "view",
    inputs: [{ name: "leaf", type: "bytes32" }],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "isSealed",
    stateMutability: "view",
    inputs: [{ name: "leaf", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  { type: "function", name: "sealer", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  {
    type: "function",
    name: "pendingSealer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "startSealerHandover",
    stateMutability: "nonpayable",
    inputs: [{ name: "next", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "acceptSealerHandover",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "event",
    name: "Sealed",
    inputs: [
      { name: "leaf", type: "bytes32", indexed: true },
      { name: "at", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SealerHandoverStarted",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "SealerHandoverCompleted",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
    ],
  },
  { type: "error", name: "NotSealer", inputs: [] },
  { type: "error", name: "NotPendingSealer", inputs: [] },
  { type: "error", name: "ZeroLeaf", inputs: [] },
  { type: "error", name: "AlreadySealed", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
] as const;

export interface RegistryConfig {
  address: Address;
  chainId: number;
  rpcUrl?: string;
  /** Omit for a read-only client — verification never needs a key. */
  privateKey?: Hex;
}

export class RegistryClient {
  readonly address: Address;
  readonly chainId: number;
  private readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient;
  private readonly account?: ReturnType<typeof privateKeyToAccount>;

  constructor(config: RegistryConfig) {
    const chain = chainFor(config.chainId);
    const transport = http(config.rpcUrl ?? chain.rpcUrls.default.http[0]);

    this.address = config.address;
    this.chainId = config.chainId;
    this.publicClient = createPublicClient({ chain, transport }) as PublicClient;

    if (config.privateKey) {
      this.account = privateKeyToAccount(config.privateKey);
      this.walletClient = createWalletClient({ account: this.account, chain, transport });
    }
  }

  private requireWallet(): { wallet: WalletClient; account: ReturnType<typeof privateKeyToAccount> } {
    if (!this.walletClient || !this.account) {
      throw new Error("RegistryClient is read-only: no sealer key was supplied");
    }
    return { wallet: this.walletClient, account: this.account };
  }

  async anchoredAt(leaf: Hex): Promise<number> {
    const at = await this.publicClient.readContract({
      address: this.address,
      abi: KEEPSAKE_REGISTRY_ABI,
      functionName: "anchoredAt",
      args: [leaf],
    });
    return Number(at);
  }

  async isSealed(leaf: Hex): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.address,
      abi: KEEPSAKE_REGISTRY_ABI,
      functionName: "isSealed",
      args: [leaf],
    });
  }

  async currentSealer(): Promise<Address> {
    return this.publicClient.readContract({
      address: this.address,
      abi: KEEPSAKE_REGISTRY_ABI,
      functionName: "sealer",
    });
  }

  /** Anchor one leaf. Returns the tx hash; the caller decides whether to wait. */
  async sealOnChain(leaf: Hex): Promise<Hex> {
    const { wallet, account } = this.requireWallet();
    return wallet.writeContract({
      address: this.address,
      abi: KEEPSAKE_REGISTRY_ABI,
      functionName: "seal",
      args: [leaf],
      account,
      chain: chainFor(this.chainId),
    });
  }

  /** Anchor many leaves in one transaction — the anchor worker's cheap path. */
  async sealBatch(leaves: Hex[]): Promise<Hex> {
    const { wallet, account } = this.requireWallet();
    return wallet.writeContract({
      address: this.address,
      abi: KEEPSAKE_REGISTRY_ABI,
      functionName: "sealBatch",
      args: [leaves],
      account,
      chain: chainFor(this.chainId),
    });
  }

  async waitForReceipt(hash: Hex) {
    return this.publicClient.waitForTransactionReceipt({ hash });
  }

  explorerTxUrl(hash: Hex): string {
    return `${chainFor(this.chainId).blockExplorers.default.url}/tx/${hash}`;
  }
}

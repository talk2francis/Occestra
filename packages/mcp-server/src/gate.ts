/**
 * Payment. This is the part that decides whether Occestra does work for free.
 *
 * Implemented against the CURRENT OKX docs, read 2026-07-12:
 *   https://web3.okx.com/onchainos/dev-docs/okxai/howtomcp
 *   https://web3.okx.com/onchainos/dev-docs/payments/overview
 *   plus the shipped okx-agent-payments-protocol skill reference, which documents the
 *   buyer's exact wire format — and the buyer's format IS the seller's contract.
 *
 * The flow (x402 v2, scheme "exact"):
 *   1. Unpaid call -> 402 with the challenge base64-encoded in the PAYMENT-REQUIRED header
 *      (and in the body too, for v1 clients that read it there).
 *   2. Buyer signs an EIP-3009 transferWithAuthorization and replays the request with
 *      PAYMENT-SIGNATURE (v2) or X-PAYMENT (legacy v1).
 *   3. We verify the signature OURSELVES — the authorization is a signed promise to pay
 *      our treasury, and it is worthless to anyone else — then settle it on chain by
 *      submitting transferWithAuthorization. No facilitator, no trusted third party.
 *   4. Success carries PAYMENT-RESPONSE (base64) with the settlement tx.
 *
 * Replay protection is the nonce table in the store: an EIP-3009 nonce is single-use.
 */
import {
  createPublicClient,
  createWalletClient,
  http as viemHttp,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainFor } from "@occestra/receipts";
import { z } from "zod";
import type { Store } from "./store.js";

/* ------------------------------------------------------------------- prices */

/** USDT per call. Verbatim from AGENTS.md — changing a number here changes the listing. */
export const PRICES = {
  oce_plan_occasion: 0.05,
  oce_design_invite: 0.1,
  oce_make_keepsake: 0.1,
  oce_write_toast: 0.02,
  oce_moodboard: 0.05,
  oce_launch_kit: 0.25,
  oce_critique: 0.01,
  oce_verify_keepsake: 0,
} as const satisfies Record<string, number>;

export type ToolName = keyof typeof PRICES;
export const TOOL_NAMES = Object.keys(PRICES) as ToolName[];
export const isFree = (tool: string): boolean => PRICES[tool as ToolName] === 0;

/** Settlement asset decimals. USD₮0 on X Layer is 6dp, like every USDT deployment. */
export const ASSET_DECIMALS = 6;

export const toAtomic = (usdt: number): bigint =>
  BigInt(Math.round(usdt * 10 ** ASSET_DECIMALS));

/* --------------------------------------------------------------- the verdict */

export interface PaymentChallenge {
  x402Version: 2;
  resource: { url: string; description: string; mimeType: string };
  accepts: Array<{
    scheme: "exact";
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: { name: string; version: string };
  }>;
}

export type GateVerdict =
  | { ok: true; payerRef: string; txHash?: string; settled: boolean }
  | { ok: false; status: 402; challenge: PaymentChallenge; headerValue: string }
  | { ok: false; status: 400; reason: string };

export interface GateRequest {
  headers: Record<string, string | string[] | undefined>;
}

export interface PaymentGate {
  readonly mode: string;
  check(request: GateRequest, tool: string, priceUsdt: number): Promise<GateVerdict>;
}

/* ----------------------------------------------------------------- dev gate */

/** Allow-all. ONLY reachable behind OCE_PAYMENT_MODE=dev. Never in production. */
export class DevGate implements PaymentGate {
  readonly mode = "dev";

  async check(_request: GateRequest, _tool: string, _price: number): Promise<GateVerdict> {
    return { ok: true, payerRef: "dev", settled: false };
  }
}

/* ----------------------------------------------------------------- okx gate */

const AuthorizationSchema = z.object({
  from: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  value: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  validAfter: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  validBefore: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  nonce: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

const PaymentPayloadSchema = z.object({
  x402Version: z.union([z.literal(1), z.literal(2)]).optional(),
  scheme: z.string().optional(),
  network: z.string().optional(),
  payload: z.object({
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
    authorization: AuthorizationSchema,
  }),
});

/** EIP-3009, as every USDT/USDC deployment implements it. */
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const EIP3009_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export interface OkxGateConfig {
  store: Store;
  /** Where the money lands. Required in production. */
  treasury: Address;
  /** Settlement token. Defaults to USD₮0 on X Layer, per the OKX A2MCP docs. */
  asset?: Address;
  assetName?: string;
  assetVersion?: string;
  chainId?: number;
  rpcUrl?: string;
  publicBaseUrl?: string;
  /** Submits the settlement tx. Without it we verify but cannot settle on chain. */
  settlementKey?: Hex;
  maxTimeoutSeconds?: number;
  now?: () => number;
}

/** The asset the OKX A2MCP docs settle in on X Layer (USD₮0). */
export const DEFAULT_ASSET = "0x779ded0c9e1022225f8e0630b35a9b54be713736" as Address;

export class OkxGate implements PaymentGate {
  readonly mode = "okx";
  private readonly config: Required<Omit<OkxGateConfig, "settlementKey" | "store">> & {
    settlementKey?: Hex;
    store: Store;
  };

  constructor(config: OkxGateConfig) {
    this.config = {
      store: config.store,
      treasury: config.treasury,
      asset: config.asset ?? DEFAULT_ASSET,
      assetName: config.assetName ?? "USD₮0",
      assetVersion: config.assetVersion ?? "1",
      chainId: config.chainId ?? 196,
      rpcUrl: config.rpcUrl ?? chainFor(config.chainId ?? 196).rpcUrls.default.http[0],
      publicBaseUrl: config.publicBaseUrl ?? "https://api.occestra.xyz",
      maxTimeoutSeconds: config.maxTimeoutSeconds ?? 300,
      now: config.now ?? Date.now,
      ...(config.settlementKey ? { settlementKey: config.settlementKey } : {}),
    };
  }

  get network(): string {
    return `eip155:${this.config.chainId}`;
  }

  challenge(tool: string, priceUsdt: number): PaymentChallenge {
    return {
      x402Version: 2,
      resource: {
        url: `${this.config.publicBaseUrl}/mcp`,
        description: `Occestra ${tool} — one call`,
        mimeType: "application/json",
      },
      accepts: [
        {
          scheme: "exact",
          network: this.network,
          asset: this.config.asset,
          amount: toAtomic(priceUsdt).toString(),
          payTo: this.config.treasury,
          maxTimeoutSeconds: this.config.maxTimeoutSeconds,
          extra: { name: this.config.assetName, version: this.config.assetVersion },
        },
      ],
    };
  }

  private static header(request: GateRequest, name: string): string | undefined {
    const value = request.headers[name] ?? request.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  async check(request: GateRequest, tool: string, priceUsdt: number): Promise<GateVerdict> {
    if (priceUsdt === 0) return { ok: true, payerRef: "free", settled: false };

    // v2 carries the proof in PAYMENT-SIGNATURE; legacy v1 uses X-PAYMENT. Accept both.
    const proof =
      OkxGate.header(request, "payment-signature") ?? OkxGate.header(request, "x-payment");

    if (!proof) {
      const challenge = this.challenge(tool, priceUsdt);
      return {
        ok: false,
        status: 402,
        challenge,
        headerValue: Buffer.from(JSON.stringify(challenge)).toString("base64"),
      };
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(proof, "base64").toString("utf8"));
    } catch {
      return { ok: false, status: 400, reason: "payment proof is not base64-encoded JSON" };
    }

    const parsed = PaymentPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
      return {
        ok: false,
        status: 400,
        reason: `payment proof is malformed: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      };
    }

    const { signature, authorization } = parsed.data.payload;
    const required = toAtomic(priceUsdt);
    const nowSeconds = BigInt(Math.floor(this.config.now() / 1000));

    // --- the four things that make this authorization ours, and worth the price ---

    if (authorization.to.toLowerCase() !== this.config.treasury.toLowerCase()) {
      return { ok: false, status: 400, reason: "payment is not addressed to the Occestra treasury" };
    }

    if (authorization.value < required) {
      return {
        ok: false,
        status: 400,
        reason: `payment is short: ${authorization.value} < ${required} required for ${tool}`,
      };
    }

    if (nowSeconds < authorization.validAfter || nowSeconds > authorization.validBefore) {
      return { ok: false, status: 400, reason: "payment authorization is outside its validity window" };
    }

    const valid = await verifyTypedData({
      address: authorization.from as Address,
      domain: {
        name: this.config.assetName,
        version: this.config.assetVersion,
        chainId: this.config.chainId,
        verifyingContract: this.config.asset,
      },
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from as Address,
        to: authorization.to as Address,
        value: authorization.value,
        validAfter: authorization.validAfter,
        validBefore: authorization.validBefore,
        nonce: authorization.nonce as Hex,
      },
      signature: signature as Hex,
    });

    if (!valid) {
      return { ok: false, status: 400, reason: "payment signature does not verify" };
    }

    // --- replay protection: an EIP-3009 nonce is spendable exactly once ---

    if (!this.config.store.claimNonce(authorization.nonce, authorization.from, tool)) {
      return { ok: false, status: 400, reason: "this payment authorization has already been used" };
    }

    // --- settle ---

    const settlement = await this.settle(authorization, signature as Hex);
    if (!settlement.ok) {
      return { ok: false, status: 400, reason: `settlement failed: ${settlement.reason}` };
    }

    return {
      ok: true,
      payerRef: authorization.from.toLowerCase(),
      settled: settlement.settled,
      ...(settlement.txHash ? { txHash: settlement.txHash } : {}),
    };
  }

  /**
   * Redeem the authorization on chain. We hold the gas key, so the buyer pays only USDT —
   * which is the entire point of EIP-3009 and why an agent with no OKB can still buy.
   */
  private async settle(
    authorization: z.infer<typeof AuthorizationSchema>,
    signature: Hex,
  ): Promise<{ ok: true; txHash?: string; settled: boolean } | { ok: false; reason: string }> {
    if (!this.config.settlementKey) {
      // Verified but not redeemed. Honest about it: the caller records it as unsettled.
      return { ok: true, settled: false };
    }

    try {
      const chain = chainFor(this.config.chainId);
      const account = privateKeyToAccount(this.config.settlementKey);
      const transport = viemHttp(this.config.rpcUrl);

      const wallet = createWalletClient({ account, chain, transport });
      const publicClient = createPublicClient({ chain, transport });

      const txHash = await wallet.writeContract({
        address: this.config.asset,
        abi: EIP3009_ABI,
        functionName: "transferWithAuthorization",
        args: [
          authorization.from as Address,
          authorization.to as Address,
          authorization.value,
          authorization.validAfter,
          authorization.validBefore,
          authorization.nonce as Hex,
          signature,
        ],
        account,
        chain,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        return { ok: false, reason: `settlement transaction reverted (${txHash})` };
      }

      return { ok: true, txHash, settled: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  /** The PAYMENT-RESPONSE header the buyer decodes to see what actually happened. */
  static settlementHeader(verdict: Extract<GateVerdict, { ok: true }>, amount: string): string {
    return Buffer.from(
      JSON.stringify({
        status: verdict.settled ? "settled" : "verified",
        transaction: verdict.txHash ?? null,
        amount,
        payer: verdict.payerRef,
      }),
    ).toString("base64");
  }
}

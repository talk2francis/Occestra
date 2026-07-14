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

/**
 * USDT per call. THE source of truth: the manifest, the tool descriptions, the writer's facts
 * block and the website all read these. Changing a number here changes the listing.
 *
 * Repriced 2026-07-14 against MEASURED cost (docs/pricing-rationale.md, `node
 * scripts/cost-model.mjs`). Every one of the six was selling below cost — not three, as the
 * first measurement claimed, because that measurement had the same blind spot the cost
 * governor did: it never counted the critic. A plan makes five artifacts and therefore five
 * critique calls, and it was priced as though it made none. It cost $0.1253 and sold for
 * $0.05.
 *
 * Each price now holds roughly a 60% gross margin on measured cost. `oce_critique` is the one
 * deliberate exception — it sells at a cent and costs about seventeen. That is a decision, not
 * an accident: a marketplace where output is checkable is a better marketplace for everyone in
 * it, including us, and a grading tool priced to protect its own margin would never get used.
 */
export const PRICES = {
  oce_plan_occasion: 0.3,
  oce_design_invite: 0.75,
  oce_make_keepsake: 0.75,
  oce_write_toast: 0.1,
  oce_moodboard: 0.3,
  oce_launch_kit: 1.5,
  oce_critique: 0.01,
  oce_verify_keepsake: 0,
  // Running a job costs what the tool it runs costs, and not a cent more. Watching one is
  // free: charging a buyer to ask whether the thing they already paid for is ready yet
  // would be indefensible.
  oce_job_status: 0,
  oce_job_result: 0,
  oce_cancel_job: 0,
  // Free, and it has to be. A buyer choosing a House Style blind pays for a render they did
  // not want, and a wrong style is not a refund — it is just a bad invitation.
  oce_style_catalog: 0,
} as const satisfies Record<string, number>;

export type ToolName = keyof typeof PRICES;
export const TOOL_NAMES = Object.keys(PRICES) as ToolName[];
export const isFree = (tool: string): boolean => PRICES[tool as ToolName] === 0;

/** The six tools that make a pack — the only work an async job may be asked to do. */
export const PACK_TOOLS = [
  "oce_plan_occasion",
  "oce_design_invite",
  "oce_write_toast",
  "oce_moodboard",
  "oce_make_keepsake",
  "oce_launch_kit",
] as const;

export type PackToolName = (typeof PACK_TOOLS)[number];

/**
 * A job is priced at exactly the price of the tool it runs.
 *
 * The asynchrony is not a product, it is a courtesy — the buyer is paying for a launch kit,
 * and whether they wait on a socket or on a job id is our problem, not something to charge
 * them for. So `oce_create_pack_job` has no price of its own; it inherits one, and the
 * paywall has to look inside the arguments to find it.
 */
export function priceOf(tool: string, args: unknown): number | undefined {
  if (tool === "oce_create_pack_job") {
    const target = (args as { tool?: unknown } | undefined)?.tool;
    if (typeof target !== "string") return undefined;
    if (!(PACK_TOOLS as readonly string[]).includes(target)) return undefined;
    return PRICES[target as ToolName];
  }
  return PRICES[tool as ToolName];
}

/**
 * The nonce inside an x402 payment, WITHOUT verifying it.
 *
 * This is not a security check — it is an identity. Every x402 authorization already carries
 * a nonce that is unique to the call and single-use by construction, which makes it a perfect
 * idempotency key for a buyer who never thought to send one. So a plain HTTP retry of the
 * identical paid request is idempotent for free, with no client change at all.
 */
export function paymentNonceOf(headers: GateRequest["headers"]): string | undefined {
  const raw = headers["payment-signature"] ?? headers["x-payment"];
  const proof = Array.isArray(raw) ? raw[0] : raw;
  if (!proof) return undefined;

  try {
    const decoded = JSON.parse(Buffer.from(proof, "base64").toString("utf8")) as {
      payload?: { authorization?: { nonce?: unknown } };
    };
    const nonce = decoded.payload?.authorization?.nonce;
    return typeof nonce === "string" ? nonce.toLowerCase() : undefined;
  } catch {
    return undefined; // a malformed proof is the gate's business, not ours
  }
}

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

  /** What we take, and where it goes. The manifest advertises this so nobody has to guess. */
  get terms(): {
    asset: string;
    assetName: string;
    assetVersion: string;
    decimals: number;
    payTo: string;
    maxTimeoutSeconds: number;
  } {
    return {
      asset: this.config.asset,
      assetName: this.config.assetName,
      assetVersion: this.config.assetVersion,
      decimals: ASSET_DECIMALS,
      payTo: this.config.treasury,
      maxTimeoutSeconds: this.config.maxTimeoutSeconds,
    };
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
      // No money moved, so the buyer's authorization is still good. Give the nonce back or
      // they would have to re-sign a payment we merely failed to collect.
      this.config.store.releaseNonce(authorization.nonce);
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

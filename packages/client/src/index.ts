/**
 * @occestra/client — the typed way for an agent to buy finished, graded,
 * sealed work from Occestra.
 *
 *   const studio = new Occestra({ endpoint: "https://api.occestra.xyz" });
 *   const toast  = await studio.writeToast({ subject: "Mara", details: "…" });
 *
 * Paid tools answer with an x402 challenge; hand the constructor a private
 * key and the client signs the EIP-3009 authorization and retries for you.
 * Verification never needs a key — it is free, forever, by design.
 */

export interface OccestraOptions {
  /** e.g. "https://api.occestra.xyz" (no trailing slash, no /mcp) */
  endpoint: string;
  /** Enables automatic x402 payment. Never sent anywhere — used to sign locally. */
  payment?: { privateKey: `0x${string}` };
  fetch?: typeof fetch;
}

/* ------------------------------------------------------------ result types */

export interface SourceTag {
  source: string;
  retrievedAt: string;
  url?: string;
}

export interface TribunalReport {
  oqsVersion: string;
  pass: boolean;
  repairs: number;
  axes?: Record<string, number>;
  issues: string[];
  coverageGaps: string[];
  deterministic: Array<{ id: string; hard: boolean; passed: boolean; detail: string }>;
  repairBrief?: string;
}

export interface PackArtifact {
  id: string;
  kind: string;
  title: string;
  format: string;
  content?: string;
  url?: string;
  sources: SourceTag[];
  tribunal?: TribunalReport;
}

export interface Seal {
  keepsakeId: string;
  manifestHash: `0x${string}`;
  packKind: number;
  createdAt: number;
  signature: `0x${string}`;
  signer: string;
  chainId: number;
  verifyingContract: `0x${string}`;
  leaf?: `0x${string}`;
  anchored?: boolean;
  anchorTx?: string;
}

export interface PackResult {
  keepsakeId: string;
  studio: "celebrate" | "remember" | "launch";
  quality: { oqsVersion: string; passRate: number; repairedCount: number };
  coverageGaps: string[];
  artifacts: PackArtifact[];
  seal?: Seal;
  publicPage: string;
}

export interface VerifyResult {
  found: boolean;
  keepsakeId: string;
  studio?: string;
  createdAt?: string;
  quality?: { oqsVersion: string; passRate: number; repairedCount: number };
  seal?: Seal & { signatureValid: boolean };
  anchored?: boolean;
  anchorTx?: string;
  explorer?: string;
  publicPage?: string;
  note?: string;
}

export type HouseStyleId = "amethyst_editorial" | "gilded_noir" | "sunprint" | "atlas_ink";

/* --------------------------------------------------------------- payments */

interface Challenge {
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    asset: `0x${string}`;
    amount: string;
    payTo: `0x${string}`;
    maxTimeoutSeconds: number;
    extra?: { name?: string; version?: string };
  }>;
}

/**
 * Sign an EIP-3009 transferWithAuthorization answering an Occestra 402
 * challenge, and return the base64 PAYMENT-SIGNATURE header value. Pure —
 * exported for wallets that manage their own signing.
 */
export async function buildPaymentProof(
  challenge: Challenge,
  privateKey: `0x${string}`,
): Promise<string> {
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(privateKey);
  const accept = challenge.accepts[0];
  if (!accept) throw new Error("challenge carries no payment options");

  const chainId = Number(accept.network.split(":")[1] ?? 196);
  const nonceBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const nonce = `0x${Array.from(nonceBytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as const;

  const authorization = {
    from: account.address,
    to: accept.payTo,
    value: BigInt(accept.amount),
    validAfter: 0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + accept.maxTimeoutSeconds),
    nonce,
  };

  const signature = await account.signTypedData({
    domain: {
      name: accept.extra?.name ?? "USD₮0",
      version: accept.extra?.version ?? "1",
      chainId,
      verifyingContract: accept.asset,
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
    message: authorization,
  });

  const proof = {
    x402Version: 2,
    scheme: accept.scheme,
    network: accept.network,
    payload: {
      signature,
      authorization: {
        ...authorization,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
      },
    },
  };

  return btoa(unescape(encodeURIComponent(JSON.stringify(proof))));
}

/* ------------------------------------------------------------- the client */

export class Occestra {
  private readonly endpoint: string;
  private readonly payment: OccestraOptions["payment"];
  private readonly fetchFn: typeof fetch;
  private requestId = 0;

  constructor(options: OccestraOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.payment = options.payment;
    this.fetchFn = options.fetch ?? fetch;
  }

  /* -------------------------------------------------------------- tools */

  planOccasion(args: {
    occasion: string; city: string; date: string; headcount: number; vibe: string;
    budgetUsd?: number; styleId?: HouseStyleId; deliverables?: string[];
  }): Promise<PackResult> {
    return this.callTool<PackResult>("oce_plan_occasion", args);
  }

  designInvite(args: { occasion: string; date: string; city?: string; styleId?: HouseStyleId; detail?: string }): Promise<PackResult> {
    return this.callTool<PackResult>("oce_design_invite", args);
  }

  makeKeepsake(args: {
    title: string; description?: string; momentDate?: string; tone?: string;
    styleId?: HouseStyleId; mediaRefs?: string[];
  }): Promise<PackResult> {
    return this.callTool<PackResult>("oce_make_keepsake", args);
  }

  writeToast(args: { subject: string; relationship?: string; tone?: string; details?: string; lengthSeconds?: number }): Promise<PackResult> {
    return this.callTool<PackResult>("oce_write_toast", args);
  }

  moodboard(args: { subject: string; styleId?: HouseStyleId; notes?: string }): Promise<PackResult> {
    return this.callTool<PackResult>("oce_moodboard", args);
  }

  launchKit(args: {
    productName: string; url?: string; description?: string; audience?: string;
    styleId?: HouseStyleId; deliverables?: string[];
  }): Promise<PackResult> {
    return this.callTool<PackResult>("oce_launch_kit", args);
  }

  /** Grade YOUR artifact against the published OQS — 0.01 USDT, repair brief included. */
  critique(args: {
    kind: string; brief: string; text?: string; imageBase64?: string;
    styleId?: HouseStyleId; size?: string;
  }): Promise<PackResult> {
    return this.callTool<PackResult>("oce_critique", args);
  }

  /** Free forever. */
  verifyKeepsake(keepsakeId: string): Promise<VerifyResult> {
    return this.callTool<VerifyResult>("oce_verify_keepsake", { keepsakeId });
  }

  /* ------------------------------------------------------ public surface */

  /** The public pack JSON — fresh signed artifact URLs on every call. */
  async getPack(keepsakeId: string): Promise<PackResult | undefined> {
    const res = await this.fetchFn(`${this.endpoint}/k/${keepsakeId}`);
    return res.ok ? ((await res.json()) as PackResult) : undefined;
  }

  async capabilities(): Promise<unknown> {
    const res = await this.fetchFn(`${this.endpoint}/a2a/capabilities`);
    return res.json();
  }

  async stats(): Promise<Record<string, unknown>> {
    const res = await this.fetchFn(`${this.endpoint}/stats`);
    return (await res.json()) as Record<string, unknown>;
  }

  /* ------------------------------------------------------------ plumbing */

  private async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    let response = await this.post(name, args);

    if (response.status === 402) {
      if (!this.payment) {
        throw new Error(
          `${name} costs money and no payment key was configured — construct Occestra with { payment: { privateKey } }.`,
        );
      }
      const challenge = (await response.json()) as Challenge;
      const proof = await buildPaymentProof(challenge, this.payment.privateKey);
      response = await this.post(name, args, proof);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`${name} failed (${response.status}): ${body.slice(0, 300)}`);
    }

    return this.parseResult<T>(await response.text());
  }

  private post(name: string, args: Record<string, unknown>, paymentProof?: string): Promise<Response> {
    this.requestId += 1;
    return this.fetchFn(`${this.endpoint}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(paymentProof ? { "PAYMENT-SIGNATURE": paymentProof } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.requestId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
  }

  /** The endpoint may answer plain JSON or SSE-framed JSON — accept both. */
  private parseResult<T>(raw: string): T {
    const dataLine = raw.split("\n").find((line) => line.startsWith("data:"));
    const envelope = JSON.parse(dataLine ? dataLine.slice(5) : raw) as {
      result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
      error?: { message?: string };
    };
    if (envelope.error) throw new Error(envelope.error.message ?? "tool call failed");
    const text = envelope.result?.content?.find((c) => c.type === "text")?.text;
    if (!text) throw new Error("empty tool result");
    const parsed = JSON.parse(text) as T & { error?: string };
    if (envelope.result?.isError) throw new Error((parsed as { error?: string }).error ?? text.slice(0, 300));
    return parsed;
  }
}

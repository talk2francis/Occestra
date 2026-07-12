/**
 * OKX Onchain OS Market API. Used by the LAUNCH studio when the thing being launched is a
 * token or a dapp — a launch kit for a token that gets the token's own symbol or price
 * wrong is worse than no launch kit.
 *
 * Endpoints verified against the live docs on 2026-07-12:
 *   POST https://web3.okx.com/api/v6/dex/market/token/basic-info
 *   POST https://web3.okx.com/api/v6/dex/market/price
 *   https://web3.okx.com/onchainos/dev-docs/market/market-token-basic-info
 *   https://web3.okx.com/onchainos/dev-docs/market/market-price
 *
 * The docs list the four OK-ACCESS-* headers but do not specify how OK-ACCESS-SIGN is
 * computed. We use OKX's standard scheme (as used across their v5 APIs):
 *   sign = base64(hmac_sha256(secret, timestamp + method + requestPath + body))
 * Recorded in the Deviations log. If OKX changes this, tokenInfo degrades to a coverage
 * gap rather than a crash — which is the only reason it is safe to depend on at all.
 */
import { createHmac } from "node:crypto";
import { z } from "zod";
import type { MarketDataPort, SourceTag, TokenInfo } from "@occestra/studio-core";
import { fetchJson } from "../http.js";
import { TTL, TtlCache } from "../cache.js";

const BASE_URL = "https://web3.okx.com";

/** OKX chainIndex values. X Layer is what we care about; the majors are here for launches. */
export const CHAIN_INDEX = {
  ethereum: "1",
  bsc: "56",
  xlayer: "196",
  polygon: "137",
  base: "8453",
  solana: "501",
} as const;

const BasicInfoSchema = z.object({
  code: z.string(),
  msg: z.string().optional(),
  data: z
    .array(
      z.object({
        chainIndex: z.string().optional(),
        tokenName: z.string().optional(),
        tokenSymbol: z.string().optional(),
        tokenLogoUrl: z.string().optional(),
        decimal: z.string().optional(),
        tokenContractAddress: z.string().optional(),
      }),
    )
    .optional(),
});

const PriceSchema = z.object({
  code: z.string(),
  msg: z.string().optional(),
  data: z
    .array(
      z.object({
        chainIndex: z.string().optional(),
        tokenContractAddress: z.string().optional(),
        time: z.string().optional(),
        price: z.string().optional(),
      }),
    )
    .optional(),
});

export interface OkxMarketConfig {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  /** Defaults to X Layer — this is an X Layer product. */
  defaultChainIndex?: string;
  cache?: TtlCache;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Accepts "0xabc… on xlayer", a bare address, or "chainIndex:address". */
export function parseTokenQuery(
  query: string,
  defaultChainIndex: string,
): { chainIndex: string; address: string } | undefined {
  const trimmed = query.trim();

  const explicit = /^(\d+):(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(trimmed);
  if (explicit) return { chainIndex: explicit[1]!, address: explicit[2]! };

  const address = /(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/.exec(trimmed)?.[1];
  if (!address) return undefined;

  const named = Object.entries(CHAIN_INDEX).find(([name]) =>
    new RegExp(`\\b${name}\\b`, "i").test(trimmed),
  );

  return { chainIndex: named?.[1] ?? defaultChainIndex, address };
}

export class OkxMarket implements MarketDataPort {
  private readonly cache: TtlCache;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly defaultChainIndex: string;

  constructor(private readonly config: OkxMarketConfig) {
    this.cache = config.cache ?? new TtlCache();
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
    this.defaultChainIndex = config.defaultChainIndex ?? CHAIN_INDEX.xlayer;
  }

  private headers(method: string, path: string, body: string): Record<string, string> {
    const timestamp = new Date(this.now()).toISOString();
    const sign = createHmac("sha256", this.config.secretKey)
      .update(`${timestamp}${method}${path}${body}`)
      .digest("base64");

    return {
      "content-type": "application/json",
      "OK-ACCESS-KEY": this.config.apiKey,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-PASSPHRASE": this.config.passphrase,
      "OK-ACCESS-TIMESTAMP": timestamp,
    };
  }

  private async post<T>(path: string, payload: unknown, schema: z.ZodType<T>): Promise<T> {
    const body = JSON.stringify(payload);
    const raw = await fetchJson(`${BASE_URL}${path}`, {
      method: "POST",
      timeoutMs: 15_000,
      retries: 1,
      fetchImpl: this.fetchImpl,
      headers: this.headers("POST", path, body),
      body,
    });

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`OKX ${path} returned an unexpected shape: ${parsed.error.issues[0]?.message}`);
    }
    return parsed.data;
  }

  async tokenInfo(query: string): Promise<TokenInfo> {
    const target = parseTokenQuery(query, this.defaultChainIndex);
    if (!target) {
      throw new Error(
        `"${query}" is not a token contract address — Occestra will not guess which token you meant`,
      );
    }

    const address = target.address.startsWith("0x") ? target.address.toLowerCase() : target.address;
    const key = `token:${target.chainIndex}:${address}`;

    return this.cache.wrap(key, TTL.token, async () => {
      const payload = [{ chainIndex: target.chainIndex, tokenContractAddress: address }];

      const basic = await this.post("/api/v6/dex/market/token/basic-info", payload, BasicInfoSchema);
      if (basic.code !== "0") {
        throw new Error(`OKX basic-info returned code ${basic.code}: ${basic.msg ?? "no message"}`);
      }

      const token = basic.data?.[0];
      if (!token?.tokenSymbol) {
        throw new Error(`OKX knows no token at ${address} on chain ${target.chainIndex}`);
      }

      const source: SourceTag = {
        source: "okx_onchain_os_market",
        retrievedAt: new Date(this.now()).toISOString(),
        url: `${BASE_URL}/api/v6/dex/market/token/basic-info`,
      };

      const info: TokenInfo = {
        symbol: token.tokenSymbol,
        name: token.tokenName ?? token.tokenSymbol,
        chain: target.chainIndex,
        address,
        source,
      };

      // Price is a bonus, not a requirement — a launch kit does not need it to be good.
      try {
        const priced = await this.post("/api/v6/dex/market/price", payload, PriceSchema);
        const price = priced.data?.[0]?.price;
        if (priced.code === "0" && price) info.priceUsd = Number.parseFloat(price);
      } catch {
        // Deliberately swallowed: the caller records a coverage gap if it cares.
      }

      return info;
    });
  }
}

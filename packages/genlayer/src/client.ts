/**
 * The GenLayer network boundary.
 *
 * Everything that talks to Bradbury goes through here, so the rest of Occestra never imports
 * genlayer-js. That containment is the point: when the SDK changes shape — and it has already
 * changed shape once during this build — the blast radius is this file.
 */
import { createAccount, createClient } from "genlayer-js";
import type { GenLayerConfig } from "./config.js";

export type GenLayerReadClient = ReturnType<typeof createClient>;

/**
 * genlayer-js 1.1.8 types `createClient`'s `chain` as a structural subset that its own
 * exported chain constants do not satisfy under `exactOptionalPropertyTypes` — their
 * `blockExplorers` is optional-and-possibly-undefined, the parameter's is not. Passing
 * `chains.testnetBradbury` straight through is exactly the documented usage, so the
 * narrowing happens here, once, rather than by loosening the repo's tsconfig.
 */
type ClientChainArg = Parameters<typeof createClient>[0] extends infer C
  ? C extends { chain?: infer Chain }
    ? Chain
    : never
  : never;

const asClientChain = (chain: GenLayerConfig["chain"]) => chain as unknown as ClientChainArg;

/** A read-only client. Works with no submitter key — status pages must not need one. */
export function createReadClient(config: GenLayerConfig): GenLayerReadClient {
  return createClient({
    chain: asClientChain(config.chain),
    ...(config.rpcUrl ? { endpoint: config.rpcUrl } : {}),
  });
}

export class GenLayerNotSubmittableError extends Error {}

/** A signing client. Requires the server-only submitter key. */
export function createWriteClient(config: GenLayerConfig): GenLayerReadClient {
  if (!config.submitterPrivateKey) {
    throw new GenLayerNotSubmittableError(
      "GENLAYER_SUBMITTER_PRIVATE_KEY is not set; this process can read consensus but not submit",
    );
  }
  return createClient({
    chain: asClientChain(config.chain),
    account: createAccount(config.submitterPrivateKey),
    ...(config.rpcUrl ? { endpoint: config.rpcUrl } : {}),
  });
}

/**
 * A link a person can click to check us.
 *
 * "Independently adjudicated" is worth nothing if the reader cannot go and look, so every
 * finalized review carries one of these.
 */
export function explorerTransactionUrl(
  config: GenLayerConfig,
  transactionHash: string,
): string | undefined {
  const base = config.chain.blockExplorers?.default?.url;
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/tx/${transactionHash}`;
}

export function explorerAddressUrl(
  config: GenLayerConfig,
  address: string,
): string | undefined {
  const base = config.chain.blockExplorers?.default?.url;
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/address/${address}`;
}

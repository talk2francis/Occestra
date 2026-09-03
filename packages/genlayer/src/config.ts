/**
 * GenLayer configuration, read once from the environment.
 *
 * Two rules shape this file. First, the submitter key is server-only: it signs transactions
 * that cost real GEN, and it is a different credential from the X Layer sealer on purpose —
 * mixing those trust domains is how one compromised process ends up able to forge provenance.
 * Second, missing configuration disables consensus rather than breaking Occestra. A studio
 * that cannot reach GenLayer must still plan, generate, grade and seal exactly as before.
 */
import { chains } from "genlayer-js";

export type GenLayerNetwork = "bradbury" | "asimov" | "localnet" | "studionet";

export interface GenLayerConfig {
  network: GenLayerNetwork;
  chain: (typeof chains)[keyof typeof chains];
  /** Overrides the chain's default RPC when set. */
  rpcUrl?: string;
  contractAddress?: `0x${string}`;
  /** Present only when this process is allowed to submit. Never leaves the server. */
  submitterPrivateKey?: `0x${string}`;
}

/**
 * Bradbury and Asimov are the same network (chain id 4221 — both RPCs report an identical
 * chain id and block height). Asimov is the current name; "bradbury" stays accepted because
 * it is what the deployment docs and the Builder submission call it.
 */
const CHAINS = {
  bradbury: chains.testnetBradbury,
  asimov: chains.testnetAsimov,
  localnet: chains.localnet,
  studionet: chains.studionet,
} as const;

function isNetwork(value: string): value is GenLayerNetwork {
  return value in CHAINS;
}

const HEX_KEY = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export class GenLayerConfigError extends Error {}

/**
 * Reads config from `env`, or returns null when GenLayer is simply not set up here.
 *
 * Null and throw mean different things: null is "this deployment does not do consensus",
 * which is a supported state; a throw is "this deployment says it does consensus but the
 * values are wrong", which must not be papered over into silent disablement.
 */
export function readGenLayerConfig(env: NodeJS.ProcessEnv = process.env): GenLayerConfig | null {
  const rawNetwork = env.GENLAYER_NETWORK?.trim();
  if (!rawNetwork) return null;

  if (!isNetwork(rawNetwork)) {
    throw new GenLayerConfigError(
      `GENLAYER_NETWORK must be one of ${Object.keys(CHAINS).join(", ")} (got ${rawNetwork})`,
    );
  }

  const contractAddress = env.GENLAYER_QUALITY_CONTRACT_ADDRESS?.trim();
  if (contractAddress && !ADDRESS.test(contractAddress)) {
    throw new GenLayerConfigError("GENLAYER_QUALITY_CONTRACT_ADDRESS is not a 20-byte address");
  }

  const submitterPrivateKey = env.GENLAYER_SUBMITTER_PRIVATE_KEY?.trim();
  if (submitterPrivateKey && !HEX_KEY.test(submitterPrivateKey)) {
    throw new GenLayerConfigError("GENLAYER_SUBMITTER_PRIVATE_KEY is not a 32-byte hex key");
  }

  // A private key reachable from the browser bundle is not a misconfiguration to warn about;
  // it is a leaked key. Refuse to start rather than run with it.
  for (const key of Object.keys(env)) {
    if (key.startsWith("NEXT_PUBLIC_") && /PRIVATE_KEY|SECRET|SEED/.test(key)) {
      throw new GenLayerConfigError(`${key} would expose a secret to the browser bundle`);
    }
  }

  const rpcUrl = env.GENLAYER_RPC_URL?.trim();

  return {
    network: rawNetwork,
    chain: CHAINS[rawNetwork],
    ...(rpcUrl ? { rpcUrl } : {}),
    ...(contractAddress ? { contractAddress: contractAddress as `0x${string}` } : {}),
    ...(submitterPrivateKey
      ? { submitterPrivateKey: submitterPrivateKey as `0x${string}` }
      : {}),
  };
}

/** True when this process can READ consensus results (a deployed contract is enough). */
export function isGenLayerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const config = readGenLayerConfig(env);
    return Boolean(config?.contractAddress);
  } catch {
    return false;
  }
}

/** True when this process can also SUBMIT reviews, which additionally needs a funded key. */
export function canSubmitConsensusReviews(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const config = readGenLayerConfig(env);
    return Boolean(config?.contractAddress && config.submitterPrivateKey);
  } catch {
    return false;
  }
}

/** The public network label stored on reviews and shown in the UI. */
export function networkLabel(config: GenLayerConfig): string {
  return `genlayer-${config.network}`;
}

/**
 * The anchor worker. Drains queued leaves onto X Layer in batches.
 *
 * It is deliberately timid: it never throws, it never takes the server down, and a failed
 * batch is retried with backoff rather than dropped. A keepsake that is sealed but not yet
 * anchored is honest about being exactly that — the verify tool says "queued", not "done".
 */
import type { Hex } from "viem";
import type { RegistryClient } from "@occestra/receipts";
import type { Store } from "./store.js";

export interface AnchorWorkerConfig {
  store: Store;
  registry: RegistryClient;
  intervalMs?: number;
  batchSize?: number;
  log?: (message: string) => void;
}

export class AnchorWorker {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly log: (message: string) => void;

  constructor(private readonly config: AnchorWorkerConfig) {
    this.intervalMs = config.intervalMs ?? 30 * 60_000;
    this.batchSize = config.batchSize ?? 20;
    this.log = config.log ?? ((message) => console.log(`[anchor] ${message}`));
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.drain(), this.intervalMs);
    this.timer.unref?.();
    this.log(`worker started — draining every ${this.intervalMs / 60_000} minutes`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One pass. Safe to call by hand; safe to call concurrently (it declines to overlap). */
  async drain(): Promise<{ anchored: number; txHash?: string }> {
    if (this.running) return { anchored: 0 };
    this.running = true;

    try {
      const pending = this.config.store.pendingSeals(this.batchSize);
      if (pending.length === 0) return { anchored: 0 };

      const leaves = pending.map((seal) => seal.leaf as Hex);
      this.log(`anchoring ${leaves.length} leaf/leaves...`);

      try {
        const txHash = await this.config.registry.sealBatch(leaves);
        const receipt = await this.config.registry.waitForReceipt(txHash);

        if (receipt.status !== "success") {
          this.config.store.markSealAttempt(pending.map((seal) => seal.leaf));
          this.log(`batch reverted (${txHash}) — will retry`);
          return { anchored: 0 };
        }

        this.config.store.markAnchored(
          pending.map((seal) => seal.leaf),
          txHash,
          Math.floor(Date.now() / 1000),
        );

        this.log(`anchored ${leaves.length} — ${this.config.registry.explorerTxUrl(txHash)}`);
        return { anchored: leaves.length, txHash };
      } catch (error) {
        // Never crash the server because the chain had a bad minute.
        this.config.store.markSealAttempt(pending.map((seal) => seal.leaf));
        this.log(
          `batch failed: ${error instanceof Error ? error.message : String(error)} — will retry with backoff`,
        );
        return { anchored: 0 };
      }
    } finally {
      this.running = false;
    }
  }
}

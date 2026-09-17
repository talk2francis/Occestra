/**
 * The cost governor. An ASP that other agents can call in a loop is an ASP that can be
 * made to spend the owner's money in a loop. Caps are per UTC day, checked before the call
 * and recorded after it.
*/
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class CapExceeded extends Error {
  override readonly name = "CapExceeded";
  constructor(
    public readonly cap: "image" | "llm_usd",
    public readonly limit: number,
    public readonly used: number,
  ) {
    super(
      cap === "image"
        ? `daily image cap reached (${used}/${limit} images today)`
        : `daily model-spend cap reached ($${used.toFixed(2)}/$${limit.toFixed(2)} today)`,
    );
  }

  /** What the MCP tool says back to the calling agent — polite, honest, not alarming. */
  get politeMessage(): string {
    return this.cap === "image"
      ? "Occestra has reached its image-generation ceiling for today. Text artifacts are still available, and image capacity resets at 00:00 UTC."
      : "Occestra has reached its model-spend ceiling for today. Capacity resets at 00:00 UTC.";
  }
}

export interface GovernorLimits {
  dailyImageCap: number;
  dailyLlmUsdCap: number;
}

export const DEFAULT_LIMITS: GovernorLimits = {
  dailyImageCap: 120,
  dailyLlmUsdCap: 15,
};

interface DayCounters {
  day: string;
  images: number;
  usd: number;
}

export class CostGovernor {
  private counters: DayCounters;

  constructor(
    private readonly limits: GovernorLimits = DEFAULT_LIMITS,
    private readonly now: () => number = Date.now,
    private readonly stateFile?: string,
  ) {
    this.counters = this.load();
  }

  private load(): DayCounters {
    if (this.stateFile) {
      try {
        const value = JSON.parse(readFileSync(this.stateFile, "utf8")) as DayCounters;
        if (value.day === this.today() && Number.isFinite(value.images) && Number.isFinite(value.usd)) return value;
      } catch { /* first boot or an incomplete old file */ }
    }
    return { day: this.today(), images: 0, usd: 0 };
  }

  private persist(): void {
    if (!this.stateFile) return;
    mkdirSync(dirname(this.stateFile), { recursive: true });
    const temporary = `${this.stateFile}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.counters), { mode: 0o600 });
    renameSync(temporary, this.stateFile);
  }

  private today(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  private roll(): void {
    const today = this.today();
    if (this.counters.day !== today) {
      this.counters = { day: today, images: 0, usd: 0 };
      this.persist();
    }
  }

  /** Throws CapExceeded BEFORE the money is spent. */
  checkImage(): void {
    this.roll();
    if (this.counters.images >= this.limits.dailyImageCap) {
      throw new CapExceeded("image", this.limits.dailyImageCap, this.counters.images);
    }
  }

  checkLlm(estimatedUsd = 0): void {
    this.roll();
    if (this.counters.usd + estimatedUsd > this.limits.dailyLlmUsdCap) {
      throw new CapExceeded("llm_usd", this.limits.dailyLlmUsdCap, this.counters.usd);
    }
  }

  recordImage(count = 1): void {
    this.roll();
    this.counters.images += count;
    this.persist();
  }

  /** What has been spent today, for /health, for the cost model, and for the operator. */
  get spentUsd(): number {
    this.roll();
    return Number(this.counters.usd.toFixed(6));
  }

  get imagesToday(): number {
    this.roll();
    return this.counters.images;
  }

  recordLlmSpend(usd: number): void {
    this.roll();
    this.counters.usd += usd;
    this.persist();
  }

  /** Reserve budget before a provider call so concurrent calls cannot all pass a stale check. */
  reserveLlm(estimatedUsd: number): number {
    this.checkLlm(estimatedUsd);
    this.counters.usd += estimatedUsd;
    this.persist();
    return estimatedUsd;
  }

  /** Replace a pre-call reservation with the provider's reported cost. */
  settleLlm(reservedUsd: number, actualUsd: number): void {
    this.roll();
    this.counters.usd = Math.max(0, this.counters.usd - reservedUsd + actualUsd);
    this.persist();
  }

  releaseLlm(reservedUsd: number): void {
    this.roll();
    this.counters.usd = Math.max(0, this.counters.usd - reservedUsd);
    this.persist();
  }

  get usage(): Readonly<DayCounters & GovernorLimits> {
    this.roll();
    return { ...this.counters, ...this.limits };
  }
}

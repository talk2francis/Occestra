/**
 * The cost governor. An ASP that other agents can call in a loop is an ASP that can be
 * made to spend the owner's money in a loop. Caps are per UTC day, checked before the call
 * and recorded after it.
 */

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
  ) {
    this.counters = { day: this.today(), images: 0, usd: 0 };
  }

  private today(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  private roll(): void {
    const today = this.today();
    if (this.counters.day !== today) {
      this.counters = { day: today, images: 0, usd: 0 };
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
  }

  recordLlmSpend(usd: number): void {
    this.roll();
    this.counters.usd += usd;
  }

  get usage(): Readonly<DayCounters & GovernorLimits> {
    this.roll();
    return { ...this.counters, ...this.limits };
  }
}

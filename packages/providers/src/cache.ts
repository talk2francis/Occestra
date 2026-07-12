/**
 * A TTL map. Deliberately boring: live data is expensive and slow, and a birthday plan
 * asking for the same city's weather four times should pay for it once.
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export const TTL = {
  weather: 30 * 60_000,
  places: 24 * 60 * 60_000,
  site: 60 * 60_000,
  token: 10 * 60_000,
} as const;

export class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  public hits = 0;
  public misses = 0;

  constructor(private readonly now: () => number = Date.now) {}

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  /** Fetch-through. The only method most callers should touch. */
  async wrap<T>(key: string, ttlMs: number, produce: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const value = await produce();
    this.set(key, value, ttlMs);
    return value;
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}

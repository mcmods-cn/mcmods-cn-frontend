type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
  request: symbol;
};

export class ExpiringPromiseCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly staleTimeMs: number;

  constructor(staleTimeMs: number, maxEntries = 64) {
    if (!Number.isFinite(staleTimeMs) || staleTimeMs <= 0) {
      throw new Error("staleTimeMs must be a positive finite number");
    }
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error("maxEntries must be a positive integer");
    }
    this.staleTimeMs = staleTimeMs;
    this.maxEntries = maxEntries;
  }

  get(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
    const current = this.entries.get(key);
    if (current && now < current.expiresAt) {
      this.entries.delete(key);
      this.entries.set(key, current);
      return current.promise;
    }
    if (current) this.entries.delete(key);

    const request = Symbol(key);
    const promise = Promise.resolve().then(load);
    this.entries.set(key, { expiresAt: now + this.staleTimeMs, promise, request });
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey !== "string") break;
      this.entries.delete(oldestKey);
    }
    void promise.catch(() => {
      if (this.entries.get(key)?.request === request) this.entries.delete(key);
    });
    return promise;
  }

  invalidate(key?: string) {
    if (typeof key === "string") {
      this.entries.delete(key);
      return;
    }
    this.entries.clear();
  }
}

// Memoizes immutable derivations of FINISHED games — replay event logs and
// postgame projections that are expensive to rebuild (O(plies)) yet never
// change once the game is over. Only successful (finished) results are ever
// stored, so a still-running game is never cached. Correctness does not depend
// on eviction (the inputs are immutable); the max-entries + TTL bounds exist
// purely for memory hygiene as room ids rotate over time.
export class FinishedGameCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly maxEntries = 256,
    private readonly ttlMs = 5 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency so the Map's insertion order doubles as an LRU queue.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

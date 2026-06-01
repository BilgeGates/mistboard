import { clientIpForRateLimit, recordMessageTimestamp } from './server-policy.js';

// Re-exported so the auth routes keep importing the rate-limit key helper from
// here. The implementation lives in server-policy.js alongside the proxy-trust
// policy (trustedProxyHops) it depends on, and is shared with the feedback and
// drain endpoints so there is one place that decides which X-Forwarded-For hop
// to trust.
export { clientIpForRateLimit };

// In-memory, per-key sliding-window rate limiter for the auth endpoints.
// Defense-in-depth on top of the per-challenge attempt cap: the cap stops a
// single challenge being ground down, this stops an attacker minting fresh
// challenges and hammering confirm at machine speed across many challenges.
//
// Deliberately persistence-free. Auth throttling must hold even when the DB is
// unavailable, and a single Node process owns its own connections; the bound is
// per-instance, which is the relevant granularity for slowing a brute force.
// Reuses recordMessageTimestamp (the same sliding-window primitive the WS layer
// uses) so there is one rate-limit implementation to reason about.

export type AuthRateLimiter = {
  // Records a hit for `key` and returns true if it is within the window budget,
  // false if the caller should reject with 429.
  check(key: string, now?: number): boolean;
};

export function createAuthRateLimiter(limit: number, windowMs: number): AuthRateLimiter {
  const hits = new Map<string, number[]>();
  return {
    check(key: string, now: number = Date.now()): boolean {
      const timestamps = hits.get(key) ?? [];
      const allowed = recordMessageTimestamp(timestamps, now, limit, windowMs);
      // recordMessageTimestamp prunes in place; an emptied bucket is dropped so
      // the map doesn't grow unbounded with one-shot client IPs.
      if (timestamps.length === 0) hits.delete(key);
      else hits.set(key, timestamps);
      return allowed;
    },
  };
}

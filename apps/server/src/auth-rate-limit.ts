import type { IncomingMessage } from 'node:http';
import { recordMessageTimestamp } from './server-policy.js';

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

// Client IP for rate-limit keying. Mirrors the feedback route: trust the first
// x-forwarded-for hop when present (the deploy sits behind a proxy that sets
// it), else fall back to the socket address. Returns a stable 'unknown' so
// missing-IP requests still share a single bucket rather than bypassing limits.
export function clientIpForRateLimit(request: IncomingMessage): string {
  const xff = request.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]!.trim();
    if (first.length > 0) return first;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

// Lazily-constructed Stripe client (078). Constructed on first use from the
// patron config so the SDK is never instantiated when the program is
// unconfigured (routes guard on isPatronConfigured() before calling here).

import Stripe from 'stripe';
import { patronConfig } from './patron-config.js';

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (client) return client;
  const config = patronConfig();
  if (!config) {
    // Programming error: callers must guard with isPatronConfigured() first.
    throw new Error('stripe_not_configured');
  }
  client = new Stripe(config.secretKey, {
    // Pin the SDK's own default apiVersion (omit to avoid a hardcoded string
    // drifting from the installed SDK). Telemetry off — no extra network calls.
    telemetry: false,
    maxNetworkRetries: 2,
    appInfo: { name: 'mistboard', url: 'https://mistboard.com' },
  });
  return client;
}

// Test seam.
export function resetStripeClientForTest(): void {
  client = null;
}

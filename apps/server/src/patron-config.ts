// Patron program configuration (078). Everything Stripe-related is optional: if
// STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are unset the whole program is
// "unconfigured" and the routes fail closed (503 patron_unconfigured) so the
// feature can land dark on main and be switched on by setting Railway env, the
// same shape as the VITE_*_ENABLED variant flags.
//
// The tier catalog is the contract shared with the web donate selector: the
// client sends a tier KEY (never an amount), the server maps it to a Stripe
// price id from env. That keeps price selection server-authoritative — a client
// can never name its own amount.

export type PatronTierMode = 'subscription' | 'payment';

export type PatronTier = {
  key: string;
  mode: PatronTierMode;
  // Stripe price id is read from this env var. Prices are created once in the
  // Stripe dashboard; ids live in env, not the DB.
  priceEnvVar: string;
  isLifetime: boolean;
};

// USD-only v1. Multi-currency / a custom-amount slider are deferred (see
// patron-track.md). Recurring monthly tiers plus one one-time "lifetime" gift.
export const PATRON_TIERS: readonly PatronTier[] = [
  {
    key: 'monthly_5',
    mode: 'subscription',
    priceEnvVar: 'STRIPE_PRICE_MONTHLY_5',
    isLifetime: false,
  },
  {
    key: 'monthly_10',
    mode: 'subscription',
    priceEnvVar: 'STRIPE_PRICE_MONTHLY_10',
    isLifetime: false,
  },
  {
    key: 'monthly_20',
    mode: 'subscription',
    priceEnvVar: 'STRIPE_PRICE_MONTHLY_20',
    isLifetime: false,
  },
  {
    key: 'monthly_50',
    mode: 'subscription',
    priceEnvVar: 'STRIPE_PRICE_MONTHLY_50',
    isLifetime: false,
  },
  { key: 'lifetime', mode: 'payment', priceEnvVar: 'STRIPE_PRICE_LIFETIME', isLifetime: true },
];

export function findPatronTier(key: string): PatronTier | null {
  return PATRON_TIERS.find((tier) => tier.key === key) ?? null;
}

export type PatronConfig = {
  secretKey: string;
  webhookSecret: string;
  // tier key -> Stripe price id, only for tiers whose price env var is set.
  priceByTier: ReadonlyMap<string, string>;
  // Where Stripe Checkout / Billing Portal redirect back to.
  publicHost: string;
};

export function loadPatronConfig(env: NodeJS.ProcessEnv = process.env): PatronConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secretKey || !webhookSecret) return null;

  const priceByTier = new Map<string, string>();
  for (const tier of PATRON_TIERS) {
    const priceId = env[tier.priceEnvVar]?.trim();
    if (priceId) priceByTier.set(tier.key, priceId);
  }

  return {
    secretKey,
    webhookSecret,
    priceByTier,
    publicHost: env.MISTBOARD_HOST ?? 'https://mistboard.com',
  };
}

// A memoized read for the hot path (route guards). Config is process-env
// derived and stable for the process lifetime.
let cached: PatronConfig | null | undefined;
export function patronConfig(): PatronConfig | null {
  if (cached === undefined) cached = loadPatronConfig();
  return cached;
}

export function isPatronConfigured(): boolean {
  return patronConfig() !== null;
}

// Test seam: reset the memoized config so a test can vary env.
export function resetPatronConfigCache(): void {
  cached = undefined;
}

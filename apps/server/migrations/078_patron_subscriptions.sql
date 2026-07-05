-- 078_patron_subscriptions.sql
-- Patron donation program (lichess-parity). A Patron is a signed-in account
-- with an active recurring donation or a one-time "lifetime" donation. The only
-- perk is a cosmetic profile badge; nothing in the game is ever gated on it.
--
-- Three pieces of state:
--   1. patron_subscriptions — one row per Stripe subscription (recurring) or
--      one-time/lifetime donation, mirrored from Stripe webhooks. Stripe is the
--      source of truth; this table is the local projection the app reads.
--   2. users.patron_since / users.stripe_customer_id — denormalized hot-read
--      fields. patron_since drives the badge without a join on every profile /
--      session load; stripe_customer_id gives a stable account->customer map so
--      a returning donor reuses their Stripe customer (and can open the billing
--      portal). Both nullable: NULL patron_since = not a patron.
--   3. stripe_events — processed webhook event ids for idempotency. Stripe
--      re-delivers events; a replayed event.id must not double-apply.
--
-- Patron status is intentionally NOT folded into users.account_role: that column
-- is admin-adjacent and tamper-audited (033_account_role_audit.sql), single-
-- valued, and security-sensitive. Patron status is orthogonal and churns with
-- billing lifecycle, so it lives in its own table + cache columns.

CREATE TABLE IF NOT EXISTS patron_subscriptions (
  id                     BIGSERIAL PRIMARY KEY,
  account_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider               TEXT NOT NULL DEFAULT 'stripe',
  stripe_customer_id     TEXT,
  -- NULL for one-time / lifetime donations (Stripe payment, not subscription).
  stripe_subscription_id TEXT UNIQUE,
  -- Mirrors the Stripe subscription status, plus our own 'lifetime' for a
  -- completed one-time donation. active|trialing|past_due|canceled|incomplete|
  -- incomplete_expired|unpaid|paused|lifetime.
  status                 TEXT NOT NULL,
  -- Human label of the chosen amount, e.g. 'monthly_10' or 'lifetime'. Purely
  -- descriptive; entitlement is derived from status/is_lifetime, never from tier.
  tier                   TEXT,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT false,
  is_lifetime            BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patron_subscriptions_account_idx
  ON patron_subscriptions (account_id);

-- Idempotency ledger for Stripe webhook delivery. INSERT ... ON CONFLICT DO
-- NOTHING; if the row already exists the event was already applied and is
-- skipped. type/created_at are kept for debugging/audit only.
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS patron_since TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT NULL;

-- Badge reads filter to patrons; a partial index keeps that cheap as the user
-- table grows well past the patron count.
CREATE INDEX IF NOT EXISTS users_patron_since_idx
  ON users (patron_since) WHERE patron_since IS NOT NULL;

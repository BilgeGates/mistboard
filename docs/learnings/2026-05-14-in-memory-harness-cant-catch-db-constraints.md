# In-memory integration harness can't catch DB constraint violations

**Date:** 2026-05-14
**Related incident:** `incidents/2026-05-14-resignation-termination-missing.md`

## The gap

The WS integration harness (`integration/core-loop.test.ts`) starts the server with `MISTBOARD_ALLOW_IN_MEMORY_PERSISTENCE=true` and no `DATABASE_URL`. Inside `appendEvent`, the persistence write path is guarded by `if (persistence.isInitialized())` — so with the in-memory harness, `recordGameEnd` is never called and no DB writes happen at all.

This means any bug in:
- `buildGameSummary` (wrong field, wrong mapping)
- `recordGameEnd` (parameter order, SQL, missing constraint value)
- DB schema vs. TypeScript type alignment

…is completely invisible to CI until a test exercises the Postgres path.

## What this caught

Two bugs found on 2026-05-14 when the first Postgres-backed integration test was written:

**1. `'resignation'` missing from `games_termination_check`**
The game engine emits `reason = 'resignation'` but the DB constraint only listed `king-captured`, `timeout`, `checkmate`, `draw`, and abort-type values. Every resigned PvP game silently failed `recordGameEnd`. The error was swallowed; the games row was never written.

**2. Migration 017 type mismatch (`UUID` vs `TEXT`)**
`017_user_bucket_ratings.sql` declared `user_id UUID` but `users.id` is `TEXT` (established in migration 008). This made the FK constraint impossible to create on any fresh DB. The bug was invisible in CI because no test calls `startServer` with a real DB — migrations were never exercised.

## The rule

**Any path guarded by `persistence.isInitialized()` needs a Postgres-backed integration test to be covered.** In-memory tests verify game flow; they say nothing about whether the DB writes succeed.

The corollary: **DB constraint sets and TypeScript union types are a dual representation that can drift.** The type system doesn't reach into SQL. Whenever a new termination reason, result type, or status value is added to the game engine, the migration constraint and the TypeScript type both need updating — and only a Postgres-backed test will catch the mismatch before it reaches production.

## What to watch for

- New game-end reasons (e.g. future: `'abandoned-by-disconnect'`, `'draw-offer'`) — add to both the constraint migration and `GameTermination`.
- New `recordGameStart` / `recordGameEnd` call sites — add a Postgres-backed integration test for the new path.
- Schema changes to `games` or `game_participants` — run a full resign test locally before shipping.

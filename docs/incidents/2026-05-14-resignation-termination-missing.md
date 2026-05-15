# Silent recordGameEnd failure on every PvP resign

**Date:** 2026-05-14
**Status:** resolved
**Severity:** sev2 (degraded — no user-visible gameplay impact, but data silent-dropped)

## What happened

Every PvP game that ended by resignation was missing its `games` row and both `game_participants` rows in Postgres. The game itself worked correctly for players (they saw the correct outcome), but the persistence layer silently dropped the record.

The root cause: `buildGameSummary` passes `status.reason` through to `recordGameEnd` as the `termination` field. The game engine emits `reason = 'resignation'` on resign. The `games_termination_check` DB constraint had never included `'resignation'` as a valid value (nor was it in the `GameTermination` TypeScript union), so every `recordGameEnd` call for a resigned game threw a constraint violation.

The error was caught and logged inside `appendEvent` but not re-thrown:

```typescript
} catch (err) {
  // Events are durable; the games-row aggregate can be backfilled.
  // Log loudly so it's visible.
  console.error(JSON.stringify({ level: 'error', kind: 'game_end_record_failure', ... }));
}
```

No alert was wired to `game_end_record_failure` log lines, so the failure was invisible until this incident.

## Detection

Discovered 2026-05-14 while writing `integration/persist-resign.test.ts` — the first test to exercise the full WS → resign → Postgres path. The test failed with:

```
new row for relation "games" violates check constraint "games_termination_check"
```

## Impact

- All PvP games ended by resignation (from launch through 2026-05-14) have no `games` row.
- `game_participants` rows are missing for the same games.
- Elo calibration data, leaderboard attribution, and analytics undercount all resigned games.
- No user-visible gameplay impact (game state correct in-memory; reconnect/replay works via the `events` table).

## Fix

- **Migration 018** (`018_add_resignation_termination.sql`): drops and recreates `games_termination_check` with `'resignation'` included.
- **`GameTermination` type** in `persistence.ts`: added `'resignation'` to the union.
- **`integration/persist-resign.test.ts`**: new integration test that runs the full resign path against real Postgres and asserts both the `games` row and `game_participants` rows.
- **CI**: `TEST_DATABASE_URL` now passed to the integration test run so the Postgres path is active in CI, not skipped.

## Data backfill

The `events` table is durable and complete. Every resigned game has a `seat-resigned` event. A one-time backfill query can reconstruct `games` + `game_participants` rows from the event stream for any room where `events` has a `seat-resigned` event but `games` has no row.

See: `docs/learnings/2026-05-14-in-memory-harness-cant-catch-db-constraints.md`

# 2026-05-09 - CI node engine attribution incident

## Summary

After the room replay and sound work landed, the GitHub Actions `node` job
failed on `main`. The failing step was the Postgres-backed test run in CI:

```text
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/bichess npm test
```

The failure was not caused by Node itself. It was a persistence test expectation
drift introduced by the engine display-name change.

## Impact

- `main` had a red CI run after commits:
  - `141c3b8 Improve postgame room replay`
  - `2435e1c Refine live room sound cues`
- Runtime behavior was intentional: persisted engine participants now use the
  richer display label `Random Legal v1` instead of the raw engine version id
  `builtin-random-legal`.
- CI failed because two DB-backed tests still expected the old raw id as the
  participant `displayName`.

## Root Cause

The implementation changed fallback engine attribution labels in durable game
summaries:

- before: `displayName: "builtin-random-legal"`
- after: `displayName: "Random Legal v1"`

The non-DB server test path skipped persistence tests unless `TEST_DATABASE_URL`
was set. Earlier local verification ran server tests without Postgres, so the
affected assertions were skipped locally but executed in CI.

## Detection

The failing CI symptom was reproduced locally by running the CI-equivalent
Postgres test command against the local Docker Postgres:

```text
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5435/bichess npm test
```

That surfaced two failing tests in `apps/server/src/persistence.test.ts`:

- `recordGameEnd writes durable participant attribution`
- `listCompletedGames returns completed games in date range with participants`

Both failures were exact expectation mismatches on `participants[1].displayName`.

## Fix

Commit `d4c1fe9 Update engine attribution test labels` updated those test
expectations from `builtin-random-legal` to `Random Legal v1`.

Post-fix local CI-equivalent checks passed:

```text
npm run build
npm run typecheck
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5435/bichess npm test
npm audit --omit=dev
```

## Learnings

- Changes to persisted display labels are user-facing data-model changes, even
  when they look like UI polish.
- Any change touching participant attribution, game summaries, or persistence
  fallback labels needs the DB-backed test path, not only the no-DB server tests.
- The local shorthand `npm test --workspace @bichess/server` can be misleading:
  without `TEST_DATABASE_URL`, persistence tests are skipped by design.
- CI does useful extra coverage here because it provides Postgres and exercises
  durable records, list APIs, and attribution fallbacks together.

## Guardrail

For future changes in these areas:

- engine/player display names;
- `GameSummary`;
- `GameParticipant`;
- `recordGameEnd`;
- recent/completed game list APIs;
- persistence fallback participants;

run the Postgres-backed command before pushing:

```text
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5435/bichess npm test
```

If local Postgres is not running, start it with:

```text
npm run db:up
```

Then rerun the test command.

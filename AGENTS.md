# Codex Agent Notes

This file is the repo-local orientation layer for Codex. It should stay public-safe:
do not add private strategy, deploy runbooks, credentials, provider account details,
or exact operational checklists.

## Start Here

Read these before editing:

1. `CLAUDE.md` - project rule, hard deferrals, architecture invariants.
2. `INDEX.md` - current file-level map. Prefer it before opening source.
3. `README.md`, `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`.
4. `docs/documentation-policy.md` before adding or expanding docs.

Always begin with:

```bash
git status --short --branch
git worktree list
```

The user often runs Claude and Codex sessions in parallel. Treat existing dirty
changes as someone else's work unless you made them in this session.

## Product Rule

Mistboard is an open-source platform foundation for hidden-information games,
starting with dark chess. Use "Fog of War chess" as secondary SEO/explainer
language. Before adding behavior, ask:

> Does this make Mistboard a more trustworthy, serious place to play, study,
> rank, or build engines for dark chess and future hidden-information
> games?

If no, defer it unless the user explicitly directs otherwise. Link-based play is
a low-friction UX promise, not the whole project thesis.

## Non-Negotiable Invariants

- Server owns canonical `GameState`.
- Clients render `PlayerView`, not canonical truth.
- Fog of War code must never send hidden pieces or hidden opponent moves to the wrong client.
- Event history should remain the replay and reconnect source of truth.
- Keep v1 low-friction and account-optional unless the roadmap explicitly changes.
- Draft960 is a pregame option inside Fog of War, not a separate product surface.

## Current Project Shape

- `packages/game`: pure game logic, variants, visibility, clocks, time controls, event replay.
- `packages/board-render`: shared SVG board renderer for server/build/browser surfaces.
- `apps/server`: Node WebSocket server, room lifecycle, clocks, HTTP API, persistence, ratings infra, engine queue.
- `apps/web`: no-framework Vite client, live game, replay, account/profile/leaderboard/articles/learn pages.
- `research/python-fow-lab`: offline Python research sidecar. Do not import it from `apps/` or `packages/`.

Use `INDEX.md` for the detailed ownership map. It is intentionally the fastest
entry point for locating source files.

## Current Direction

As of late May 2026, Mistboard is being framed as an open-source, trustworthy
platform foundation for hidden-information games, starting with dark chess. The
long-term product loop is: players challenge the strongest
open-source dark-chess engine available, get pulled into the game, and then
climb a serious ranked ladder against people.

Near-term work is still M1 pre-distribution hardening: mobile gameplay
verification, empty-lobby engine fallback verification, share surface checks,
article mobile pass, live analytics verification, and an M1-bar engine for
beginners. Ratings, ladder, and matchmaking work should stay gated until the
integrity, calibration, and quality bar is cleared.

## Development Commands

Root scripts:

```bash
npm install
npm run dev
npm run dev:persistent
npm test
npm run test:unit
npm run typecheck
npm run lint
npm run build
```

Postgres-backed local checks:

```bash
npm run db:up
npm run db:migrate
npm run test:persistent
```

Useful targeted checks:

```bash
npm run test:unit --workspace @mistboard/game
npm run test:unit --workspace @mistboard/server
npm run test:integration --workspace @mistboard/server
npm run test:unit --workspace @mistboard/web
npm run typecheck --workspace @mistboard/web
```

Prefer targeted checks while iterating, then run the broader command that matches
the blast radius before handoff.

## Editing Guidance

- Follow existing TypeScript style and Biome formatting.
- Keep pure game logic out of server/web packages.
- Add hidden-information regression tests for any payload, replay, observer, or room-state change.
- Add package-level rule tests in `packages/game` for visibility or move-generation changes.
- Add new HTTP routes in `apps/server/src/routes/*` and register route modules through `http-api.ts` only when needed.
- Add schema changes as new migrations only; do not edit landed migrations.
- Avoid generated corpora, local experiment output, and large logs unless they are reviewed benchmark/release artifacts.

## Documentation And Announcements

- Public docs should be contributor-safe. Private planning belongs outside the repo or in ignored `docs-private/`.
- Do not link public docs to specific private files.
- If the user says "card this" after a user-facing shipped change, append a one-line entry to `apps/web/src/announcements.ts` with the current date. Skip internal-only work unless the user asks.

## Secrets

Do not read `.env`, `.env.local`, `.env.*.local`, credentials files, provider
variable dumps, or secret-bearing environment values. Verify secrets through
runtime behavior or ask the user to check provider dashboards.

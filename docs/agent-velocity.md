# Agent Velocity

Mistboard is often edited by multiple local agent sessions. The fastest sessions
are the ones that make the current repository state obvious before they choose a
file, a test target, or a commit path.

## Start-of-session scan

Run the required git checks first:

```bash
git status --short --branch --untracked-files=all
git worktree list
```

Then run the live orientation scan:

```bash
npm run agent:scan
```

The scan reports:

- current dirty paths and worktrees,
- largest code surfaces that cost navigation time,
- common friction markers such as `TODO`, `@ts-ignore`, and `as any`,
- targeted test commands by change area.

`INDEX.md` remains the curated ownership map. `agent:scan` is the live state
check that catches drift, new large files, and concurrent work before an agent
opens source.

For long-running work, create an isolated task tree:

```bash
npm run worktree:new -- <slug>
npm run worktree:prepare
```

`worktree:prepare` installs dependencies when missing, builds the internal
package declarations that downstream workspaces read from `dist/`, and runs the
drift guard. Use `npm run worktree:new -- <slug> --prepare` when the new tree
should be commit-ready immediately.

Before handoff, let the changed paths pick the narrow checks:

```bash
npm run verify -- --changed
npm run verify -- --since origin/main
```

Use named confidence gates when a change crosses package boundaries:

```bash
npm run ci:quick
npm run ci:local
```

`ci:quick` starts with `npm run build` so downstream packages do not accidentally
read stale workspace `dist` types, and server unit tests have the dist entrypoint
they spawn.

The installed pre-push hook is path-aware for pushes to `main`: docs/meta-only
pushes run the drift guard, app-level deploy-affecting pushes run the changed
path verifier against the remote main SHA, and broad repo-tooling or shared
package changes clean `dist/` before running `ci:quick`.

For manual M1 gates, record public-safe evidence instead of relying on memory:

```bash
npm run gate:evidence -- --gate mobile-gameplay --result pass
```

Before broad handoff, run the narrow drift guard:

```bash
npm run check:drift
```

It catches stale public documentation links, selected SQL enum/constraint drift,
and accidental bypasses of the live fog payload redaction path.

For production push verification, CI waits for stable `/health` and deployed
`/api/server-status` revision responses before running smoke tests:

```bash
npm run prod:wait-revision -- --expect-revision <sha>
```

The wait requires consecutive ready checks by default. This avoids releasing
the real smoke during Railway cutover, when one edge request may already see the
new revision while another still returns a transient service-level 404.

Use the production smoke tier that matches the change:

```bash
npm run prod:smoke:lite
npm run prod:smoke:engines -- --engine python-tier1-v0.9.5
npm run prod:smoke:engine-playout -- --engine python-tier1-v0.9.5 --target-plies 64
```

Keep the verification budget proportional. Pure extraction with no behavior,
CSS, or route change should stop at targeted typecheck/unit/lint/drift checks
plus `npm run verify -- --changed`; run visual, mobile, CI, Railway, and prod
smoke when the change affects layout, browser behavior, deployment, or a
release-bound branch.

The full engine playout is a reliability gate, not the default check for every
deploy. Late-ply replies can take several seconds each, so handoffs should
separate deploy wait time from playout wait time.

## Current velocity losses

- Shared worktrees are the highest-cost failure mode. Existing dirty files
  should be treated as another session's work unless the current session made
  them.
- Large files still dominate navigation: `live-render.ts`, `replay.ts`,
  `landing.ts`, `persistence.ts`, and `apps/web/src/styles.css` should be split
  only when a real behavior change gives the extraction a natural boundary.
- Manual mobile/article inspection was hidden behind `node
  scripts/mobile-loop.mjs`; use `npm run test:mobile:shots` after starting the
  dev server.
- The old pre-commit hook auto-stashed all unstaged and untracked files. That
  was convenient for a single human session, but unsafe for parallel agents
  because it rewrote unrelated local work. The hook now fails fast unless
  `MISTBOARD_PRECOMMIT_STASH=1` is set for a one-off local commit.
- Generated research corpora and model checkpoints should stay ignored unless a
  reviewed result is intentionally promoted into docs or docs-private. Large
  untracked trees make dirty-state scans and hooks slower for every session.
  Local Python feedback runs, lab run output, Rust build output, pytest caches,
  and `__pycache__` directories under `research/python-fow-lab/` are ignored for
  this reason.

## Working rules

- Prefer one worktree per long-running agent task.
- Avoid repo-wide format or cleanup commands while another session is active.
- Stage commits path-specifically and inspect `git diff --cached --stat` before
  committing.
- Keep generated research outputs under ignored artifact directories, and
  promote only small reviewed notes or fixtures.
- For hidden-information changes, add or run tests that prove forbidden payloads
  are absent. UI correctness is not enough.
- Use the narrowest meaningful check while iterating, then run the broader check
  that matches the blast radius before handoff.

## Next refactor candidates

- Keep `apps/server/src/persistence.ts` as a compatibility facade. Pool
  lifecycle, room seat tokens, running-game lifecycle/event/debug-artifact
  persistence, completed-game queries, accounts/profile/leaderboard, feedback,
  and site stats now live in focused `persistence-*` modules.
- Continue extracting `apps/web/src/live-render.ts` around stable UI domains:
  clocks, controls, captures, draft picker, and end-state panels. Static room
  layout already lives in `apps/web/src/live-layout.ts`; replay-derived current
  view helpers live in `apps/web/src/live-view.ts`; status copy/tone decisions
  live in `apps/web/src/live-status.ts`; board adapter helpers live in
  `apps/web/src/live-board.ts`; replay controls and move-list rendering live in
  `apps/web/src/live-move-list.ts`; clock rendering and timer refresh live in
  `apps/web/src/live-clocks.ts`; capture rows live in
  `apps/web/src/live-captures.ts`; abort/resign controls live in
  `apps/web/src/live-game-controls.ts`; invite/review/rematch/play-again rows
  live in `apps/web/src/live-room-actions.ts`.
- Split `apps/web/src/replay.ts` around data loading, board adapter, annotation
  controls, and engine-review panels.
- Keep `apps/web/src/landing.ts` as the shell only; move new route-specific or
  widget-specific behavior into focused modules.
- Keep server runtime defaults in `apps/server/src/server-config.ts`; add new
  startup environment reads there instead of in `apps/server/src/index.ts`.

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

For production push verification, CI waits for the deployed `/api/server-status`
revision before running smoke tests:

```bash
npm run prod:wait-revision -- --expect-revision <sha>
```

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

## Working rules

- Prefer one worktree per long-running agent task.
- Avoid repo-wide format or cleanup commands while another session is active.
- Stage commits path-specifically and inspect `git diff --cached --stat` before
  committing.
- For hidden-information changes, add or run tests that prove forbidden payloads
  are absent. UI correctness is not enough.
- Use the narrowest meaningful check while iterating, then run the broader check
  that matches the blast radius before handoff.

## Next refactor candidates

- Split `apps/server/src/persistence.ts` by ownership
  (`persistence/{games,events,rooms,accounts,feedback,pool}.ts`) when touching
  SQL behavior.
- Continue extracting `apps/web/src/live-render.ts` around stable UI domains:
  clocks, controls, captures, draft picker, and end-state panels.
- Split `apps/web/src/replay.ts` around data loading, board adapter, annotation
  controls, and engine-review panels.
- Keep `apps/web/src/landing.ts` as the shell only; move new route-specific or
  widget-specific behavior into focused modules.

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

## Current velocity losses

- Shared worktrees are the highest-cost failure mode. Existing dirty files
  should be treated as another session's work unless the current session made
  them.
- Large files still dominate navigation: `live-render.ts`, `replay.ts`,
  `landing.ts`, `persistence.ts`, and `apps/web/src/styles.css` should be split
  only when a real behavior change gives the extraction a natural boundary.
- Manual mobile/article inspection was hidden behind `node
  scripts/mobile-loop.mjs`; use `npm run mobile:loop` after starting the dev
  server.
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

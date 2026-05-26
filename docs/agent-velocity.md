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

Sandboxed agents should place task worktrees under a writable temp root instead
of the default sibling directory:

```bash
npm run worktree:new -- <slug> --path /private/tmp/mistboard-<slug>
ln -s "$PWD/node_modules" /private/tmp/mistboard-<slug>/node_modules
npm run worktree:prepare -- --no-install
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

For server integration checks, forwarded Node test flags now work as expected:

```bash
npm run test:integration --workspace @mistboard/server -- --test-name-pattern=drain
npm run test:integration --workspace @mistboard/server -- integration/drain.test.ts
```

The wrapper keeps test-runner flags before integration files, so a narrow drain
check does not accidentally run the slow loadtest smoke.

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

For production push verification, do not attach exact-revision prod smoke as an
automatic GitHub check on the same commit Railway is waiting to deploy. Railway
currently treats the `Prod Smoke` workflow as part of the commit check suite, so
an automatic post-CI smoke creates a circular gate: Railway waits for Prod Smoke
while Prod Smoke waits for Railway.

Use the planner locally or in a manual run to decide whether a pushed range can
affect the web deployment:

```bash
npm run prod:smoke:plan -- --base-from-prod --head HEAD
npm run prod:smoke:plan -- --base HEAD^ --head HEAD
```

The planner compares the range from the currently deployed production revision
to the pushed commit against `railway.web.json` watch patterns. If no web deploy
path changed, the exact-revision wait would only poll for a revision Railway
will not serve. If the production revision cannot be read or diffed locally, the
planner falls back to recommending the smoke.

After Railway has actually deployed a revision, dispatch the `Prod Smoke`
workflow with `full=true` and `expect_revision=<sha>`, or run the equivalent
local commands:

```bash
npm run prod:wait-revision -- --expect-revision <sha>
npm run prod:smoke -- --expect-revision <sha>
npm run prod:smoke:engines
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
Manual full production smoke writes timing summaries for dependency install,
Railway revision wait, web smoke, and engine smoke so slow deploys are visible
as a specific phase instead of one undifferentiated red or slow run.

## Current velocity losses

- Shared worktrees are the highest-cost failure mode. Existing dirty files
  should be treated as another session's work unless the current session made
  them.
- Large files still dominate navigation: `learn.ts`, `landing.ts`,
  `apps/server/src/index.ts`, and `apps/web/src/styles.css` should be split
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
  live in `apps/web/src/live-room-actions.ts`; debug mini-board rendering lives
  in `apps/web/src/live-dev-views.ts`.
- Split `apps/web/src/replay.ts` around data loading, board adapter, annotation
  controls, and engine-review panels. Wall-clock loop timing helpers now live
  in `apps/web/src/replay-wall-clock.ts`; replay move-list panel UI lives in
  `apps/web/src/replay-moves-panel.ts`; game metadata/header UI lives in
  `apps/web/src/replay-meta.ts`; clock panel rendering lives in
  `apps/web/src/replay-clocks.ts`; board/pane adapters live in
  `apps/web/src/replay-board.ts`; engine review panel/toggle UI lives in
  `apps/web/src/replay-engine-panels.ts`; annotation panel/form UI lives in
  `apps/web/src/replay-annotations.ts`; belief and annotation styles live in
  `apps/web/src/replay-analysis.css`.
- Keep `apps/web/src/landing.ts` as the shell only; move new route-specific or
  widget-specific behavior into focused modules.
- Keep server runtime defaults in `apps/server/src/server-config.ts`; add new
  startup environment reads there instead of in `apps/server/src/index.ts`.
- Keep static page rendering out of `apps/server/src/index.ts`; page-meta
  injection, article prerender fallback serving, game replay shells, and sitemap
  generation live in `apps/server/src/server-static-pages.ts`.
- Keep admin drain mechanics in `apps/server/src/server-drain.ts`; `index.ts`
  should route `/admin/drain*` there and pass the drain controller functions
  into HTTP API context.
- Keep client WebSocket wire-format parsing in
  `apps/server/src/server-ws-messages.ts`; add new inbound message names to its
  allowlist instead of hiding them in the connection dispatcher.
- Keep engine lab layout styles in `apps/web/src/bakeoff.css` and replay
  belief/annotation panel styles in `apps/web/src/replay-analysis.css`; do not
  add new lab-only selectors back into the global stylesheet.
- Keep account, profile, and leaderboard route styles in
  `apps/web/src/account-profile.css`; do not add new account/profile table or
  form selectors back into the global stylesheet.
- Keep learn/tutorial route styles in `apps/web/src/learn.css`; do not add new
  learn module cards, chapter menus, tutorial panels, or learn-board callouts
  back into the global stylesheet.

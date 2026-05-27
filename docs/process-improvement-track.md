# Process Improvement Track

_Started: 2026-05-25_

This track turns repeated Mistboard operating lessons into repo-native tooling
and contributor-visible process. The goal is not bureaucracy. The goal is to
make the safe path faster than the improvised path, especially when multiple
local agent sessions are active at once.

## Why This Track Exists

Mistboard is now large enough that process failures can cost as much time as
ordinary implementation bugs:

- concurrent sessions can clobber uncommitted work in a shared tree;
- hidden-information changes need the right payload and persistence checks, not
  just a green UI;
- manual launch gates need evidence, not memory;
- local hooks and CI do not currently express the same contract;
- useful visual, mobile, smoke, and release scripts exist, but check selection
  still relies too much on operator judgment.

The first major push is to package the existing good habits into small commands
that are easy for humans and agents to run consistently.

## Principles

- Prefer automation that reduces decision load without hiding risk.
- Keep public docs contributor-safe; private runbooks and provider details stay
  out of the repo.
- Make the narrow check obvious while iterating, and the broader release check
  obvious before handoff.
- Protect hidden-information invariants with tests and contracts, not trust in
  review alone.
- Treat worktree isolation as the default for long-running or parallel work.

## First Major Push

_Implementation status: initial scan, worktree, verification, local CI,
manual-gate evidence, drift checks, and visual/mobile command names started in
May 2026._

### 1. Worktree-First Task Setup

Add a small worktree helper for new implementation tracks:

```bash
npm run worktree:new -- <slug>
npm run worktree:prepare
```

Expected behavior:

- creates a task branch and sibling worktree;
- prints the branch, worktree path, and starting commit;
- runs or points to `npm run agent:scan`;
- prepares fresh worktrees for typecheck/commit by building local package
  declarations;
- refuses ambiguous names and avoids overwriting existing worktrees.
- supports `--path <path>` so sandboxed agents can create task trees under a
  writable temp root instead of an unwritable sibling directory.

This formalizes the current rule from `docs/agent-velocity.md`: long-running
tasks should not share the main working tree.

### 2. Path-Aware Verification

Add a verification helper that maps changed files to the checks most likely to
matter:

```bash
npm run verify -- --changed
npm run verify -- --since origin/main
```

Initial mapping:

- `packages/game/**` → game unit tests;
- `apps/server/src/**` or `apps/server/integration/**` → server unit and
  integration tests;
- `apps/server/migrations/**` or persistence paths → Postgres-backed tests;
- `apps/web/src/**` → web unit tests and web typecheck;
- broad cross-package edits → root typecheck, unit tests, and cycle check;
- visual/live-room CSS or render edits → visual/mobile smoke recommendation.

The helper should print commands before it runs them and make skipped checks
explicit.

### 3. Local Gate Names That Match CI

Introduce named local gates so "green locally" has a clearer meaning:

```bash
npm run ci:quick
npm run ci:local
```

Suggested split:

- `ci:quick`: build, typecheck, unit tests, cycle check;
- `ci:local`: build, typecheck, unit tests, Postgres-backed server tests, server
  integration tests, production dependency audit when network is available.

The pre-push hook can then call one of these names, or clearly print which CI
steps remain CI-only.

Current implementation routes pushes to `main` through a path-aware pre-push
planner. Docs/meta-only pushes run `npm run check:drift` instead of a cold
build, app-level deploy-affecting pushes run `npm run verify -- --since
<remote-main-sha>`, and broad repo-tooling/package/shared-package changes clean
`dist/` before running `npm run ci:quick`.

CI production smoke now waits for consecutive stable `/health` and
`/api/server-status` responses reporting the pushed revision before running the
smoke suite. A healthy old container is not enough to mark a deployment
current, and a single successful response is not enough during Railway cutover.
The prod smoke gate lives in a separate
workflow-run workflow so Railway can first observe a green build/test CI check,
deploy the commit, and then have the post-deploy smoke verify that exact
revision. The revision wait window is 15 minutes because current production
builds include the private engine checkout and Rust/PyO3 wheel build.

#### Deploy-Time Follow-Up

The next process/tooling pass should measure and reduce production deploy
latency separately from CI latency. On 2026-05-25, a small TypeScript
persistence refactor reached green GitHub CI in about two minutes, while the
post-deploy smoke spent more than six minutes waiting for Railway to build and
promote the exact revision. The product value of the revision wait is clear: it
prevents a healthy old container from masking a failed deploy. The cost is that
every deploy-affecting commit now exposes the full production build path.

Track these optimizations after the engine extraction settles:

- keep verification budgets proportional: pure extraction should use targeted
  local checks, while visual/mobile/prod smoke should be reserved for layout,
  browser behavior, deploy, and release-bound changes;
- keep server integration filtering trustworthy: `npm run test:integration
  --workspace @mistboard/server -- --test-name-pattern=<name>` and explicit
  file paths should stay narrow instead of accidentally running slow loadtest
  smokes;
- compare Railway build/promotion time before and after the engine extraction;
- keep the engine build out of ordinary web/server deploys when the engine is
  not part of the changed artifact;
- prebuild or cache private engine/Rust/PyO3 wheel artifacts if they must remain
  in the deploy image;
- make CI and prod-smoke path filters match Railway deploy watch patterns, so
  non-deploy commits do not wait for a revision that production will never
  serve;
- treat production smoke as tiers: `prod:smoke:lite` for revision and basic API
  health, `prod:smoke:engines` for engine admission and one real reply, and
  `prod:smoke:engine-playout` for reliability changes where several minutes of
  live engine turns are intentional signal;
- keep a safe synthetic alert path available through
  `npm run ops:test-engine-alert` so Resend rendering and delivery can be tested
  without manufacturing a real incident;
- publish deploy duration in handoffs alongside CI duration so slow build paths
  are visible instead of felt only as waiting time.

Current implementation: `npm run prod:smoke:plan` reads `railway.web.json`
watch patterns and can compare from the currently deployed production revision
to a pushed commit, which keeps multi-commit pushes conservative while still
identifying commits that do not affect the web Railway service. Automatic
post-CI exact-revision smoke is intentionally disabled because Railway treats
that workflow as part of the commit check suite; running it automatically caused
a circular wait where Railway waited for Prod Smoke and Prod Smoke waited for
Railway. Manual full smoke writes step-summary timings for dependency install,
revision wait, web smoke, and engine smoke.

### 4. Manual Gate Evidence

Add a tiny evidence workflow for M1 manual checks:

```bash
npm run gate:evidence -- --gate mobile-gameplay --result pass
```

Expected output:

- a public-safe dated evidence entry under `docs/`;
- the exact target environment and check command when relevant;
- no cookies, tokens, seat tokens, provider secrets, or private runbook detail.

This should support mobile gameplay, article mobile pass, empty-lobby engine
fallback, OG scraper sanity, and analytics verification.

Current implementation writes entries under `docs/gate-evidence/` and supports
`--dry-run` for script verification without creating a record.

### 5. First-Class Visual And Mobile Smoke

Promote the existing visual and mobile scripts into a clearer test surface:

```bash
npm run test:e2e:smoke
npm run test:mobile:shots
```

The current scripts already capture useful signal. The improvement is to give
them predictable names, outputs, and failure summaries so they can be used in
handoffs and optionally uploaded by CI later.

### 6. Contract Checks For Drift

Add small checks for the classes of bugs that have already hurt the project:

- TypeScript union values versus SQL check constraints;
- public documentation references to files that no longer exist;
- forbidden public-doc links into private notes;
- hidden-information response paths that bypass `PlayerView` or known
  redaction helpers.

These should start as narrow, comprehensible checks. False positives that train
people to ignore the command are worse than a smaller useful guard.

Current implementation:

```bash
npm run check:drift
```

It checks public Markdown links, selected SQL constraint values against
TypeScript unions, and the live snapshot/event payload guard rails that keep fog
responses on `PlayerView` and per-recipient event filters.

## Definition Of Done For The First Push

- A new task can start in an isolated worktree with one command.
- A contributor can run one verification command and get a check plan based on
  changed paths.
- The repo has named local CI gates with documented scope.
- Manual M1 evidence can be recorded without editing the roadmap from memory.
- Visual/mobile smoke commands are discoverable from `package.json`.
- Documentation drift checks catch stale file references before review.

## Second Major Push

### Codebase Velocity And Tech Debt

_Status: initial server contract fixture builders and web shell/game display
extraction started after current tree cleanup._

This push is the codebase-structure companion to the first process/tooling push.
The goal is to reduce the amount of source an agent or contributor must hold in
context to make a safe change.

Do not begin this push from the shared dirty tree. As of 2026-05-25, tree cleanup
is already in progress. Start the work from a green, isolated worktree after the
current staged and unstaged changes are settled.

### Why This Push Exists

The live repo scan found little ordinary marker debt (`TODO`, `@ts-ignore`, and
`as any` are not the bottleneck). Velocity is being lost through concentrated
ownership surfaces:

- large files that mix several product responsibilities;
- broad hub imports from `landing.ts`, `replay.ts`, and `persistence.ts`;
- fragile hand-built test fixtures for core wire/model contracts;
- local public artifacts that can silently bloat web builds;
- scattered runtime configuration reads.

### Execution Order

1. **Restore a green baseline.** Resolve the current tree cleanup first, then
   start this push in a dedicated worktree. The first check should be the narrow
   failing checks from the cleanup, then root `npm run typecheck`.
2. **Add contract fixture builders.** Add shared test builders for
   `GameProjection`, `PlayerView`, `SnapshotRoom`, and `Room` in the packages
   that own those contracts. This reduces breakage when fields such as
   `gameSpecId`, region metadata, or seat state evolve.
   Initial server-side builders now live in `apps/server/src/test-builders.ts`
   and are used by payload and room-manager tests.
3. **Extract web shell helpers from `landing.ts`.** Move nav/footer/loading
   helpers into a shell module and game-row naming/formatting into a small game
   card/list module. This removes the homepage as a dependency hub for account,
   profile, static pages, and route modules.
   Initial extraction now lives in `apps/web/src/site-shell.ts` and
   `apps/web/src/game-display.ts`; account, profile, static pages, and dev lab
   routes import those modules directly instead of importing from `landing.ts`.
   Homepage replay showcase data and hero POV selection now live in
   `apps/web/src/landing-showcase.ts`, keeping static demo catalog changes out
   of the landing route orchestrator.
4. **Fix public-artifact build hygiene.** Keep dev bakeoff and pixel-lab assets
   from being copied into ordinary web builds unless explicitly opted in. Local
   `apps/web/public` artifacts should not make `apps/web/dist` hundreds of MB.
   Initial hygiene now disables Vite's raw public-dir copy and copies public
   assets through `apps/web/src/public-assets.ts`, excluding top-level bakeoff
   and pixel-lab artifact directories unless
   `MISTBOARD_INCLUDE_DEV_PUBLIC_ARTIFACTS=1` is set for a local build.
5. **Split `persistence.ts` by ownership.** Preserve a temporary barrel export
   while moving pool lifecycle, events, rooms, seat tokens, accounts, feedback,
   games, and ratings into focused modules.
   Initial extraction moved Postgres pool lifecycle into
   `apps/server/src/persistence-db.ts`; `persistence.ts` still re-exports the
   public lifecycle API while query ownership is split incrementally. The next
   slice moved room seat token persistence into
   `apps/server/src/persistence-seat-tokens.ts` behind the same facade. Room
   event loading, append, running-game lifecycle, stale-room cleanup, and debug
   artifact persistence now live in
   `apps/server/src/persistence-game-lifecycle.ts`. Completed-game summaries,
   game lists, watch/unlock queries, participant attribution, and game-end
   persistence now live in `apps/server/src/persistence-games.ts`. Account,
   profile, leaderboard, feedback, and site-stat queries now live in focused
   `persistence-*` modules, leaving `apps/server/src/persistence.ts` as a thin
   compatibility facade.
6. **Split `live-render.ts` incrementally.** Extract stable live-game UI domains:
   board adapter, controls, clocks, captures, Draft960 picker, move list, and
   status panels. Keep the orchestrator thin and keep tests green after each
   move. The first slice moved static room layout and `LiveRefs` query wiring
   into `apps/web/src/live-layout.ts`; the second moved replay-derived current
   view/projection helpers into `apps/web/src/live-view.ts`; the third moved
   status copy/tone decisions into `apps/web/src/live-status.ts`; the fourth
   moved board adapter helpers into `apps/web/src/live-board.ts`; the fifth
   moved replay controls and move-list rendering into
   `apps/web/src/live-move-list.ts`; the sixth moved clock rendering and timer
   refresh into `apps/web/src/live-clocks.ts`; the seventh moved capture rows
   into `apps/web/src/live-captures.ts`; the eighth moved abort/resign controls
   into `apps/web/src/live-game-controls.ts`; the ninth moved room action rows
   into `apps/web/src/live-room-actions.ts`; the tenth moved debug mini-board
   rendering into `apps/web/src/live-dev-views.ts`.
7. **Split `replay.ts` after live render.** Extract replay timing, header/meta,
   moves panel, board panes, engine-review dock, clocks, and annotation form.
   Initial extraction moved wall-clock loop timing helpers into
   `apps/web/src/replay-wall-clock.ts`; the next moved replay move-list panel
   UI into `apps/web/src/replay-moves-panel.ts`; the next moved replay
   header/metadata UI and label helpers into `apps/web/src/replay-meta.ts`;
   the next moved replay clock panel rendering into
   `apps/web/src/replay-clocks.ts`; the next moved replay board/pane adapters
   into `apps/web/src/replay-board.ts`; the next moved replay engine panel and
   analysis toggle UI into `apps/web/src/replay-engine-panels.ts`; the next
   moved replay annotation panel/form UI into
   `apps/web/src/replay-annotations.ts`.
8. **Continue server `index.ts` extraction.** Move static/page metadata,
   drain-admin handling, WebSocket handling, seat-session logic, and shutdown
   orchestration into focused modules. The first slice moved page-meta
   injection, article prerender fallback serving, game replay shells, and
   sitemap generation into `apps/server/src/server-static-pages.ts`, keeping
   `index.ts` focused on route selection and fallback behavior for those paths.
   The next slice moved admin drain deadline state, active-game counting,
   drain/cancel HTTP handling, rate limiting, and restart/cancel broadcasts into
   `apps/server/src/server-drain.ts`. Client WebSocket message parsing and the
   known-message allowlist now live in `apps/server/src/server-ws-messages.ts`
   with focused parser tests.
9. **Partition route CSS.** Start with parked/dev surfaces and route-specific
   sections, then move replay, leaderboard, account, and article CSS behind
   ownership boundaries. Initial extraction moved the engine bakeoff lab layout
   into `apps/web/src/bakeoff.css` and replay belief/annotation panel styles
   into `apps/web/src/replay-analysis.css`, reducing the global stylesheet by
   about 1,260 lines. The next slice moved account, profile, and leaderboard
   route styles into `apps/web/src/account-profile.css`, reducing the global
   stylesheet by another 635 lines. The next slice moved learn/tutorial route
   styles into `apps/web/src/learn.css`, reducing the global stylesheet by
   another 538 lines.
10. **Split learn route ownership.** Keep `apps/web/src/learn.ts` focused on
    route mounting, rendering, board, and interaction logic. Static module and
    chapter curriculum data now lives in `apps/web/src/learn-content.ts`, which
    removes about 975 lines of content from the route renderer.
11. **Centralize runtime config.** Add typed config modules for server, engine,
    and web feature flags so environment reads are discoverable and testable.
    Initial server startup/runtime defaults now live in
    `apps/server/src/server-config.ts`; `apps/server/src/index.ts` consumes the
    parsed config instead of reading `process.env` directly.

### Definition Of Done For The Second Push

- Contract test fixtures exist for core game/server/web payload shapes.
- `landing.ts` is no longer the shared site-shell import hub.
- Ordinary local web builds do not copy ignored bakeoff or pixel-lab artifacts
  by default.
- `persistence.ts` has been reduced to a barrel or thin facade, with domain
  modules owning SQL by area.
- `live-render.ts` and `replay.ts` each have clear domain modules and a smaller
  orchestration surface.
- `apps/server/src/index.ts` owns startup composition, not every WebSocket,
  static-page, drain, seat, and shutdown detail.
- Route/dev CSS has moved out of the single global stylesheet where practical;
  lab, replay-analysis, account, profile, leaderboard, and learn CSS have
  route-owned files.
- Learn curriculum data is separated from the route renderer so tutorial copy
  and chapter additions do not require loading the interaction-heavy page file.
- Runtime config reads are centralized enough that new flags have an obvious
  home.

### Guardrails

- Keep hidden-information invariants ahead of refactor aesthetics.
- Move code with focused regression tests; do not combine structural splits with
  product behavior changes unless unavoidable.
- Preserve public imports through temporary barrels when that lowers migration
  risk.
- Prefer many small commits with path-specific staging over one broad cleanup
  commit.
- Re-run the relevant narrow test after each extraction and a broader gate before
  handoff.

## Out Of Scope

- Private deploy runbooks or provider-account procedures.
- A broad process handbook.
- Replacing judgment for high-risk hidden-information changes.
- Adding social, moderation, rating, or matchmaking process before the product
  stage requires it.

## Related Existing Surfaces

- `npm run agent:scan` for live dirty-state, hotspot, and targeted-test
  orientation.
- `docs/agent-velocity.md` for current multi-session working rules.
- `docs/qa-checklist.md` for private-alpha gameplay QA.
- `docs/ROADMAP.md` for M1 evidence requirements.
- `scripts/release-local-smoke.mjs`, `scripts/prod-smoke.mjs`, and
  `scripts/prod-engine-smoke.mjs` for release and production health checks.

# Concurrent Claude sessions clobbering uncommitted work in a shared working tree

**Date:** 2026-05-23
**Status:** mitigated
**Severity:** sev3 (internal only — local uncommitted work churned; no user-visible or pipeline impact)

## What happened

Two Claude Code sessions were running against the same working tree
(`~/projects/mistboard`) at the same time:

- **Session A (this one):** implementing the lichess-style clock-arming + abort
  feature ("abort-and-disconnect"). Touched `packages/game/src/{clocks,events,types}.ts`,
  `apps/server/src/room-manager.ts`, `apps/web/src/live-render.ts`, and the
  corresponding test files.
- **Session B:** a "rename fog-of-war variant" change plus board-render work.
  Touched `apps/server/migrations/022_rename_fog_of_war_variant.sql` (new),
  `apps/server/src/payloads.ts(+test)`, `apps/web/src/{landing,web-utils,xiangqi-spike}.ts`,
  `packages/game/src/variants-xiangqi.ts`, `packages/board-render/src/interactive/*`.

Mid-implementation, Session A's **uncommitted test-file edits were silently
reverted** to a half-original/half-edited state (`events.test.ts` import block
back to original while fragments of rewrites remained). The most likely cause is
a bulk operation in Session B — a formatter write (Biome), a `git checkout`, or a
`git stash`/`pop` — that touched files outside its own change set. Both
`clocks.ts` and `events.test.ts` shared an identical mtime, pointing at a single
bulk write.

Session A's **source** edits survived; only the **test** edits were lost.

## Detection

Session A re-ran the server unit suite expecting 5 previously-fixed tests to pass.
They still failed identically. Investigation showed `grep -c armedClock` returning
0 in both test files Session A had edited, and `git status` listing many files
Session A never touched (migration 022, payloads, landing, board-render). The
session-start `git status` had listed none of those, proving they appeared
mid-session from another writer.

## Impact

- Session A lost ~30 min of test-file edits (recoverable — the source changes
  they validate are intact; the test edits can be re-applied).
- Risk (not realized): if either session had run `git add -A && git commit`, it
  would have bundled the other session's partial, uncompiling work into its
  commit. See the existing lesson on multi-session commit bundling.
- Migration-number collision: both sessions independently reached for `022_*`.

## Root cause

A git working tree is single-writer by design. Two agents editing it concurrently
have no coordination: file writes interleave, and any whole-tree operation
(formatter-on-save across the repo, `git checkout -- .`, stash) one session runs
will stomp the other's uncommitted changes. Disjoint file *sets* are not enough —
bulk operations ignore who "owns" a file.

## Mitigation / fix

Isolate concurrent sessions so they never share one working tree:

- Give each long-running session its own **git worktree** (`git worktree add`),
  or run via the Agent `isolation: "worktree"` mechanism, so each has a private
  working dir + branch and commits independently.
- When isolation isn't possible, keep sessions to **disjoint files** AND have each
  commit path-specifically and often (`git add <specific paths>`), never
  `git add -A`. Verify `git diff --cached --stat` before every commit.
- Never run repo-wide `checkout`/`stash`/format-write while another session is
  live.

This incident's resolution: Session A moved its work to an isolated worktree on a
dedicated branch, leaving Session B's changes untouched in the shared tree.

## Follow-ups

- [ ] Re-apply the lost test edits in the isolated worktree (Session A).
- [ ] Renumber the abort/abandonment migration to avoid the `022_*` collision.
- [ ] Consider a session-startup convention: long features get a worktree by
      default.

## Addendum — third session (board-render polish), added 2026-05-23

The "Session B" above actually conflates **two** concurrent sessions. Besides the
variant-rename work, a third session was doing a chessground board-rendering
polish pass (centralizing the edge-gap fix via a `mountBoard()` helper +
`.cg-snap`, finished-board ring, thumbnail/piece sharpness; touched
`packages/board-render/src/interactive/*` and `apps/web/src/styles.css`). It was
clobbered too, repeatedly. Three findings from that session that extend the
analysis above:

**1. The mechanism was a recurring `git reset --hard`, not a one-off bulk write.**
The root-cause section speculates "a formatter write, `git checkout`, or `git
stash`." The actual signature, captured live:

```
$ git reflog --date=iso
8f6d1f1 HEAD@{2026-05-23 13:40:53 -0700}: reset: moving to HEAD
8f6d1f1 HEAD@{2026-05-23 13:40:36 -0700}: reset: moving to HEAD
8f6d1f1 HEAD@{2026-05-23 13:40:18 -0700}: reset: moving to HEAD
... (every ~17s)
```

A steady cadence of `reset: moving to HEAD` means a session was running `git
reset --hard HEAD` (or equivalent) **on a loop** — likely an automated
inner-loop (`scripts/mobile-loop.mjs` / a `/loop`) that resets the tree between
iterations. This is worse than a stray bulk command: it wipes every other
session's uncommitted edits seconds after they're written, continuously. Add a
mitigation: **never run a tree-resetting loop in a shared working tree.**

**2. Victim-side detection signature.** From the clobbered session's view: an
`Edit` succeeds and an immediate re-read shows the new content, but a later
`grep`/`git diff` shows the file back at HEAD; "File has been modified since
read" errors on follow-up edits; harness "modified by user or linter" reminders
showing stale pre-edit snapshots. Diagnostic: `git reflog --date=iso` and look
for the reset cadence. (It is NOT a JS linter/Biome — those reorganize imports,
they don't restore deleted code — and the macOS "Biome" telemetry processes in
`ps` are a red herring.)

**3. Gitignored build outputs are collateral `reset --hard` does NOT restore.**
`packages/game/dist` is gitignored. The variant-rename session had rebuilt
`game` dist with a new `'aborted'` status; `reset --hard` reset the *source* but
left the *dist*. Consumers compiled against HEAD source then mismatched the stale
dist, producing (a) phantom `tsc` errors (`'aborted'` not assignable to the HEAD
status union in `live-render.ts`) and (b) a runtime crash — `ERR_KINGS` thrown
from chessops on `/articles`, because the stale `variants.js` routed king-less
demo positions through standard-chess validation. Fix: rebuild the package from
HEAD (`npm run -w @mistboard/game build`). So the impact wasn't purely "local
churn" — a stale gitignored dist can surface as a real (if local-only) runtime
crash and block typechecks for an innocent third session.

## Addendum — variant-rename session (the real "Session B"), added 2026-05-23

Writing from the variant-rename session itself (`fog-of-war` -> `dark-chess`
slug rename + DB migration). Two corrections and one new clobber vector.

**Attribution fix.** The original write-up lumped the xiangqi spike, web-utils,
and `landing.ts` work under "Session B (rename)." The rename session never
touched those — its footprint was: `packages/game/src/{types,variants,events,
notation}.ts`, `apps/server/src/{payloads,room-manager,index,persistence,
rating-buckets,game-export,engine-runner,...}.ts`, the migration, and the
matching tests. It committed path-specifically throughout (`fb0d1f8`, `016b8fd`,
`97dee22`) and never ran `git add -A`. The xiangqi/web-utils files were a
separate concurrent writer.

**New clobber vector: the pre-commit hook's own stash/pop, amplified by a
retry-commit loop.** `.githooks/pre-commit` (active via `core.hooksPath`) runs,
on every commit attempt:

```
git stash push --keep-index --include-untracked   # stashes ALL other sessions'
npm run typecheck --workspaces --if-present        #   unstaged + untracked work
# trap on EXIT: git stash pop
```

So a *single* commit already does a whole-tree stash/pop touching every other
session's uncommitted files — disjoint file sets do not protect you. The rename
session made this far worse: when its commit kept failing (another session's
in-progress `'aborted'` status WIP was breaking the tree-wide typecheck the hook
runs), it launched a **bounded retry-commit loop** (`git commit` every ~12s).
Each iteration fired the hook's stash-push/typecheck/stash-pop over the whole
tree. That ~15-17s bulk-write cadence is an independent match for the clobber
timing — separate from the `git reset --hard` loop the board-render addendum
captured. Two different automated loops were each stomping the shared tree.

Additional mitigations:

- **Never run a retry-commit loop in a shared tree.** The pre-commit hook
  stashes the whole tree on every attempt; looping it is a sustained clobber.
- If a commit is blocked by *another session's* unrelated WIP breaking the
  tree-wide typecheck, do not loop or `--no-verify`. Either (a) isolate to a
  worktree, or (b) wait for the tree to go green, then commit **once**.
- The hook typechecks the *whole* workspace, not just staged files, so it is
  only green when every concurrent session's WIP also compiles — a coupling that
  makes independent commits impossible during multi-session churn. This is the
  strongest argument for the worktree-per-session fix already recommended above.

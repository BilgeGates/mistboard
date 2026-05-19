# CI red on main from ws npm audit vulnerability

**Date:** 2026-05-18
**Status:** resolved
**Severity:** sev3 (internal only — CI pipeline red, no user-visible impact)

## What happened

After GHSA-58qx-3vcg-4xpx ("uninitialized memory disclosure") was published against `ws@8.0.0–8.20.0`, the next CI run on `main` began failing the `Audit production dependencies` step (`npm audit --omit=dev` exits 1 on any moderate-or-worse finding). The vulnerable package landed in our lockfile via `apps/server/src/package.json`'s declared range `"ws": "^8.18.0"`, which resolved to `8.20.0` — the top of the vulnerable range.

Every push to `main` between the advisory landing and this fix failed the same CI step, including:

- `9ab0105` engine: install psycopg in deployed lab env (2026-05-18 21:42 UTC)
- `c063538` web: landing reshape — single-POV hero board + live activity stats (2026-05-18 23:53 UTC)

The auto-issue-on-red-main hook from `ci_and_deploy_safeguards` added comments to GitHub issue #2 on each failure (the issue was originally opened for the stale-pool incident on 2026-05-15 and never closed; the new audit failures piled on).

### Root cause

Two layers stacked:

1. **Declared range allowed the vulnerable patch release.** `"ws": "^8.18.0"` in `apps/server/package.json` permits any 8.x release ≥ 8.18.0 < 9.0.0. When `ws@8.20.0` shipped and was later found vulnerable, the lockfile carried it forward — no manual action required to ingest the vulnerable version.
2. **Pre-push hook does not run `npm audit`.** The pre-push hook ([[ci_and_deploy_safeguards]]) runs a clean build + tests but no dependency audit. The audit failure was therefore invisible locally and was only surfaced by CI after push.

### Why dependabot didn't auto-fix in time

Dependabot opened PR #3 (`build(deps): bump ws from 8.20.0 to 8.20.1`) on 2026-05-18 22:22 UTC — but PR merge is a manual step, and the next push to `main` (the landing reshape, this session) arrived before that PR was merged.

## Detection

Owner-driven, during a session check on whether prod was up to date. `gh run list --branch main` showed two consecutive failures, and `gh run view --log-failed` named `npm audit` and the GHSA advisory.

## Impact

- `Audit production dependencies` CI job failed on every push to `main` between ~2026-05-18 21:42 UTC and ~2026-05-19 00:30 UTC.
- GitHub issue #2 (`ci-failure` label) accumulated additional comments.
- Pre-push hook on `main` (which runs build + tests but not audit) continued to pass, so the pipeline-red state did not block subsequent pushes from this repo.
- No user-visible impact — `ws` vulnerability is a server-side disclosure risk, not gameplay-breaking. Production was unaffected by the audit-step failure itself; the underlying vulnerability was present but not actively exploited.

## Fix

Bump `ws` past `8.20.0` (the advisory's first patched release in the 8.x line is `8.20.1`). Implementation: `npm audit fix` in repo root, which updates the lockfile entry without changing the declared range in `apps/server/package.json`. Verify `npm audit --omit=dev` exits 0 before commit.

## Learnings

See: `docs/learnings/2026-05-18-pre-push-hook-doesnt-run-npm-audit.md`.

Pre-commit / pre-push hooks enforce **code correctness** (build, tests, types) — they don't enforce **dependency hygiene** (audit, license, supply chain) unless those checks are explicitly added. A maintainer who treats a green pre-push as "ready to ship" will routinely push pipeline-red commits when a new advisory lands against a pinned-by-range dependency.

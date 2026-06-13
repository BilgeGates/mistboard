# CI red on main from esbuild npm audit — all deploys blocked

**Date:** 2026-06-13
**Status:** resolved
**Severity:** sev3 (internal — CI pipeline red, deploys blocked; no user-visible impact)

## What happened

While soft-launching correspondence (flipping the prod feature flags on the `web`
service), the deploy never landed. The cause was the `Audit production
dependencies` CI step (`npm audit --omit=dev`) failing on `main`: 4 high-severity
esbuild advisories (GHSA-gv7w-rqvm-qjhr, GHSA-g7r4-m6w7-qqqr), freshly published
against `esbuild 0.17.0–0.28.0`. Because `web` waits for green CI before
deploying, the red audit step blocked **every** deploy — the correspondence
flag-flip and a concurrent session's variant-rules commits alike.

The flag-flip itself was correct; it was simply queued behind the red CI.

## Root cause

1. **Build tooling miscategorized as a production dependency.** `apps/web/package.json`
   listed `vite` (plus `typescript`, `@vitejs/plugin-react`) under `dependencies`,
   not `devDependencies`. That pulled vite's transitive `esbuild` into the
   production dependency tree, so `npm audit --omit=dev` (prod deps only) saw it.
   Every other workspace already keeps `typescript` in `devDependencies`. When the
   esbuild advisories published, the audit went red for every commit on main —
   unrelated to any code change.
2. **Same class as `2026-05-18-ci-npm-audit-ws-vuln`:** a freshly-published advisory
   against a range-pinned dep red-lines CI with no action on our part, and the
   pre-push hook doesn't run `npm audit`, so it's invisible locally.

Compounding it: the failure was diagnosed **late**. ~17 minutes were spent polling
the deploy *output* (prod bundle hash + correspondence server flag) — which looks
identical whether a deploy is slow-building or blocked — before checking the deploy
*gate* (`gh run list` immediately showed the red CI). See the learning.

## Detection

Owner noticed CI still failing during the launch. `gh run list --branch main` +
`gh run view <id> --log-failed` named the `Audit` job and the esbuild advisories.

## Impact

- All `web` deploys blocked from when the advisory landed until the fix
  (~06:40–09:00 UTC 2026-06-13), affecting two concurrent sessions' work.
- No user-visible impact — the esbuild advisories are build/dev-tool only
  (Deno-module install RCE via `NPM_CONFIG_REGISTRY`; dev-server file read on
  Windows); neither reaches the deployed runtime. Prod kept serving the prior build.

## Fix

Move `vite`, `@vitejs/plugin-react`, and `typescript` from `apps/web`'s
`dependencies` to `devDependencies` (commit `3cc59c7`). The production audit tree
no longer contains esbuild (`npm audit --omit=dev` → 0 vulnerabilities), and the
build is unaffected because the build installs devDependencies (proven by every
other workspace's `tsc` build). The real esbuild version bump (via a later vite
update) can follow on its own schedule — it's a dev-tool advisory, not a prod risk.

**Recovery snag — skipped deploy.** Even after CI went green, the queued deploy
stayed **skipped** (the Railway "Wait for CI" deadlock noted in CLAUDE.md), and
auto-deploy-on-push of the green commit didn't re-fire either. A no-op cachebust
bump in `railpack.json` + push forced a fresh deploy that landed (commit
`9e60e8d`); a dashboard Redeploy is the other unblock. NB: the Railway CLI was
linked to an unrelated long-running service, so a CLI `redeploy` would have hit
the wrong target — run `railway status` before any CLI redeploy.

## Learnings

See `docs/learnings/2026-06-13-diagnose-the-deploy-gate-before-the-output.md`.

A blocked or skipped deploy is indistinguishable from a slow build when you only
watch the served artifact. When a deploy or flag flip doesn't take effect, check
the **gate** first (`gh run list --branch main` for CI; the platform's deployment
status) before polling the output. And keep build tooling in `devDependencies` so
it never enters the prod-audit tree.

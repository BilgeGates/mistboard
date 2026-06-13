# Diagnose the deploy gate before the deploy output

**Date:** 2026-06-13
**From:** `2026-06-13-esbuild-audit-blocked-all-deploys`

## The lesson

When a deploy or a prod flag flip doesn't take effect, the symptom — the served
artifact is unchanged (old bundle, old behavior, flag still off) — is **identical**
whether the build is slow, the deploy was skipped, or the deploy is blocked behind
a red CI gate. Polling the output (bundle hash, health endpoint, feature-flag
probe) cannot distinguish these, so it burns time and hides the real cause.

Check the **gate** first:

- **CI status:** `gh run list --branch main` (then `gh run view <id> --log-failed`).
  A red gating workflow blocks deploys when the service is set to wait for CI.
  Mind which workflow gates: a red `Dependabot Updates` run is *not* the gating
  `CI` workflow.
- **Deploy status:** the platform's deployment list (Railway dashboard, or the MCP
  if authed) — Building / Skipped / Failed / Crashed / Success.

Only once the gate is green does polling the output make sense.

## What it cost

~17 minutes polling the prod bundle hash + the correspondence server flag during a
launch, assuming "still building," while a red CI audit step (a fresh esbuild
advisory) had blocked the deploy entirely. The CLAUDE.md deploy section even warns
about the Railway "Wait for CI" skip — checking CI first would have surfaced it
immediately.

## How to apply

On "the deploy didn't land / the flag isn't live," before polling the output or
re-pushing: run `gh run list --branch main` and check the deployment status.
Distinguish the cause, because each has a different fix:

- **gate red** → fix CI (the failing job), then it deploys.
- **deploy skipped** (green CI, no deploy) → a cachebust push or a dashboard
  Redeploy nudges it.
- **build failed** → read the build log.

# Pre-push hooks cover code correctness, not dependency hygiene

**Date:** 2026-05-18
**Related incident:** `incidents/2026-05-18-ci-npm-audit-ws-vuln.md`

## The gap

The pre-push hook on `main` (from [[ci_and_deploy_safeguards]]) runs a clean build + tests before allowing the push. It does **not** run `npm audit`, `npm outdated`, license checks, lockfile-drift checks, or any other supply-chain validation.

This means:
- A maintainer can have a green pre-push and still push a commit that fails CI's audit step.
- New vulnerability advisories against existing dependencies — discovered between two of your own pushes — turn the next push red even though the maintainer changed no dependency code.
- Dependabot PRs that bump the vulnerable dependency are a parallel, manually-merged process. They don't auto-merge ahead of the next maintainer push.

The result is a recurring class of "I pushed nothing dependency-related and CI is red" surprises.

## What this caught

`ws@8.20.0` was the top of a permissive `^8.18.0` range in `apps/server/package.json`. The GHSA-58qx-3vcg-4xpx advisory landed against `ws@8.0.0–8.20.0`. CI's `Audit production dependencies` step (`npm audit --omit=dev`) began exiting 1, failing every push to `main` for ~30 hours. The pre-push hook saw build + tests green on each attempt and let the push through.

## The rule

**Pre-push enforces code correctness. CI enforces everything else.** Adding a check to one does not add it to the other. If the goal is "I never push when CI will be red," the pre-push hook needs to mirror every step CI runs — including audit, lint, format, license, etc.

The corollary: **a green pre-push is not a promise that CI will be green.** It is a promise that the build compiles and tests pass on your machine. Anything outside that scope — dependency state, environment state, secret state — can still fail in CI.

## What to watch for

- New CI checks added (lint, format, audit, contract tests, etc.) need to either be added to the pre-push hook or be explicitly accepted as "CI-only, not gated locally."
- Dependency-range declarations like `^X.Y.Z` carry an open obligation: the next vulnerable patch release in that range will turn CI red without warning.
- When CI goes red on a push that touched no dependency code, suspect a new advisory before suspecting your own changes.

## Open question (not resolved by this incident)

Should `npm audit --omit=dev` be added to the pre-push hook?

- **For:** prevents the recurring "I pushed nothing dependency-related and CI is red" pattern.
- **Against:** adds ~500ms + a network round-trip to every push; surfaces noise on transient advisory state; doesn't fix the underlying advisory faster than dependabot would.

The current posture is: rely on dependabot + CI for dependency hygiene; accept that some pushes will be red until the next dependabot PR merges. This learning documents the gap; the policy decision is separate.

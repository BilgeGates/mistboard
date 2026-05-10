# 2026-05-09 - Postgres CI deploy blocker

## Summary

A UI/theme change reached `main`, but production did not immediately serve it.
The deployment was blocked by the `node` CI job, and later redeploy attempts were
confusing because the hosting provider reported skipped or no-op deployments for
commits that did not change watched application paths.

The root cause was not the UI change itself. The server test suite was running
Postgres-backed tests concurrently against one shared test database. Those tests
truncate and rewrite shared tables, so parallel execution made CI nondeterministic
and eventually red.

## Impact

- `main` contained the display-theme and navigation changes, but production kept
  serving the older asset bundle.
- The failed CI check prevented the normal deploy path from clearing.
- Follow-up commits that only touched CI configuration did not automatically
  produce a fresh web deployment because the deploy provider treated them as
  outside the watched web application paths.
- Manual redeploy attempts were easy to misread: a successful redeploy status did
  not necessarily mean the latest source had been built if the provider reused the
  previous deploy source.

## Root Cause

The server package had two test modes:

```text
npm run test --workspace @mistboard/server
npm run test:persistent --workspace @mistboard/server
```

The default server test script ran compiled Node tests with high concurrency:

```text
node --test --test-concurrency=8 dist/*.test.js
```

That is reasonable for isolated tests, but the Postgres-backed tests all used
one `TEST_DATABASE_URL`. Several files exercised persistence behavior by
truncating and repopulating shared tables. When those files ran at the same time,
one test could delete or mutate rows while another test was asserting against
them.

The CI job was using the concurrent server test path while Postgres was enabled.
That meant persistence tests were running with shared database state and parallel
file execution.

## Why Deployment Stayed Blocked

The incident lasted longer than a normal red build because two separate systems
were giving different signals:

- GitHub Actions correctly reported that `main` was not green.
- The deploy provider showed skipped or no-op web deployments for some commits,
  because later fixes changed workflow files rather than watched web source.

After the CI script was fixed, the commit that fixed CI did not by itself require
a new web build. That was technically true from a path-filter perspective, but it
left production on the previous application bundle until a deploy was explicitly
started from the current `main` source.

The key operator lesson is that a green CI fix and a successful hosting status
are not the same thing as verifying the live HTML points at the expected current
asset bundle.

## Fix

Commit `f06f27d Run Postgres CI tests serially` changed the CI Postgres test step
to run the shared-database test suite through the serial persistent script:

```text
npm run test --workspace @mistboard/game
npm run test --workspace @mistboard/web
npm run test:persistent --workspace @mistboard/server
```

The server persistent script compiles the server and runs Node tests with:

```text
node --test --test-concurrency=1 dist/*.test.js
```

That keeps Postgres-backed tests deterministic without weakening game or web
test coverage.

After the fix:

- local game, web, and Postgres-backed server checks passed;
- GitHub Actions reported both `node` and `python-research` checks green;
- production was manually deployed from current `main`;
- the live healthcheck returned OK;
- the live HTML referenced the updated asset bundle containing the display theme
  controls.

## Learnings

- Tests that share one mutable database must either run serially or own isolated
  schemas/databases per test file.
- A test command can be safe in local no-DB mode and unsafe in CI when
  `TEST_DATABASE_URL` enables persistence coverage.
- Path-filtered deployment systems can skip the exact commit that fixes CI if
  the fix does not touch watched application paths.
- Deployment status needs an artifact-level check. Confirming the healthcheck is
  not enough when the incident is about stale frontend assets.
- Manual redeploys should identify whether they rebuild from the latest source
  or simply restart/reuse an earlier deployment.

## Guardrails

For future changes:

- Keep Postgres-backed tests on `test:persistent` unless each test file gets an
  isolated database or schema.
- When touching CI, deployment configuration, persistence tests, or shared test
  database setup, verify both the GitHub check result and the live application
  artifact after deploy.
- For frontend deploy incidents, compare the live HTML asset filenames before
  and after deployment.
- If a provider reports "skipped" or "no deployment needed" after a CI-only fix,
  start a deployment from the current source rather than assuming the previous
  deploy now represents `main`.
- Avoid adding table truncation or global fixture resets to parallel DB tests
  unless the test runner also provides database isolation.

## Follow-Up Options

- Introduce per-test-file database schemas so Postgres-backed tests can safely
  regain parallelism later.
- Add a small production smoke check that records the current commit or build id
  in the served frontend artifact.
- Document the expected relationship between branch protection, CI checks, and
  deployment path filters in a contributor-safe operations note.

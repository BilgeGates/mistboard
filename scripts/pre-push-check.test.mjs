/**
 * Gate-classifier pins for the pre-push planner, driven through the script's
 * own `--plan --files` mode so the tests exercise exactly what the hook runs.
 * The docs gate skips CI-equivalent checks, so a file that DOES trigger the
 * hosted CI path filters (apps/**, packages/**, scripts/**) must never land in
 * it, markdown or not.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const script = join(scriptsDir, 'pre-push-check.mjs');
const hook = join(scriptsDir, '..', '.githooks', 'pre-push');

function plan(files) {
  return execFileSync(process.execPath, [script, '--plan', '--files', ...files], {
    cwd: join(scriptsDir, '..'),
    encoding: 'utf8',
  });
}

test('markdown outside CI-watched trees takes the docs gate', () => {
  const output = plan(['docs/persistence.md', 'README.md', 'INDEX.md']);
  assert.match(output, /pre-push: docs gate/);
});

test('markdown under apps/ is not docs-only (CI path filters run for apps/**)', () => {
  const output = plan(['apps/web/src/learn-xiangqi/AUTHORING.md']);
  assert.match(output, /pre-push: targeted gate/);
});

test('markdown under packages/ is not docs-only', () => {
  const output = plan(['packages/game/README.md']);
  assert.match(output, /pre-push: broad gate/);
});

test('targeted gate runs drift, lint, and i18n:check before verify', () => {
  const output = plan(['apps/web/src/main.ts']);
  assert.match(output, /pre-push: targeted gate/);
  const drift = output.indexOf('npm run check:drift');
  const lint = output.indexOf('npm run lint');
  const i18n = output.indexOf('npm run i18n:check');
  const verify = output.indexOf('npm run verify');
  assert.ok(drift >= 0 && lint > drift && i18n > lint && verify > i18n, output);
});

test('broad gate defers to ci:quick (which runs check:drift first)', () => {
  const output = plan(['scripts/build.mjs']);
  assert.match(output, /pre-push: broad gate/);
  assert.match(output, /npm run ci:quick/);
});

test('unwatched files still get the drift check', () => {
  const output = plan(['.gitignore']);
  assert.match(output, /pre-push: unmapped gate/);
  assert.match(output, /npm run check:drift/);
});

test('the git hook blocks direct pushes to main in favor of the release path', () => {
  const env = { ...process.env };
  delete env.MISTBOARD_RELEASE_PUSH;
  delete env.SKIP_PREPUSH;
  const result = spawnSync(hook, ['origin', 'unused'], {
    cwd: join(scriptsDir, '..'),
    encoding: 'utf8',
    env,
    input: `refs/heads/main ${'1'.repeat(40)} refs/heads/main ${'2'.repeat(40)}\n`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /direct pushes to main are disabled/);
  assert.match(result.stdout, /npm run release:prod -- --push/);
  assert.match(result.stdout, /SKIP_PREPUSH=1/);
});

test('SKIP_PREPUSH=1 is an escape hatch past the direct-push block', () => {
  const env = { ...process.env };
  delete env.MISTBOARD_RELEASE_PUSH;
  env.SKIP_PREPUSH = '1';
  const result = spawnSync(hook, ['origin', 'unused'], {
    cwd: join(scriptsDir, '..'),
    encoding: 'utf8',
    env,
    input: `refs/heads/main ${'1'.repeat(40)} refs/heads/main ${'2'.repeat(40)}\n`,
  });
  // The bypass skips the "disabled" block and hands off to the path-aware gate
  // (which then runs against the given refs); it must not print the block.
  assert.doesNotMatch(result.stdout, /direct pushes to main are disabled/);
});

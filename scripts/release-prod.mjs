#!/usr/bin/env node
// Push a production release only through the safe CI -> deploy -> smoke order.

import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const DEFAULT_BASE_URL = 'https://mistboard.com';
const DEFAULT_CI_WORKFLOW = 'ci.yml';
const DEFAULT_REMOTE = 'origin';
const DEFAULT_SMOKE = 'full';
const DEFAULT_TARGET_BRANCH = 'main';
const DEFAULT_TIMEOUT_MS = 900_000;
const GITHUB_POLL_MS = 10_000;
const VALID_SMOKE_TIERS = new Set(['full', 'web', 'lite', 'none']);

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

const startedAt = performance.now();
const release = {
  deployRequired: false,
  headRevision: null,
  planReason: null,
  productionRevision: null,
};

try {
  ensureCleanWorktree();
  release.headRevision = git(['rev-parse', '--verify', options.head]);

  console.log(`# production release`);
  console.log(`head: ${release.headRevision}`);
  console.log(`target: ${options.remote}/${options.targetBranch}`);
  console.log(`push: ${options.push ? 'yes' : 'no'}`);
  console.log(`smoke: ${options.smoke}`);

  const plan = runPlan({ headRevision: release.headRevision });
  release.deployRequired = plan.deployRequired;
  release.planReason = plan.reason;
  release.productionRevision = plan.productionRevision;

  if (options.localCi) {
    runTimed('local ci:quick', ['npm', 'run', 'ci:quick']);
  } else {
    console.log('skip: local ci:quick (--skip-local-ci)');
  }

  if (options.push) {
    runTimed('git push release head', [
      'git',
      'push',
      options.remote,
      `${release.headRevision}:refs/heads/${options.targetBranch}`,
    ]);
  } else {
    console.log('skip: git push (pass --push to publish the current commit)');
  }

  if (release.deployRequired && options.ciWait) {
    await waitForGithubCi({ headRevision: release.headRevision });
  } else if (!release.deployRequired) {
    console.log(`skip: hosted CI wait (${release.planReason})`);
  } else {
    console.log('skip: hosted CI wait (--skip-ci-wait)');
  }

  if (release.deployRequired) {
    runTimed('production revision wait', prodWaitCommand(release.headRevision));
  } else {
    console.log(
      `skip: exact revision wait; production is not expected to serve ${release.headRevision.slice(
        0,
        12,
      )} (${release.planReason})`,
    );
  }

  runSmoke({ deployRequired: release.deployRequired, headRevision: release.headRevision });

  const elapsedMs = Math.round(performance.now() - startedAt);
  console.log(`release: ok in ${formatDuration(elapsedMs)}`);
} catch (error) {
  const elapsedMs = Math.round(performance.now() - startedAt);
  console.error(`release: failed after ${formatDuration(elapsedMs)}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseArgs(args) {
  const parsed = {
    baseUrl: null,
    ciWait: true,
    ciWorkflow: DEFAULT_CI_WORKFLOW,
    head: 'HEAD',
    help: false,
    localCi: true,
    push: false,
    remote: DEFAULT_REMOTE,
    smoke: DEFAULT_SMOKE,
    targetBranch: DEFAULT_TARGET_BRANCH,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--base') {
      parsed.baseUrl = requiredValue(args, ++index, arg);
    } else if (arg === '--ci-workflow') {
      parsed.ciWorkflow = requiredValue(args, ++index, arg);
    } else if (arg === '--head') {
      parsed.head = requiredValue(args, ++index, arg);
    } else if (arg === '--push') {
      parsed.push = true;
    } else if (arg === '--remote') {
      parsed.remote = requiredValue(args, ++index, arg);
    } else if (arg === '--skip-ci-wait') {
      parsed.ciWait = false;
    } else if (arg === '--skip-local-ci') {
      parsed.localCi = false;
    } else if (arg === '--smoke') {
      parsed.smoke = requiredValue(args, ++index, arg);
      if (!VALID_SMOKE_TIERS.has(parsed.smoke)) {
        throw new Error(`--smoke must be one of: ${Array.from(VALID_SMOKE_TIERS).join(', ')}`);
      }
    } else if (arg === '--target-branch') {
      parsed.targetBranch = requiredValue(args, ++index, arg);
    } else if (arg === '--timeout-ms') {
      parsed.timeoutMs = parsePositiveInteger(requiredValue(args, ++index, arg), arg);
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function ensureCleanWorktree() {
  const status = git(['status', '--porcelain']);
  if (status.trim() === '') return;
  throw new Error(
    ['release requires a clean worktree; commit or stash first.', 'Dirty paths:', status].join(
      '\n',
    ),
  );
}

function runPlan({ headRevision }) {
  const args = ['scripts/prod-smoke-plan.mjs', '--base-from-prod', '--head', headRevision];
  if (options.baseUrl) args.push('--base-url', options.baseUrl);
  const output = runCapture('production deploy plan', ['node', ...args]);
  const plan = parsePlan(output);

  console.log(output.trim());
  console.log('');
  return plan;
}

function parsePlan(output) {
  const fields = new Map();
  for (const line of output.split('\n')) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    fields.set(key, value);
  }

  const deployRequiredLine = output.match(/prod-smoke-plan: deploy_required=(true|false)/);
  if (!deployRequiredLine) {
    throw new Error('prod-smoke-plan output did not include deploy_required');
  }

  return {
    deployRequired: deployRequiredLine[1] === 'true',
    headRevision: fields.get('head_revision') ?? null,
    productionRevision: fields.get('production_revision') ?? null,
    reason: fields.get('reason') ?? 'unknown',
  };
}

async function waitForGithubCi({ headRevision }) {
  const deadline = Date.now() + options.timeoutMs;
  let run = null;
  let attempt = 0;

  console.log(`# hosted CI wait`);
  while (Date.now() <= deadline) {
    attempt += 1;
    const runs = listGithubRuns(headRevision);
    run = runs.find((candidate) => candidate.headSha === headRevision) ?? null;
    if (!run) {
      console.log(`attempt ${attempt}: waiting for ${options.ciWorkflow} run`);
    } else if (run.status !== 'completed') {
      console.log(`attempt ${attempt}: ${run.status} ${run.url ?? ''}`.trim());
    } else if (run.conclusion === 'success') {
      console.log(`hosted CI passed: ${run.url ?? run.databaseId ?? headRevision}`);
      return;
    } else {
      throw new Error(
        `hosted CI failed with conclusion ${run.conclusion ?? 'unknown'}: ${
          run.url ?? run.databaseId ?? headRevision
        }`,
      );
    }

    if (Date.now() + GITHUB_POLL_MS > deadline) break;
    await sleep(GITHUB_POLL_MS);
  }

  throw new Error(
    `timed out waiting for ${options.ciWorkflow} on ${headRevision}; last run=${
      run ? `${run.status}/${run.conclusion ?? 'none'} ${run.url ?? ''}` : 'not found'
    }`,
  );
}

function listGithubRuns(headRevision) {
  const args = [
    'run',
    'list',
    '--workflow',
    options.ciWorkflow,
    '--branch',
    options.targetBranch,
    '--commit',
    headRevision,
    '--event',
    'push',
    '--json',
    'databaseId,status,conclusion,headSha,url',
    '--limit',
    '10',
  ];
  const output = runCapture('gh run list', ['gh', ...args], { quiet: true });
  try {
    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed;
  } catch (error) {
    throw new Error(`could not parse gh run list JSON: ${error.message}`);
  }
}

function prodWaitCommand(headRevision) {
  const command = [
    'npm',
    'run',
    'prod:wait-revision',
    '--',
    '--expect-revision',
    headRevision,
    '--timeout-ms',
    String(options.timeoutMs),
  ];
  if (options.baseUrl) command.push('--base', options.baseUrl);
  return command;
}

function runSmoke({ deployRequired, headRevision }) {
  if (options.smoke === 'none') {
    console.log('skip: prod smoke (--smoke none)');
    return;
  }

  if (options.smoke === 'lite') {
    runTimed('prod lite smoke', npmCommand('prod:smoke:lite', baseArgs()));
    return;
  }

  const revisionArgs = deployRequired ? ['--expect-revision', headRevision] : [];
  if (options.smoke === 'web' || options.smoke === 'full') {
    runTimed('prod web smoke', npmCommand('prod:smoke', [...baseArgs(), ...revisionArgs]));
  }

  if (options.smoke === 'full') {
    runTimed('prod engine smoke', npmCommand('prod:smoke:engines', baseArgs()));
  }
}

function baseArgs() {
  return options.baseUrl ? ['--base', options.baseUrl] : [];
}

function npmCommand(script, args = []) {
  if (args.length === 0) return ['npm', 'run', script];
  return ['npm', 'run', script, '--', ...args];
}

function runTimed(label, command) {
  run(['node', 'scripts/time-command.mjs', '--label', label, '--', ...command]);
}

function run(command) {
  console.log(`\n$ ${quoteCommand(command)}`);
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command[0]} exited with signal ${result.signal}`);
  if (result.status !== 0) throw new Error(`${command[0]} exited with ${result.status}`);
}

function runCapture(label, command, { quiet = false } = {}) {
  if (!quiet) console.log(`\n$ ${quoteCommand(command)}`);
  const result = spawnSync(command[0], command.slice(1), {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${label} exited with signal ${result.signal}`);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${label} failed with exit ${result.status}${detail ? `\n${detail}` : ''}`);
  }
  if (result.stderr && !quiet) process.stderr.write(result.stderr);
  return result.stdout;
}

function git(args) {
  return runCapture('git', ['git', ...args], { quiet: true }).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function quoteCommand(command) {
  return command.map((part) => (part.includes(' ') ? JSON.stringify(part) : part)).join(' ');
}

function formatDuration(ms) {
  if (ms < 1_000) return `${ms}ms`;
  const seconds = ms / 1_000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  npm run release:prod -- --push
  npm run release:prod -- --push --smoke lite
  npm run release:prod -- --skip-local-ci --smoke web

Order:
  local ci:quick -> optional git push -> hosted GitHub CI -> production revision wait -> smoke

Options:
  --push                   Push --head to origin/main. Without this, assume it is already pushed.
  --head <ref>             Commit/ref to release, default HEAD.
  --target-branch <name>   Production branch to push/wait, default ${DEFAULT_TARGET_BRANCH}.
  --remote <name>          Git remote for --push, default ${DEFAULT_REMOTE}.
  --smoke <tier>           Smoke tier: full, web, lite, none. Default ${DEFAULT_SMOKE}.
  --skip-local-ci          Do not run npm run ci:quick before push.
  --skip-ci-wait           Do not wait for hosted GitHub CI.
  --ci-workflow <file>     GitHub CI workflow to wait for, default ${DEFAULT_CI_WORKFLOW}.
  --base <url>             Production base URL, default ${DEFAULT_BASE_URL}.
  --timeout-ms <ms>        Timeout for hosted CI and revision wait, default ${DEFAULT_TIMEOUT_MS}.

Use --push instead of a standalone git push when you want this command to own
the release order. For docs-only or other non-deploy commits, the planner skips
the exact-revision wait because production is not expected to serve that SHA.`);
}

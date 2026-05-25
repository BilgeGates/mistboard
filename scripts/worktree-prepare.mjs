#!/usr/bin/env node
// Prepare a fresh task worktree for typecheck, tests, and commits.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

console.log('# worktree:prepare');

if (!options.noInstall && !existsSync('node_modules/.bin/tsc')) {
  const install =
    options.installMode === 'online'
      ? ['npm', 'ci', '--ignore-scripts']
      : ['npm', 'ci', '--ignore-scripts', '--offline'];
  run(install, {
    failureNote:
      options.installMode === 'offline'
        ? 'offline install failed; retry with npm run worktree:prepare -- --install=online if network is available'
        : null,
  });
} else if (options.noInstall) {
  console.log('skip: dependency install disabled by --no-install');
} else {
  console.log('deps: ok');
}

if (!options.skipBuild) {
  run(['npm', 'run', 'build', '--workspace', '@mistboard/game']);
  run(['npm', 'run', 'build', '--workspace', '@mistboard/board-render']);
} else {
  console.log('skip: declaration builds disabled by --skip-build');
}

if (!options.skipDrift) {
  run(['npm', 'run', 'check:drift']);
} else {
  console.log('skip: drift check disabled by --skip-drift');
}

console.log('\nprepared worktree');
console.log('next: npm run verify -- --changed --plan');
console.log('next: npm run ci:quick when the change crosses package boundaries');

function parseArgs(args) {
  const parsed = {
    help: false,
    installMode: 'offline',
    noInstall: false,
    skipBuild: false,
    skipDrift: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--install') {
      parsed.installMode = requiredValue(args, ++index, arg);
    } else if (arg.startsWith('--install=')) {
      parsed.installMode = arg.slice('--install='.length);
    } else if (arg === '--no-install') {
      parsed.noInstall = true;
    } else if (arg === '--skip-build') {
      parsed.skipBuild = true;
    } else if (arg === '--skip-drift') {
      parsed.skipDrift = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!['offline', 'online'].includes(parsed.installMode)) {
    throw new Error('--install must be offline or online');
  }

  return parsed;
}

function run(command, { failureNote = null } = {}) {
  console.log(`\n$ ${command.join(' ')}`);
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`${command[0]} exited with signal ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    if (failureNote) console.error(failureNote);
    process.exit(result.status ?? 1);
  }
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage:
  npm run worktree:prepare
  npm run worktree:prepare -- --no-install
  npm run worktree:prepare -- --install=online

Prepares a fresh task worktree by installing dependencies when missing, building
the local package declarations that downstream workspaces read from dist/, and
running npm run check:drift.

Options:
  --install offline|online  Install mode when node_modules is missing; default offline
  --no-install              Do not install dependencies
  --skip-build              Do not build @mistboard/game or @mistboard/board-render
  --skip-drift              Do not run npm run check:drift`);
}

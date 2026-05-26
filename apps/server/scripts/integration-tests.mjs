#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const optionValueFlags = new Set([
  '--test-name-pattern',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-shard',
  '--test-skip-pattern',
  '--test-timeout',
]);

const parsed = parseArgs(process.argv.slice(2));
const candidateFiles = parsed.files.length > 0 ? parsed.files : integrationTestFiles();
const files =
  parsed.files.length > 0 || !parsed.testNamePattern
    ? candidateFiles
    : filesMatchingTestNamePattern(candidateFiles, parsed.testNamePattern);
const args = ['--test', '--test-concurrency=1', ...parsed.testArgs, ...files];

if (files.length === 0) {
  console.error(`no integration files matched --test-name-pattern=${parsed.testNamePattern}`);
  process.exit(1);
}

console.log(`$ tsx ${args.join(' ')}`);

const result = spawnSync('tsx', args, {
  env: {
    ...process.env,
    MISTBOARD_PVE_ENGINE_DELAY_MS: process.env.MISTBOARD_PVE_ENGINE_DELAY_MS ?? '0',
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.signal) {
  console.error(`tsx exited with signal ${result.signal}`);
  process.exit(1);
}
process.exit(result.status ?? 0);

function parseArgs(args) {
  const testArgs = [];
  const files = [];
  let testNamePattern = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (looksLikeFileArg(arg)) {
      files.push(arg);
      continue;
    }

    if (!arg.startsWith('-')) {
      throw new Error(
        `unexpected bare argument "${arg}". Pass a file path such as integration/drain.test.ts, or use --test-name-pattern=${arg}`,
      );
    }

    testArgs.push(arg);
    if (arg.startsWith('--test-name-pattern=')) {
      testNamePattern = arg.slice('--test-name-pattern='.length);
    }
    if (optionValueFlags.has(arg)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      testArgs.push(value);
      if (arg === '--test-name-pattern') testNamePattern = value;
      index += 1;
    }
  }

  return { files, testArgs, testNamePattern };
}

function looksLikeFileArg(arg) {
  return (
    arg.includes('/') ||
    arg.includes('\\') ||
    arg.includes('*') ||
    arg.endsWith('.js') ||
    arg.endsWith('.mjs') ||
    arg.endsWith('.ts')
  );
}

function integrationTestFiles() {
  return readdirSync('integration')
    .filter((file) => file.endsWith('.test.ts'))
    .sort()
    .map((file) => join('integration', file));
}

function filesMatchingTestNamePattern(files, pattern) {
  const matcher = testNameMatcher(pattern);
  return files.filter((file) => matcher(readFileSync(file, 'utf8')));
}

function testNameMatcher(pattern) {
  const anchoredLiteral = pattern.replace(/^\^/, '').replace(/\$$/, '').replaceAll('\\', '');
  try {
    const regex = new RegExp(pattern);
    return (source) => regex.test(source) || source.includes(anchoredLiteral);
  } catch {
    return (source) => source.includes(pattern);
  }
}

function printHelp() {
  console.log(`Usage:
  npm run test:integration --workspace @mistboard/server
  npm run test:integration --workspace @mistboard/server -- --test-name-pattern=drain
  npm run test:integration --workspace @mistboard/server -- integration/drain.test.ts

Forwarded --test-* flags are passed to Node's test runner before integration
files, so name filters actually prevent unrelated integration tests from
running. File paths limit the run to those files.`);
}

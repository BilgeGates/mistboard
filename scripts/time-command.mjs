#!/usr/bin/env node
// Run a command and print a concise duration summary.

import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}
if (options.command.length === 0) {
  throw new Error('missing command after --');
}

const label = options.label ?? options.command.join(' ');
const startedAt = performance.now();
const startedIso = new Date().toISOString();

console.log(`# ${label}`);
console.log(`started_at: ${startedIso}`);
console.log(`$ ${quoteCommand(options.command)}`);

const child = spawn(options.command[0], options.command.slice(1), {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (error) => {
  const elapsedMs = Math.round(performance.now() - startedAt);
  writeSummary({ elapsedMs, label, status: 'failed', statusDetail: error.message });
  console.error(`${label}: failed after ${formatDuration(elapsedMs)}: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  const elapsedMs = Math.round(performance.now() - startedAt);
  const ok = code === 0 && !signal;
  const statusDetail = signal ? `signal ${signal}` : `exit ${code ?? 'unknown'}`;
  writeSummary({ elapsedMs, label, status: ok ? 'ok' : 'failed', statusDetail });
  console.log(`${label}: ${ok ? 'ok' : 'failed'} in ${formatDuration(elapsedMs)}`);
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

function parseArgs(args) {
  const parsed = {
    command: [],
    help: false,
    label: null,
    summary: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      parsed.command = args.slice(index + 1);
      break;
    }
    if (arg === '--label') {
      parsed.label = requiredValue(args, ++index, arg);
    } else if (arg === '--summary') {
      parsed.summary = requiredValue(args, ++index, arg);
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new Error(`unknown argument before --: ${arg}`);
    }
  }

  return parsed;
}

function writeSummary({ elapsedMs, label, status, statusDetail }) {
  const summaryPath = options.summary ?? process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  appendFileSync(
    summaryPath,
    [
      `### ${label}`,
      '',
      `- Status: **${status}** (${statusDetail})`,
      `- Duration: **${formatDuration(elapsedMs)}**`,
      `- Duration ms: \`${elapsedMs}\``,
      '',
    ].join('\n'),
  );
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

function printHelp() {
  console.log(`Usage:
  node scripts/time-command.mjs --label "Prod smoke" -- npm run prod:smoke

Options:
  --label <name>     Human-readable step label.
  --summary <path>   Markdown summary path. Defaults to GITHUB_STEP_SUMMARY.
`);
}

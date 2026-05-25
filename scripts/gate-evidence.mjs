#!/usr/bin/env node
// Public-safe evidence recorder for manual launch gates.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const gates = new Map([
  ['mobile-gameplay', 'Mobile live gameplay pass'],
  ['article-mobile', 'Article mobile layout pass'],
  ['empty-lobby-engine-fallback', 'Empty-lobby engine fallback'],
  ['og-scraper', 'Open Graph scraper sanity'],
  ['analytics', 'Analytics event verification'],
]);

const results = new Set(['pass', 'fail', 'blocked']);
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

validateOptions(options);
assertPublicSafe(options);

const evidence = buildEvidence(options);
if (options.dryRun) {
  console.log(`dry-run: would write ${evidence.relativePath}`);
  console.log(evidence.body);
  process.exit(0);
}

mkdirSync(path.dirname(evidence.absolutePath), { recursive: true });
writeFileSync(evidence.absolutePath, evidence.body, { flag: 'wx' });
console.log(`wrote ${evidence.relativePath}`);

function parseArgs(args) {
  const parsed = {
    command: null,
    dryRun: false,
    gate: null,
    help: false,
    notes: null,
    result: null,
    target: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--gate') parsed.gate = requiredValue(args, ++index, arg);
    else if (arg === '--result') parsed.result = requiredValue(args, ++index, arg);
    else if (arg === '--target') parsed.target = requiredValue(args, ++index, arg);
    else if (arg === '--command') parsed.command = requiredValue(args, ++index, arg);
    else if (arg === '--notes') parsed.notes = requiredValue(args, ++index, arg);
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function validateOptions(opts) {
  if (!opts.gate) throw new Error('--gate is required');
  if (!gates.has(opts.gate)) {
    throw new Error(`unknown gate: ${opts.gate}; expected one of ${[...gates.keys()].join(', ')}`);
  }
  if (!opts.result) throw new Error('--result is required');
  if (!results.has(opts.result)) {
    throw new Error(`unknown result: ${opts.result}; expected pass, fail, or blocked`);
  }
}

function assertPublicSafe(opts) {
  const values = [opts.gate, opts.result, opts.target, opts.command, opts.notes].filter(Boolean);
  const patterns = [
    /(?:authorization|cookie|password|secret|token|api[_-]?key|client_secret)\s*[:=]/i,
    /\bBearer\s+\S+/i,
    /\bseatToken=/i,
    /\bMISTBOARD_[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)\b/,
    /\.env(?:\.|\/|\s|$)/i,
    /\bdocs-private\//i,
    /\b(railway variables|vercel env pull|gh secret)\b/i,
  ];

  for (const value of values) {
    for (const pattern of patterns) {
      if (pattern.test(value)) {
        throw new Error('refusing to write evidence that looks secret-bearing or private');
      }
    }
  }
}

function buildEvidence(opts) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replaceAll(':', '');
  const gateTitle = gates.get(opts.gate);
  const filename = `${date}-${slugify(opts.gate)}-${time}.md`;
  const relativePath = path.posix.join('docs', 'gate-evidence', filename);
  const absolutePath = path.resolve(relativePath);
  const command = opts.command ?? 'not recorded';
  const notes = opts.notes ?? 'none';
  const target = opts.target ?? 'not recorded';
  const commit = gitValue(['rev-parse', '--short', 'HEAD']) ?? 'unknown';

  return {
    absolutePath,
    relativePath,
    body: `# Gate Evidence: ${gateTitle}

- Gate: \`${opts.gate}\`
- Result: \`${opts.result}\`
- Target: ${target}
- Recorded: ${now.toISOString()}
- Commit: \`${commit}\`
- Command: \`${command}\`
- Notes: ${notes}
`,
  };
}

function gitValue(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function printHelp() {
  console.log(`Usage:
  npm run gate:evidence -- --gate mobile-gameplay --result pass
  npm run gate:evidence -- --gate analytics --result blocked --target local-dev --notes "waiting on events"

Options:
  --gate       ${[...gates.keys()].join(', ')}
  --result     pass, fail, or blocked
  --target     environment or URL class checked; keep public-safe
  --command    exact command used when relevant
  --notes      short public-safe note
  --dry-run    print the evidence entry without writing it

Evidence files are written under docs/gate-evidence/ and must not include
cookies, tokens, provider secrets, private runbook paths, or .env details.`);
}

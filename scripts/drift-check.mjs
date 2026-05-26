#!/usr/bin/env node
// Narrow drift checks for docs, SQL enum constraints, and live fog payload guards.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

const checks = [
  ['docs', checkDocs],
  ['sql-enums', checkSqlEnums],
  ['payload-redaction', checkPayloadRedaction],
];

const selected = options.only ? checks.filter(([name]) => name === options.only) : checks;
if (selected.length === 0) throw new Error(`unknown check: ${options.only}`);

const results = selected.map(([name, check]) => ({ name, issues: check() }));
const issueCount = results.reduce((sum, result) => sum + result.issues.length, 0);

if (options.json) {
  console.log(JSON.stringify({ ok: issueCount === 0, results }, null, 2));
} else {
  for (const result of results) {
    if (result.issues.length === 0) {
      console.log(`${result.name}: ok`);
      continue;
    }
    console.log(`${result.name}: ${result.issues.length} issue(s)`);
    for (const issue of result.issues) console.log(`  - ${issue}`);
  }
}

process.exit(issueCount === 0 ? 0 : 1);

function parseArgs(args) {
  const parsed = { help: false, json: false, only: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') parsed.json = true;
    else if (arg === '--only') parsed.only = requiredValue(args, ++index, arg);
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

function checkDocs() {
  const issues = [];
  for (const file of publicMarkdownFiles()) {
    const text = stripHtmlComments(stripFencedBlocks(readFile(file)));
    for (const link of markdownLinks(text)) {
      const target = normalizeLinkTarget(link.raw);
      if (!target || shouldIgnoreLink(target)) continue;

      const cleanTarget = target.split(/[?#]/, 1)[0];
      const normalizedRepoTarget = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), cleanTarget),
      );

      if (target.includes('docs-private/') || normalizedRepoTarget.startsWith('docs-private/')) {
        issues.push(`${file} links to private notes: ${target}`);
        continue;
      }

      const resolved = path.resolve(path.dirname(file), cleanTarget);
      if (!isInsideRepo(resolved)) {
        issues.push(`${file} link escapes repo root: ${target}`);
        continue;
      }
      if (!pathExistsWithMarkdownFallback(resolved)) {
        issues.push(`${file} has missing link target: ${target}`);
      }
    }
  }
  return issues;
}

function publicMarkdownFiles() {
  return gitLines(['ls-files', '*.md', 'docs/**/*.md'])
    .filter((file) => file.endsWith('.md'))
    .filter((file) => file.startsWith('docs/') || !file.includes('/'))
    .filter((file) => !file.startsWith('docs-private/'));
}

function stripFencedBlocks(text) {
  return text.replace(/^```[\s\S]*?^```/gm, '');
}

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

function markdownLinks(text) {
  const links = [];
  const pattern = /!?\[[^\]\n]*\]\(([^)\n]+)\)/g;
  let match = pattern.exec(text);
  while (match) {
    links.push({ raw: match[1] });
    match = pattern.exec(text);
  }
  return links;
}

function normalizeLinkTarget(raw) {
  let target = raw.trim();
  if (!target) return null;
  if (target.startsWith('<')) {
    const end = target.indexOf('>');
    if (end === -1) return target.slice(1);
    return target.slice(1, end).trim();
  }
  target = target.split(/\s+/)[0];
  return target.replace(/^['"]|['"]$/g, '');
}

function shouldIgnoreLink(target) {
  return (
    target.startsWith('#') ||
    target.startsWith('/') ||
    target.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  );
}

function isInsideRepo(absolutePath) {
  const relative = path.relative(process.cwd(), absolutePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function pathExistsWithMarkdownFallback(absolutePath) {
  if (existsSync(absolutePath)) return true;
  if (!path.extname(absolutePath) && existsSync(`${absolutePath}.md`)) return true;
  if (existsSync(path.join(absolutePath, 'README.md'))) return true;
  if (existsSync(path.join(absolutePath, 'INDEX.md'))) return true;
  return false;
}

function checkSqlEnums() {
  const constraints = latestNamedConstraints();
  const comparisons = [
    {
      label: 'games.mode',
      constraint: 'games_mode_check',
      file: 'apps/server/src/persistence-game-lifecycle.ts',
      type: 'GameMode',
    },
    {
      label: 'games.result',
      constraint: 'games_result_check',
      file: 'apps/server/src/persistence.ts',
      type: 'GameResult',
    },
    {
      label: 'games.termination',
      constraint: 'games_termination_check',
      file: 'apps/server/src/persistence-game-lifecycle.ts',
      type: 'GameTermination',
    },
    {
      label: 'games.review_status',
      constraint: 'games_review_status_check',
      file: 'apps/server/src/persistence-game-lifecycle.ts',
      type: 'GameReviewStatus',
    },
    {
      label: 'games.visibility',
      constraint: 'games_visibility_check',
      file: 'apps/server/src/persistence-game-lifecycle.ts',
      type: 'GameVisibility',
    },
    {
      label: 'users.account_role',
      constraint: 'users_account_role_check',
      file: 'apps/server/src/persistence.ts',
      type: 'AccountRole',
    },
    {
      label: 'user_ratings.time_class',
      constraint: 'user_ratings_time_class_check',
      file: 'packages/game/src/time-controls.ts',
      type: 'TimeClass',
    },
  ];

  const issues = [];
  for (const comparison of comparisons) {
    const actual = constraints.get(comparison.constraint);
    if (!actual) {
      issues.push(`${comparison.label} is missing SQL constraint ${comparison.constraint}`);
      continue;
    }
    const expected = unionValues(comparison.file, comparison.type);
    const missingInSql = [...expected].filter((value) => !actual.has(value));
    const missingInType = [...actual].filter((value) => !expected.has(value));
    if (missingInSql.length > 0) {
      issues.push(`${comparison.label} SQL is missing: ${missingInSql.join(', ')}`);
    }
    if (missingInType.length > 0) {
      issues.push(`${comparison.label} TypeScript is missing: ${missingInType.join(', ')}`);
    }
  }
  return issues;
}

function latestNamedConstraints() {
  const constraints = new Map();
  for (const file of gitLines(['ls-files', 'apps/server/migrations/*.sql']).sort()) {
    const text = readFile(file);
    const pattern =
      /\bADD\s+CONSTRAINT\s+([a-z0-9_]+)\s+CHECK\s*\(([\s\S]*?)\)\s*(?=,?\s*(?:ADD\s+CONSTRAINT|;))/gi;
    let match = pattern.exec(text);
    while (match) {
      constraints.set(match[1], quotedValues(match[2]));
      match = pattern.exec(text);
    }
  }
  return constraints;
}

function unionValues(file, typeName) {
  const text = readFile(file);
  const pattern = new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*([\\s\\S]*?);`);
  const match = text.match(pattern);
  if (!match) throw new Error(`could not find exported type ${typeName} in ${file}`);
  return quotedValues(match[1]);
}

function quotedValues(text) {
  const values = new Set();
  const pattern = /'([^']+)'/g;
  let match = pattern.exec(text);
  while (match) {
    values.add(match[1]);
    match = pattern.exec(text);
  }
  return values;
}

function checkPayloadRedaction() {
  const file = 'apps/server/src/payloads.ts';
  const text = readFile(file);
  const issues = [];
  const requiredFragments = [
    [
      'snapshot payload filters events per recipient',
      'events: eventsForClient(normalized, client)',
    ],
    ['snapshot payload uses per-client PlayerView', 'state: getClientView(room, client)'],
    [
      'single event payload filters appended events',
      'filterEventForClient(normalized, client, event)',
    ],
    [
      'live fog view uses variant PlayerView',
      'variant.getPlayerView(room.projection.state, perspective)',
    ],
  ];

  for (const [label, fragment] of requiredFragments) {
    if (!text.includes(fragment)) issues.push(`${file} lost guard: ${label}`);
  }

  const forbiddenFragments = [
    ['snapshot state bypasses PlayerView', 'state: room.projection.state'],
    ['snapshot events bypass per-client filtering', 'events: room.events'],
  ];
  for (const [label, fragment] of forbiddenFragments) {
    if (text.includes(fragment)) issues.push(`${file} forbidden payload path: ${label}`);
  }

  return issues;
}

function readFile(file) {
  return readFileSync(file, 'utf8');
}

function gitLines(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function printHelp() {
  console.log(`Usage:
  npm run check:drift
  npm run check:drift -- --only docs
  npm run check:drift -- --json

Checks:
  docs                public Markdown links resolve and do not link to docs-private/
  sql-enums           selected SQL check constraints match TypeScript unions
  payload-redaction   live snapshot/event payloads still use PlayerView filters`);
}

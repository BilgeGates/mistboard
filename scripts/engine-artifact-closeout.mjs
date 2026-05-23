import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));
const manifestUrl = args.manifest ?? args.m;

if (!manifestUrl) {
  console.error(
    'usage: node scripts/engine-artifact-closeout.mjs --manifest /bakeoff-vX/manifest.json [--baseUrl http://127.0.0.1:3000] [--source apps/web/public/bakeoff-vX]',
  );
  process.exit(2);
}

if (!manifestUrl.startsWith('/')) {
  throw new Error(`manifest must be a public URL path: ${manifestUrl}`);
}

const runName = safeName(path.basename(path.dirname(manifestUrl)));
const baseUrl = args.baseUrl ?? process.env.MISTBOARD_WEB_URL ?? 'http://127.0.0.1:3000';
const captureOut = args.out ?? path.join('docs-private', 'engine-track', 'captures', runName);
const auditOut = args.auditOut ?? path.join('docs-private', 'engine-track', 'artifact-audit.md');
const archiveRoot =
  args.archiveRoot ?? path.join('docs-private', 'engine-track', 'artifact-archives');
const source = args.source ?? inferSource(manifestUrl);
const publicRoots = parseListArg(args.publicRoots ?? `apps/web/public,${archiveRoot}`);

console.log(`engine artifact closeout: ${manifestUrl}`);
console.log(`capture base URL: ${baseUrl}`);
console.log(`capture output: ${captureOut}`);

await assertServerReachable(baseUrl);

await run(process.execPath, [
  'scripts/capture-belief-artifacts.mjs',
  '--manifest',
  manifestUrl,
  '--baseUrl',
  baseUrl,
  '--out',
  captureOut,
  '--limit',
  args.limit ?? '100',
]);

if (args.archive !== 'false' && source && (await exists(path.resolve(repoRoot, source)))) {
  const archivePath = path.resolve(repoRoot, archiveRoot, safeName(path.basename(source)));
  if (await exists(archivePath)) {
    console.log(`archive already exists, keeping existing copy: ${relative(archivePath)}`);
  } else {
    await run(process.execPath, [
      'scripts/archive-engine-artifact.mjs',
      '--source',
      source,
      '--archiveRoot',
      archiveRoot,
      '--note',
      args.note ?? `engine artifact closeout for ${manifestUrl}`,
    ]);
  }
} else if (args.archive !== 'false') {
  console.log(`raw artifact source not found, archive skipped: ${source}`);
}

await run(process.execPath, [
  'scripts/engine-artifact-audit.mjs',
  '--publicRoots',
  publicRoots.join(','),
  '--captures',
  'docs-private/engine-track/captures',
  '--out',
  auditOut,
]);

console.log(`closeout complete: ${auditOut}`);

async function assertServerReachable(rawUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(rawUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `capture server is not reachable at ${rawUrl}; start the web app before running artifact closeout (${error.message})`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function inferSource(url) {
  const runDir = path.dirname(url).replace(/^\/+/, '');
  return path.join('apps', 'web', 'public', runDir);
}

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!value.startsWith('--')) continue;
    const [key, inline] = value.slice(2).split('=');
    parsed[key] = inline ?? values[i + 1] ?? 'true';
    if (inline === undefined) i += 1;
  }
  return parsed;
}

function parseListArg(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function run(command, commandArgs) {
  console.log(`$ ${[command, ...commandArgs].join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`command failed with exit code ${code}: ${command}`));
      }
    });
  });
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function safeName(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function relative(file) {
  const rel = path.relative(repoRoot, file);
  return rel.startsWith('..') ? file : rel;
}

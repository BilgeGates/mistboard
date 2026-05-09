import { cp, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));
const sourceArg = args.source ?? args.src ?? args._?.[0];

if (!sourceArg) {
  console.error(
    'usage: node scripts/archive-engine-artifact.mjs --source apps/web/public/bakeoff-vX [--name bakeoff-vX] [--note "..."] [--force]',
  );
  process.exit(2);
}

const sourcePath = path.resolve(repoRoot, sourceArg);
const sourceRealPath = await realpath(sourcePath);
const sourceStat = await stat(sourceRealPath);
if (!sourceStat.isDirectory()) {
  throw new Error(`source is not a directory: ${sourcePath}`);
}

const archiveRoot = path.resolve(
  repoRoot,
  args.out ?? args.archiveRoot ?? 'docs-private/engine-track/artifact-archives',
);
const archiveName = safeName(args.name ?? path.basename(sourceRealPath));
const archivePath = path.join(archiveRoot, archiveName);

if (await exists(archivePath)) {
  if (args.force !== 'true') {
    throw new Error(`archive already exists: ${relative(archivePath)}; pass --force to replace`);
  }
}

await mkdir(archiveRoot, { recursive: true });
await cp(sourceRealPath, archivePath, {
  dereference: true,
  errorOnExist: args.force !== 'true',
  force: args.force === 'true',
  recursive: true,
});

const manifestPath = path.join(sourceRealPath, 'manifest.json');
const manifest = await readJson(manifestPath);
const metadata = {
  archived_at: new Date().toISOString(),
  source_arg: sourceArg,
  source_real_path: sourceRealPath,
  archive_path: relative(archivePath),
  manifest_url: args.manifestUrl ?? `/${path.basename(sourceRealPath)}/manifest.json`,
  note: args.note ?? null,
  manifest: manifest
    ? {
        tier1_version: manifest.tier1_version ?? null,
        tier1_commit: manifest.tier1_commit ?? null,
        opponent: manifest.opponent ?? null,
        evaluator: manifest.evaluator ?? null,
        max_particles: manifest.max_particles ?? null,
        target_n: manifest.target_n ?? null,
        base_seed: manifest.base_seed ?? null,
        start_index: manifest.start_index ?? null,
        games_total: manifest.games_total ?? null,
        games_saved: manifest.games_saved ?? null,
        record: manifest.tier1_record ?? null,
      }
    : null,
};

await writeFile(
  path.join(archivePath, 'ARCHIVE-METADATA.json'),
  JSON.stringify(metadata, null, 2) + '\n',
);

console.log(`archived ${sourceRealPath}`);
console.log(`to ${archivePath}`);

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(values) {
  const parsed = { _: [] };
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!value.startsWith('--')) {
      parsed._.push(value);
      continue;
    }
    const [key, inline] = value.slice(2).split('=');
    parsed[key] = inline ?? values[i + 1] ?? 'true';
    if (inline === undefined) i += 1;
  }
  return parsed;
}

function relative(file) {
  const rel = path.relative(repoRoot, file);
  return rel.startsWith('..') ? file : rel;
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
}

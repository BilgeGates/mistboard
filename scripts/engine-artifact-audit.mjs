import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));

const annotationsPath = path.resolve(
  repoRoot,
  args.annotations ?? 'research/python-fow-lab/feedback/annotations.jsonl',
);
const publicRoots = parseListArg(args.publicRoot ?? args.publicRoots ?? 'apps/web/public').map(
  (root) => path.resolve(repoRoot, root),
);
const capturesRoot = path.resolve(repoRoot, args.captures ?? 'docs-private/engine-track/captures');
const outPath = args.out ? path.resolve(repoRoot, args.out) : null;

const priorityTags = new Set([
  'belief-bug',
  'csp-reseed',
  'fog-risk',
  'king-safety',
  'known-king-adjacency',
  'least-valuable-attacker',
  'move-selection',
  'piece-identity',
  'soft-vs-hard-constraints',
]);

const annotations = await readJsonl(annotationsPath);
const captures = await loadCaptureIndexes(capturesRoot);
const pngs = await listFiles(capturesRoot, (file) => file.endsWith('.png')).catch(() => []);
const captureKeys = new Set(captures.map(captureKey));
const inferredPngKeys = new Set(pngs.map(inferCaptureKeyFromPng).filter(Boolean));

const priority = annotations.filter((annotation) => {
  if (annotation.severity === 'major') return true;
  return (annotation.tags ?? []).some((tag) => priorityTags.has(tag));
});

const unresolved = [];
for (const annotation of annotations) {
  const manifestFile = await resolveManifestFile(annotation.manifest_url);
  const manifestExists = await exists(manifestFile);
  let gameInManifest = false;
  let gameLogExists = false;
  if (manifestExists) {
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    const game = manifest.games?.find(
      (entry) => Number(entry.index) === Number(annotation.game_index),
    );
    gameInManifest = Boolean(game);
    if (game?.path) {
      gameLogExists = await exists(path.join(path.dirname(manifestFile), game.path));
    }
  }
  if (!manifestExists || !gameInManifest || !gameLogExists) {
    unresolved.push({
      id: annotation.id,
      manifest_url: annotation.manifest_url,
      game_index: annotation.game_index,
      ply: annotation.ply,
      move_played_uci: annotation.move_played_uci,
      manifestExists,
      gameInManifest,
      gameLogExists,
    });
  }
}

const priorityMissingCaptures = priority.filter((annotation) => {
  const key = captureKey(annotation);
  return !captureKeys.has(key) && !inferredPngKeys.has(key);
});

const indexedMissingPngs = [];
for (const capture of captures) {
  if (!capture.screenshot_repo_path && !capture.screenshot) continue;
  const expected = capture.screenshot_repo_path
    ? path.resolve(repoRoot, capture.screenshot_repo_path)
    : path.resolve(capturesRoot, capture.screenshot);
  if (!(await exists(expected))) indexedMissingPngs.push(capture);
}

const unindexedPngs = pngs.filter((png) => {
  const key = inferCaptureKeyFromPng(png);
  return key && !captureKeys.has(key);
});

const report = renderReport({
  annotations,
  priority,
  priorityMissingCaptures,
  unresolved,
  captures,
  pngs,
  indexedMissingPngs,
  unindexedPngs,
  annotationsPath,
  publicRoots,
  capturesRoot,
});

if (outPath) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, report);
  console.log(`wrote ${outPath}`);
} else {
  process.stdout.write(report);
}

function renderReport(data) {
  const severityCounts = countBy(data.annotations, (row) => row.severity ?? 'unknown');
  const manifestCounts = countBy(data.annotations, (row) => row.manifest_url ?? 'unknown');
  const lines = [
    '# Engine Artifact Audit',
    '',
    `Annotations: \`${relative(data.annotationsPath)}\``,
    `Public roots: ${data.publicRoots.map((root) => `\`${relative(root)}\``).join(', ')}`,
    `Captures: \`${relative(data.capturesRoot)}\``,
    '',
    '## Summary',
    '',
    `- annotations: ${data.annotations.length}`,
    `- priority annotations: ${data.priority.length}`,
    `- indexed captures: ${data.captures.length}`,
    `- png files: ${data.pngs.length}`,
    `- priority annotations missing indexed/png captures: ${data.priorityMissingCaptures.length}`,
    `- annotations with unresolved manifest/game files: ${data.unresolved.length}`,
    `- indexed captures missing PNG files: ${data.indexedMissingPngs.length}`,
    `- PNG files not represented in indexes: ${data.unindexedPngs.length}`,
    '',
    '## Severity Counts',
    '',
    ...tableFromEntries(severityCounts),
    '',
    '## Annotation Manifests',
    '',
    ...tableFromEntries(manifestCounts),
    '',
    '## Priority Missing Captures',
    '',
    '| Manifest | Game | Ply | Move | Severity | Tags | Annotation |',
    '| --- | ---: | ---: | --- | --- | --- | --- |',
    ...data.priorityMissingCaptures.map((row) =>
      [
        `| \`${row.manifest_url}\``,
        row.game_index,
        row.ply,
        `\`${row.move_played_uci ?? ''}\``,
        row.severity ?? '',
        `\`${(row.tags ?? []).join(', ') || 'none'}\``,
        `\`${row.id ?? ''}\` |`,
      ].join(' | '),
    ),
    ...(data.priorityMissingCaptures.length ? [] : ['|  |  |  |  |  |  | none |']),
    '',
    '## Unresolved Annotation References',
    '',
    '| Manifest | Game | Ply | Move | Manifest | Game Row | Game Log | Annotation |',
    '| --- | ---: | ---: | --- | --- | --- | --- | --- |',
    ...data.unresolved.map((row) =>
      [
        `| \`${row.manifest_url}\``,
        row.game_index,
        row.ply,
        `\`${row.move_played_uci ?? ''}\``,
        yesNo(row.manifestExists),
        yesNo(row.gameInManifest),
        yesNo(row.gameLogExists),
        `\`${row.id ?? ''}\` |`,
      ].join(' | '),
    ),
    ...(data.unresolved.length ? [] : ['|  |  |  |  | yes | yes | yes | none |']),
    '',
    '## Unindexed PNGs',
    '',
    ...data.unindexedPngs.map((file) => `- \`${relative(file)}\``),
    ...(data.unindexedPngs.length ? [] : ['- none']),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function tableFromEntries(entries) {
  const lines = ['| Key | Count |', '| --- | ---: |'];
  for (const [key, count] of [...entries.entries()].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0])),
  )) {
    lines.push(`| \`${key}\` | ${count} |`);
  }
  return lines;
}

function countBy(rows, fn) {
  const counts = new Map();
  for (const row of rows) {
    const key = fn(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

async function loadCaptureIndexes(root) {
  const files = await listFiles(root, (file) => path.basename(file) === 'index.json').catch(
    () => [],
  );
  const captures = [];
  for (const file of files) {
    const data = JSON.parse(await readFile(file, 'utf8'));
    for (const capture of data.captures ?? []) {
      captures.push({
        ...capture,
        _index_path: file,
        manifest_url: capture.manifest_url ?? data.manifest_url,
      });
    }
  }
  return captures;
}

async function listFiles(root, predicate) {
  const found = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (!predicate || predicate(full)) {
        found.push(full);
      }
    }
  }
  await walk(root);
  return found;
}

async function readJsonl(file) {
  const text = await readFile(file, 'utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function resolveManifestFile(url) {
  if (!url?.startsWith('/')) return path.join(publicRoots[0], '__invalid__');
  for (const root of publicRoots) {
    const candidate = path.resolve(root, `.${url}`);
    if (await exists(candidate)) return candidate;
  }
  return path.resolve(publicRoots[0], `.${url}`);
}

function captureKey(row) {
  return [
    row.manifest_url ?? '',
    Number(row.game_index),
    Number(row.ply),
    row.move_played_uci ?? '',
  ].join('\u0000');
}

function inferCaptureKeyFromPng(file) {
  const name = path.basename(file, '.png');
  const match = name.match(
    /^(?<manifest>.+)-g(?<game>\d+)-ply(?<ply>\d+)-(?<move>[a-h][1-8][a-h][1-8][qrbn]?)$/,
  );
  if (!match?.groups) return null;
  const manifestUrl = `/${match.groups.manifest}/manifest.json`;
  return [manifestUrl, Number(match.groups.game), Number(match.groups.ply), match.groups.move].join(
    '\u0000',
  );
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
  const parsed = {};
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!value.startsWith('--')) continue;
    const [key, inline] = value.slice(2).split('=');
    const parsedValue = inline ?? values[i + 1] ?? 'true';
    if (parsed[key] === undefined) {
      parsed[key] = parsedValue;
    } else if (Array.isArray(parsed[key])) {
      parsed[key].push(parsedValue);
    } else {
      parsed[key] = [parsed[key], parsedValue];
    }
    if (inline === undefined) i += 1;
  }
  return parsed;
}

function parseListArg(value) {
  const values = Array.isArray(value) ? value : String(value).split(',');
  return values.map((item) => item.trim()).filter(Boolean);
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function relative(file) {
  const rel = path.relative(repoRoot, file);
  return rel.startsWith('..') ? file : rel;
}

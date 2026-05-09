import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const repoRoot = process.cwd();
const publicRoot = path.join(repoRoot, 'apps', 'web', 'public');
const annotationsPath = path.join(repoRoot, 'research', 'python-fow-lab', 'feedback', 'annotations.jsonl');

const args = parseArgs(process.argv.slice(2));
const manifestUrl = args.manifest ?? args.m;
if (!manifestUrl) {
  console.error('usage: node scripts/capture-belief-artifacts.mjs --manifest /bakeoff-vX/manifest.json [--out docs-private/engine-track/captures] [--limit 12]');
  process.exit(2);
}

const baseUrl = args.baseUrl ?? process.env.BICHESS_WEB_URL ?? 'http://127.0.0.1:3000';
const limit = Number(args.limit ?? 12);
const outputDir = path.resolve(repoRoot, args.out ?? 'docs-private/engine-track/captures');
const viewport = {
  width: Number(args.width ?? 1440),
  height: Number(args.height ?? 1100),
};

const manifestFile = manifestFileForUrl(manifestUrl);
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
const annotations = (await readJsonl(annotationsPath))
  .filter((annotation) => annotation.manifest_url === manifestUrl)
  .filter((annotation) => manifest.games?.some((game) => game.index === annotation.game_index));

const selected = annotations.slice(0, Number.isFinite(limit) && limit > 0 ? limit : annotations.length);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport });
const captures = [];

for (const annotation of selected) {
  const fileBase = [
    safeName(path.basename(path.dirname(manifestUrl))),
    `g${String(annotation.game_index).padStart(4, '0')}`,
    `ply${String(annotation.ply).padStart(3, '0')}`,
    annotation.move_played_uci,
  ].join('-');
  const screenshotPath = path.join(outputDir, `${fileBase}.png`);
  const url = new URL(baseUrl);
  url.searchParams.set('bakeoff', manifestUrl);
  url.searchParams.set('game', String(annotation.game_index));
  url.searchParams.set('ply', String(annotation.ply));
  url.searchParams.set('capture', 'belief');
  const focusSquare = annotation.move_played_uci?.slice(2, 4);
  if (/^[a-h][1-8]$/.test(focusSquare)) {
    url.searchParams.set('square', focusSquare);
  }

  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.replay-page[data-ply]');
  await page.waitForFunction(
    ({ gamePath, ply }) => {
      const replay = document.querySelector('.replay-page');
      return replay?.getAttribute('data-sample-id') === gamePath
        && replay?.getAttribute('data-ply') === String(ply);
    },
    { gamePath: annotation.game_path, ply: annotation.ply },
  );
  await page.waitForSelector('.belief-panel:not([hidden]) .belief-square');
  await page.waitForTimeout(250);

  const metrics = await page.evaluate(() => {
    const board = document.querySelector('.belief-board');
    const squares = [...document.querySelectorAll('.belief-square')];
    if (!board) throw new Error('missing belief board');
    const rects = squares.map((square) => {
      const rect = square.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    const first = rects[0] ?? { width: 0, height: 0 };
    const maxDelta = rects.reduce((max, rect) => {
      return Math.max(
        max,
        Math.abs(rect.width - first.width),
        Math.abs(rect.height - first.height),
        Math.abs(rect.width - rect.height),
      );
    }, 0);
    return {
      beliefSquares: squares.length,
      maxSquareDeltaPx: maxDelta,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      title: document.querySelector('.belief-panel-status')?.textContent ?? '',
    };
  });
  if (metrics.beliefSquares !== 64) {
    throw new Error(`expected 64 belief squares, found ${metrics.beliefSquares}`);
  }
  if (metrics.maxSquareDeltaPx > 1) {
    throw new Error(`belief squares are not stable: max delta ${metrics.maxSquareDeltaPx}px`);
  }

  const target = page.locator('.bakeoff-replay-area');
  await target.screenshot({ path: screenshotPath });
  captures.push({
    id: annotation.id,
    manifest_url: annotation.manifest_url,
    game_index: annotation.game_index,
    game_path: annotation.game_path,
    ply: annotation.ply,
    move_played_uci: annotation.move_played_uci,
    severity: annotation.severity,
    suggested_move_uci: annotation.suggested_move_uci,
    note: annotation.note,
    screenshot: path.relative(outputDir, screenshotPath),
    screenshot_repo_path: path.relative(repoRoot, screenshotPath),
    metrics,
  });
  console.log(`captured g${annotation.game_index} ply ${annotation.ply}: ${screenshotPath}`);
}

await browser.close();

await writeFile(
  path.join(outputDir, 'index.json'),
  JSON.stringify({ manifest_url: manifestUrl, base_url: baseUrl, captures }, null, 2) + '\n',
);
await writeFile(path.join(outputDir, 'index.md'), renderMarkdown(manifestUrl, captures));
console.log(`capture index: ${path.join(outputDir, 'index.md')}`);

function parseArgs(values) {
  const result = {};
  for (let i = 0; i < values.length; i += 1) {
    const raw = values[i];
    if (!raw.startsWith('--')) continue;
    const [key, inline] = raw.slice(2).split('=');
    result[key] = inline ?? values[i + 1] ?? 'true';
    if (inline === undefined) i += 1;
  }
  return result;
}

function manifestFileForUrl(url) {
  if (!url.startsWith('/')) throw new Error(`manifest must be a public URL path: ${url}`);
  const resolved = path.resolve(publicRoot, `.${url}`);
  if (!resolved.startsWith(publicRoot)) throw new Error(`manifest escapes public root: ${url}`);
  return resolved;
}

async function readJsonl(file) {
  const text = await readFile(file, 'utf8').catch(() => '');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
}

function renderMarkdown(manifest, captures) {
  const lines = [
    '# Belief Artifact Captures',
    '',
    `Manifest: \`${manifest}\``,
    '',
    '| Game | Ply | Move | Severity | Screenshot | Note |',
    '| ---: | ---: | --- | --- | --- | --- |',
  ];
  for (const capture of captures) {
    lines.push(
      `| ${capture.game_index} | ${capture.ply} | \`${capture.move_played_uci}\` | ${capture.severity} | [png](${capture.screenshot}) | ${escapeMd(capture.note)} |`,
    );
  }
  if (captures.length === 0) {
    lines.push('|  |  |  |  |  | no matching annotations |');
  }
  return `${lines.join('\n')}\n`;
}

function escapeMd(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

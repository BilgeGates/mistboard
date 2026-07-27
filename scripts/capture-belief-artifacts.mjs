import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { launchChromium } from './lib/launch-browser.mjs';

const repoRoot = process.cwd();
const publicRoot = path.join(repoRoot, 'apps', 'web', 'public');
const annotationsPath = path.join(
  repoRoot,
  'research',
  'python-fow-lab',
  'feedback',
  'annotations.jsonl',
);

const args = parseArgs(process.argv.slice(2));
const manifestUrl = args.manifest ?? args.m;
if (!manifestUrl) {
  console.error(
    'usage: node scripts/capture-belief-artifacts.mjs --manifest /bakeoff-vX/manifest.json [--out docs-private/engine-track/captures] [--limit 12]',
  );
  process.exit(2);
}

const baseUrl = args.baseUrl ?? process.env.MISTBOARD_WEB_URL ?? 'http://127.0.0.1:3000';
const limit = Number(args.limit ?? 12);
const outputDir = path.resolve(repoRoot, args.out ?? 'docs-private/engine-track/captures');
const viewport = {
  width: Number(args.width ?? 1440),
  height: Number(args.height ?? 1100),
};
const deviceScaleFactor = Number(args.deviceScaleFactor ?? args.dsf ?? 2);
const cropPadding = Number(args.cropPadding ?? 8);
const cropToContent = args.crop !== 'false';

const manifestFile = manifestFileForUrl(manifestUrl);
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
const manifestAnnotations = (await readJsonl(annotationsPath))
  .filter((annotation) => annotation.manifest_url === manifestUrl)
  .filter((annotation) => manifest.games?.some((game) => game.index === annotation.game_index));
const annotations = selectAnnotations(manifestAnnotations, manifest, args);

const selected = annotations.slice(
  0,
  Number.isFinite(limit) && limit > 0 ? limit : annotations.length,
);
await mkdir(outputDir, { recursive: true });

const browser = await launchChromium();
const page = await browser.newPage({ viewport, deviceScaleFactor });
const captures = [];

for (const annotation of selected) {
  const fileBase = [
    safeName(path.basename(path.dirname(manifestUrl))),
    `g${String(annotation.game_index).padStart(4, '0')}`,
    `ply${String(annotation.ply).padStart(3, '0')}`,
    annotation.move_played_uci,
    (args.beliefKind ?? args.snapshotKind) ? safeName(args.beliefKind ?? args.snapshotKind) : null,
  ]
    .filter(Boolean)
    .join('-');
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
  if (args.square) url.searchParams.set('square', args.square);
  if (args.seat ?? args.beliefSeat)
    url.searchParams.set('beliefSeat', args.seat ?? args.beliefSeat);
  if (args.beliefKind ?? args.snapshotKind) {
    url.searchParams.set('beliefKind', args.beliefKind ?? args.snapshotKind);
  }

  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.replay-page[data-ply]');
  await page.waitForFunction(
    ({ gamePath, ply }) => {
      const replay = document.querySelector('.replay-page');
      return (
        replay?.getAttribute('data-sample-id') === gamePath &&
        replay?.getAttribute('data-ply') === String(ply)
      );
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

  const screenshotMetrics = cropToContent
    ? await screenshotContent(page, '.bakeoff-replay-area', screenshotPath, cropPadding)
    : await screenshotElement(page, '.bakeoff-replay-area', screenshotPath);
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
    metrics: {
      ...metrics,
      ...screenshotMetrics,
      deviceScaleFactor,
    },
  });
  console.log(`captured g${annotation.game_index} ply ${annotation.ply}: ${screenshotPath}`);
}

async function screenshotElement(page, selector, screenshotPath) {
  const target = page.locator(selector);
  await target.screenshot({ path: screenshotPath });
  const box = await target.boundingBox();
  return {
    screenshotMode: 'element',
    screenshotCssWidth: Math.round(box?.width ?? 0),
    screenshotCssHeight: Math.round(box?.height ?? 0),
  };
}

async function screenshotContent(page, selector, screenshotPath, padding) {
  const clip = await page.evaluate(
    ({ selector, padding }) => {
      const container = document.querySelector(selector);
      if (!container) throw new Error(`missing screenshot target: ${selector}`);
      const containerRect = container.getBoundingClientRect();
      let left = Number.POSITIVE_INFINITY;
      let top = Number.POSITIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;

      for (const element of container.querySelectorAll('*')) {
        const style = window.getComputedStyle(element);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number(style.opacity) === 0
        )
          continue;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) continue;
        if (rect.right < containerRect.left || rect.left > containerRect.right) continue;
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
      }

      if (!Number.isFinite(left)) {
        left = containerRect.left;
        top = containerRect.top;
        right = containerRect.right;
        bottom = containerRect.bottom;
      }

      left = Math.max(containerRect.left, left - padding);
      top = Math.max(containerRect.top, top - padding);
      right = Math.min(containerRect.right, right + padding);
      bottom = Math.min(containerRect.bottom, bottom + padding);

      return {
        x: Math.max(0, Math.floor(left + window.scrollX)),
        y: Math.max(0, Math.floor(top + window.scrollY)),
        width: Math.ceil(right - left),
        height: Math.ceil(bottom - top),
      };
    },
    { selector, padding },
  );
  await page.screenshot({ path: screenshotPath, clip });
  return {
    screenshotMode: 'content-clip',
    screenshotCssWidth: clip.width,
    screenshotCssHeight: clip.height,
  };
}

function selectAnnotations(rows, manifest, options) {
  const filtered = rows
    .filter((annotation) => (options.annotationId ? annotation.id === options.annotationId : true))
    .filter((annotation) =>
      options.game ? Number(annotation.game_index) === Number(options.game) : true,
    )
    .filter((annotation) => (options.ply ? Number(annotation.ply) === Number(options.ply) : true))
    .filter((annotation) => (options.move ? annotation.move_played_uci === options.move : true));
  if (filtered.length > 0) return filtered;
  if (!options.game || !options.ply) return filtered;

  const game = manifest.games?.find((entry) => Number(entry.index) === Number(options.game));
  if (!game) return filtered;
  return [
    {
      id:
        options.id ??
        `manual-${safeName(path.basename(path.dirname(manifestUrl)))}-g${options.game}-ply${options.ply}`,
      manifest_url: manifestUrl,
      game_index: Number(options.game),
      game_path: game.path,
      ply: Number(options.ply),
      move_played_uci: options.move ?? '',
      severity: options.severity ?? 'manual',
      suggested_move_uci: options.suggestedMove ?? null,
      note: options.note ?? 'Manual capture target from trace/belief artifact backfill.',
    },
  ];
}

await browser.close();

await writeFile(
  path.join(outputDir, 'index.json'),
  `${JSON.stringify({ manifest_url: manifestUrl, base_url: baseUrl, captures }, null, 2)}\n`,
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
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>');
}

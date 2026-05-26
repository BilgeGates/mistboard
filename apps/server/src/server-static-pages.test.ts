import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { injectPageMeta, serveArticlePage } from './server-static-pages.js';

type ResponseCapture = {
  body: string;
  headers: Record<string, string>;
  status: number | null;
};

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    headers: {},
    status: null as number | null,
    writeHead(status: number, headers?: Record<string, string>) {
      capture.status = status;
      capture.headers = headers ?? {};
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  return capture as ServerResponse & ResponseCapture;
}

function indexHtml(): string {
  return [
    '<html>',
    '<head>',
    '<title>Mistboard</title>',
    '<meta name="description" content="old">',
    '<meta property="og:title" content="old">',
    '<meta property="og:description" content="old">',
    '<meta property="og:url" content="old">',
    '<meta property="og:image" content="old">',
    '<meta name="twitter:title" content="old">',
    '<meta name="twitter:description" content="old">',
    '<meta name="twitter:image" content="old">',
    '</head>',
    '<body><div id="app"></div></body>',
    '</html>',
  ].join('');
}

test('injectPageMeta replaces share tags and escapes injected values', () => {
  const html = injectPageMeta(indexHtml(), {
    title: 'A "quoted" <title>',
    description: 'Dark & hidden <info>',
    url: 'https://example.test/game/abc',
    imageUrl: 'https://example.test/og.png?x=1&y=2',
  });

  assert.match(html, /<title>A &quot;quoted&quot; &lt;title&gt;<\/title>/);
  assert.match(html, /<meta name="description" content="Dark &amp; hidden &lt;info&gt;">/);
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/example.test\/og.png\?x=1&amp;y=2">/,
  );
});

test('serveArticlePage returns prerendered article files when present', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await mkdir(join(staticDir, 'articles'), { recursive: true });
  await writeFile(join(staticDir, 'index.html'), indexHtml(), 'utf-8');
  await writeFile(join(staticDir, 'articles', 'dark-chess-rules.html'), '<h1>prerendered</h1>');
  const response = captureResponse();

  await serveArticlePage({
    slug: 'dark-chess-rules',
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(response.body, '<h1>prerendered</h1>');
});

test('serveArticlePage falls back to index shell with article metadata', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'mistboard-static-'));
  await writeFile(join(staticDir, 'index.html'), indexHtml(), 'utf-8');
  const response = captureResponse();

  await serveArticlePage({
    slug: 'dark-chess-rules',
    response,
    publicHost: 'https://mistboard.test',
    staticDir,
  });

  assert.equal(response.status, 200);
  assert.match(response.body, /<title>Dark Chess Rules \| Mistboard<\/title>/);
  assert.match(
    response.body,
    /<meta property="og:url" content="https:\/\/mistboard.test\/articles\/dark-chess-rules">/,
  );
  assert.match(
    response.body,
    /<meta property="og:image" content="https:\/\/mistboard.test\/og\/article\/dark-chess-rules.png">/,
  );
});

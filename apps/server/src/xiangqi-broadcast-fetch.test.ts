import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { normalizeDpxqPageToFrameHtml } from './xiangqi-broadcast-dpxq.js';
import { decodeSourceBody, detectSourceCharset } from './xiangqi-broadcast-fetch.js';
import { convertWxfDhtmlXqPageToSnapshot } from './xiangqi-broadcast-wxf-dhtmlxq.js';

// Real dpxq.com archive page kept in its native gb2312 bytes (not transcoded).
const GB2312_BYTES = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./fixtures/dpxq/view_m_11637-gb2312.html', import.meta.url))),
);

test('detectSourceCharset reads the Content-Type header first', () => {
  assert.equal(detectSourceCharset(GB2312_BYTES, 'text/html; charset=gb2312'), 'gb2312');
  assert.equal(detectSourceCharset(new Uint8Array(), 'text/html; charset=UTF-8'), 'utf-8');
});

test('detectSourceCharset falls back to a <meta charset> sniff', () => {
  // dpxq sends no charset header; the page declares gb2312 in a meta tag.
  assert.equal(detectSourceCharset(GB2312_BYTES, null), 'gb2312');
  assert.equal(detectSourceCharset(new Uint8Array([0x3c, 0x21]), null), 'utf-8');
});

test('decodeSourceBody decodes gb2312 bytes to correct Chinese names', () => {
  const text = decodeSourceBody(GB2312_BYTES, 'text/html; charset=gb2312');
  assert.ok(text.includes('王斌'), 'red player name decodes');
  assert.ok(text.includes('陶汉明'), 'black player name decodes');
  assert.ok(!text.includes('�'), 'no replacement characters');
});

test('decoding as UTF-8 (the old default) would have mojibaked the names', () => {
  const wrong = new TextDecoder('utf-8').decode(GB2312_BYTES);
  assert.ok(!wrong.includes('王斌'), 'utf-8 misread does not recover the name');
});

test('an unknown charset label falls back to utf-8 instead of throwing', () => {
  const utf8Bytes = new TextEncoder().encode('<html>王斌</html>');
  assert.equal(
    decodeSourceBody(utf8Bytes, 'text/html; charset=made-up-encoding'),
    '<html>王斌</html>',
  );
});

test('gb2312-decoded dpxq page normalizes and replays with correct names', () => {
  const text = decodeSourceBody(GB2312_BYTES, 'text/html; charset=gb2312');
  const normalized = normalizeDpxqPageToFrameHtml(text);
  assert.equal(normalized.ok, true);
  const converted = convertWxfDhtmlXqPageToSnapshot(normalized.ok ? normalized.html : '');
  assert.equal(converted.ok, true);
  if (!converted.ok) return;
  const board = converted.snapshot.boards[0]!;
  assert.equal(board.red.name, '王斌');
  assert.equal(board.black.name, '陶汉明');
  assert.equal(board.moves.length, 89);
});

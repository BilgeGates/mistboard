import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
  DEFAULT_JSON_BODY_LIMIT,
  RequestBodyTooLargeError,
  readJsonBody,
  TREE_JSON_BODY_LIMIT,
} from './lib.js';

// readJsonBody reads a request stream, so a plain Readable carrying the same
// chunks is a faithful stand-in (no socket needed).
function bodyStream(payload: string): IncomingMessage {
  return Readable.from([Buffer.from(payload, 'utf-8')]) as unknown as IncomingMessage;
}

test('readJsonBody parses a normal body', async () => {
  const body = await readJsonBody(bodyStream(JSON.stringify({ name: 'ok' })));
  assert.equal(body.name, 'ok');
});

test('readJsonBody rejects past the default cap with a typed error', async () => {
  const oversized = JSON.stringify({ pad: 'x'.repeat(DEFAULT_JSON_BODY_LIMIT) });
  await assert.rejects(
    () => readJsonBody(bodyStream(oversized)),
    (err: unknown) => err instanceof RequestBodyTooLargeError,
    'oversized bodies must throw RequestBodyTooLargeError so the API can answer 413 rather than a generic 500',
  );
});

test('a study-sized annotated tree fits the tree cap but not the default one', async () => {
  // A real chapter of 橘中秘 vol 1 (大列手砲局, 40 variations) serialises past
  // 25 KB of UTF-8, which the 16 KiB default rejected. Chinese comment text is
  // 3 bytes per character, so the byte budget goes much faster than it looks.
  const chapter = JSON.stringify({
    name: '16. 大列手砲局',
    variant: 'xiangqi',
    root: { version: 1, comment: '去馬。'.repeat(4000) },
  });
  assert.ok(
    Buffer.byteLength(chapter, 'utf-8') > DEFAULT_JSON_BODY_LIMIT,
    'fixture should exceed the default cap',
  );
  await assert.rejects(
    () => readJsonBody(bodyStream(chapter)),
    (err: unknown) => err instanceof RequestBodyTooLargeError,
  );
  const parsed = await readJsonBody(bodyStream(chapter), TREE_JSON_BODY_LIMIT);
  assert.equal(parsed.variant, 'xiangqi');
});

test('the tree cap is still bounded', async () => {
  const huge = JSON.stringify({ pad: 'x'.repeat(TREE_JSON_BODY_LIMIT) });
  await assert.rejects(
    () => readJsonBody(bodyStream(huge), TREE_JSON_BODY_LIMIT),
    (err: unknown) => err instanceof RequestBodyTooLargeError,
  );
});

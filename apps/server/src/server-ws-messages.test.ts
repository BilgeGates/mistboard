import assert from 'node:assert/strict';
import test from 'node:test';
import { isKnownClientMessageType, parseClientMessage } from './server-ws-messages.js';

test('parseClientMessage accepts typed object payloads', () => {
  assert.deepEqual(
    parseClientMessage(
      JSON.stringify({
        type: 'move',
        from: 'e2',
        to: 'e4',
        promotion: 'q',
      }),
    ),
    {
      type: 'move',
      from: 'e2',
      to: 'e4',
      promotion: 'q',
    },
  );
});

test('parseClientMessage rejects malformed or untyped payloads', () => {
  assert.equal(parseClientMessage('{'), null);
  assert.equal(parseClientMessage('[]'), null);
  assert.equal(parseClientMessage('"ping"'), null);
  assert.equal(parseClientMessage(JSON.stringify({ at: Date.now() })), null);
});

test('isKnownClientMessageType owns the websocket client allowlist', () => {
  assert.equal(isKnownClientMessageType('snapshot:request'), true);
  assert.equal(isKnownClientMessageType('latency-sample'), true);
  assert.equal(isKnownClientMessageType('move'), true);
  assert.equal(isKnownClientMessageType('unknown:new-message'), false);
});

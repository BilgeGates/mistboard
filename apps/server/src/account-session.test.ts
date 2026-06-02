import assert from 'node:assert/strict';
import test from 'node:test';
import { maxHandleLength, normalizeProfileHandle } from './account-identity.js';
import { handleCollisionAttempt } from './account-session.js';

test('handleCollisionAttempt keeps signup retry handles within the public handle cap', () => {
  const baseHandle = 'a'.repeat(maxHandleLength);

  for (let i = 0; i < 20; i += 1) {
    const handle = handleCollisionAttempt(baseHandle);
    assert.equal(handle.length, maxHandleLength);
    assert.equal(normalizeProfileHandle(handle), handle);
    assert.match(handle, /^a+-\d{5}$/);
  }
});

test('handleCollisionAttempt separates the suffix from a short base with a hyphen', () => {
  for (let i = 0; i < 20; i += 1) {
    assert.match(handleCollisionAttempt('brian'), /^brian-\d{5}$/);
  }
});

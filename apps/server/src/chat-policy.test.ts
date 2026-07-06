import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateChatText, normalizeChatText } from './chat-policy.js';

test('normalizeChatText folds spacing, case, and compatibility forms', () => {
  assert.equal(normalizeChatText('  HELLO   Ｗorld  '), 'hello world');
});

test('evaluateChatText allows ordinary chat', () => {
  assert.deepEqual(evaluateChatText('hello, anyone up for 3+2?'), {
    action: 'allow',
    status: 'clean',
  });
});

test('evaluateChatText flags broad profanity but keeps it visible', () => {
  assert.deepEqual(evaluateChatText('that was a shit move'), {
    action: 'allow',
    status: 'flagged',
    reason: 'profanity',
  });
});

test('evaluateChatText rejects severe local policy hits', () => {
  assert.deepEqual(evaluateChatText('kys'), {
    action: 'reject',
    reason: 'severe_language',
  });
});

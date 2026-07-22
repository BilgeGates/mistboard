import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_POLICY, evaluateChatText, normalizeChatText } from './chat-policy.js';

test('chat stays visible for seven days of activity', () => {
  assert.equal(CHAT_POLICY.quietAfterMs, 7 * 24 * 60 * 60 * 1000);
});

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

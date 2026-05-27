import assert from 'node:assert/strict';
import test from 'node:test';
import {
  displayNameForEmail,
  handleBaseForEmail,
  normalizeDisplayName,
  normalizeEmail,
  normalizeProfileHandle,
} from './account-identity.js';

test('normalizeEmail trims and lowercases ASCII email addresses', () => {
  assert.equal(normalizeEmail(' Brian+Test@Gmail.COM '), 'brian+test@gmail.com');
});

test('normalizeEmail rejects unsupported email shapes', () => {
  assert.equal(normalizeEmail('not-an-email'), null);
  assert.equal(normalizeEmail('user@example'), null);
  assert.equal(normalizeEmail('user@-example.com'), null);
  assert.equal(normalizeEmail('用户@example.com'), null);
});

test('handleBaseForEmail strips plus tags before deriving public handles', () => {
  assert.equal(handleBaseForEmail('brian+testing@gmail.com'), 'brian');
  assert.equal(handleBaseForEmail('first.last+tag@example.com'), 'first-last');
});

test('handleBaseForEmail falls back when the email local part has no safe handle stem', () => {
  assert.match(handleBaseForEmail('++@example.com'), /^player-[a-z0-9]{5}$/);
  assert.match(handleBaseForEmail('ab@example.com'), /^player-[a-z0-9]{5}$/);
});

test('displayNameForEmail strips plus tags and keeps human-facing spacing', () => {
  assert.equal(displayNameForEmail('first.last+tag@example.com'), 'first last');
  assert.equal(displayNameForEmail('++@example.com'), 'Player');
  assert.equal(displayNameForEmail(`${'a'.repeat(60)}@example.com`).length, 40);
});

test('normalizeProfileHandle accepts public handle syntax', () => {
  assert.equal(normalizeProfileHandle(' Brian_H-Liou '), 'brian_h-liou');
  assert.equal(normalizeProfileHandle('a'.repeat(24)), 'a'.repeat(24));
});

test('normalizeProfileHandle rejects unsafe or reserved handles', () => {
  assert.equal(normalizeProfileHandle('ab'), null);
  assert.equal(normalizeProfileHandle('a'.repeat(25)), null);
  assert.equal(normalizeProfileHandle('-brian'), null);
  assert.equal(normalizeProfileHandle('brian-'), null);
  assert.equal(normalizeProfileHandle('api'), null);
  assert.equal(normalizeProfileHandle('brian.hliou'), null);
});

test('normalizeDisplayName trims and bounds public display names', () => {
  assert.equal(normalizeDisplayName('  Brian   Hliou  '), 'Brian Hliou');
  assert.equal(normalizeDisplayName(''), null);
  assert.equal(normalizeDisplayName('a'.repeat(41)), null);
});

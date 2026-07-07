import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateXiangqiBroadcastSourceUrl,
  xiangqiBroadcastSourceUrlPolicyFromEnv,
} from './xiangqi-broadcast-source-policy.js';

test('xiangqi broadcast source policy allows explicit public hosts', () => {
  const decision = validateXiangqiBroadcastSourceUrl('https://www.wxf-xiangqi.org/source.json', {
    allowedHosts: ['www.wxf-xiangqi.org'],
    allowLocal: false,
  });

  assert.equal(decision.ok, true);
  assert.equal(decision.ok ? decision.host : '', 'www.wxf-xiangqi.org');
});

test('xiangqi broadcast source policy supports wildcard subdomains', () => {
  const decision = validateXiangqiBroadcastSourceUrl('https://live.example.org/source.json', {
    allowedHosts: ['*.example.org'],
    allowLocal: false,
  });

  assert.equal(decision.ok, true);
  assert.equal(decision.ok ? decision.host : '', 'live.example.org');
});

test('xiangqi broadcast source policy rejects unsafe URL shapes', () => {
  const policy = { allowedHosts: ['www.wxf-xiangqi.org'], allowLocal: false };

  assert.equal(validateXiangqiBroadcastSourceUrl('not-a-url', policy).ok, false);
  assert.equal(
    validateXiangqiBroadcastSourceUrl('ftp://www.wxf-xiangqi.org/source.json', policy).ok,
    false,
  );
  assert.equal(
    validateXiangqiBroadcastSourceUrl('https://user:pass@www.wxf-xiangqi.org/source.json', policy)
      .ok,
    false,
  );
});

test('xiangqi broadcast source policy rejects local sources unless enabled', () => {
  const rejected = validateXiangqiBroadcastSourceUrl('http://127.0.0.1:3127/source.json', {
    allowedHosts: ['127.0.0.1'],
    allowLocal: false,
  });
  const allowed = validateXiangqiBroadcastSourceUrl('http://localhost:3127/source.json', {
    allowedHosts: [],
    allowLocal: true,
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.ok ? '' : rejected.reason, 'local_source_not_allowed');
  assert.equal(allowed.ok, true);
});

test('xiangqi broadcast source policy reads allowed hosts from env', () => {
  const policy = xiangqiBroadcastSourceUrlPolicyFromEnv({
    NODE_ENV: 'production',
    XIANGQI_BROADCAST_ALLOWED_SOURCE_HOSTS: 'https://www.wxf-xiangqi.org, *.xiangqi.example',
  });

  assert.deepEqual(policy, {
    allowedHosts: ['www.wxf-xiangqi.org', '*.xiangqi.example'],
    allowLocal: false,
  });
});

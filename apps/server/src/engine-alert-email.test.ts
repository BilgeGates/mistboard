import assert from 'node:assert/strict';
import test from 'node:test';
import { engineAlertEmailSubject, engineAlertEmailText } from './engine-alert-email.js';

test('engine alert email subject identifies severity and service', () => {
  assert.equal(
    engineAlertEmailSubject(
      {
        severity: 'critical',
        engine_turn_timeouts_tick: 1,
      },
      'engine-worker',
    ),
    '[Mistboard] CRITICAL engine alert (engine-worker)',
  );
});

test('engine alert email text includes alert fields without secrets', () => {
  const text = engineAlertEmailText(
    {
      severity: 'critical',
      engine_fallbacks_tick: 2,
      engine_turn_timeouts_tick: 1,
    },
    new Date('2026-05-26T12:00:00.000Z'),
    'web',
  );

  assert.match(text, /Severity: critical/);
  assert.match(text, /Service: web/);
  assert.match(text, /Time: 2026-05-26T12:00:00.000Z/);
  assert.match(text, /- engine_fallbacks_tick: 2/);
  assert.match(text, /- engine_turn_timeouts_tick: 1/);
  assert.doesNotMatch(text, /RESEND_API_KEY/);
});

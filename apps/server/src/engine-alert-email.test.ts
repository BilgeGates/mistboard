import assert from 'node:assert/strict';
import test from 'node:test';
import { engineAlertEmailSubject, engineAlertEmailText } from './engine-alert-email.js';
import {
  buildSyntheticEngineAlert,
  parseEngineAlertEmailCliArgs,
} from './engine-alert-email-cli.js';

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

test('engine alert CLI builds a dry-run synthetic payload by default', () => {
  const parsed = parseEngineAlertEmailCliArgs(
    [
      '--severity',
      'warning',
      '--service',
      'engine-worker',
      '--field',
      'engine_reservation_busy_tick=2',
      '--field=note=capacity smoke',
      '--now',
      '2026-05-26T12:00:00.000Z',
    ],
    Date.parse('2026-05-26T00:00:00.000Z'),
  );

  assert.equal(parsed.help, false);
  if (parsed.help) assert.fail('expected parsed CLI options');
  assert.equal(parsed.options.send, false);
  assert.equal(parsed.options.serviceName, 'engine-worker');
  assert.equal(parsed.options.nowMs, Date.parse('2026-05-26T12:00:00.000Z'));
  assert.deepEqual(buildSyntheticEngineAlert(parsed.options), {
    engine_reservation_busy_tick: 2,
    note: 'capacity smoke',
    synthetic: 1,
    source: 'ops:test-engine-alert',
    severity: 'warning',
  });
});

test('engine alert CLI requires severity to use the severity option', () => {
  assert.throws(
    () => parseEngineAlertEmailCliArgs(['--field', 'severity=critical']),
    /Use --severity/,
  );
});

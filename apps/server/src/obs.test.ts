import assert from 'node:assert/strict';
import test from 'node:test';
import { EngineCounters } from './obs.js';

test('engine counters emit deltas and drain latency samples', () => {
  const counters = new EngineCounters();

  counters.recordMove(false);
  counters.recordMove(true);
  counters.recordMoveFailure();
  counters.recordReservationFailure({ busy: false });
  counters.recordReservationFailure({ busy: true });
  counters.recordReservationReleaseFailure();
  counters.recordTurnStarted();
  counters.recordTurnCompleted({
    decisionSource: 'deadline-guard',
    elapsedMs: 20,
    queueWaitMs: 5,
  });
  counters.recordTurnStarted();
  counters.recordTurnFailed({
    elapsedMs: 3_001,
    error: 'pool request timeout 3000ms',
    queueWaitMs: 40,
  });
  counters.recordPythonPoolError();
  counters.recordPythonPoolError({ timeout: true });

  const first = counters.snapshot();
  assert.equal(first.moves, 2);
  assert.equal(first.movesDelta, 2);
  assert.equal(first.fallbacks, 1);
  assert.equal(first.fallbacksDelta, 1);
  assert.equal(first.rate, 0.5);
  assert.equal(first.moveFailures, 1);
  assert.equal(first.moveFailuresDelta, 1);
  assert.equal(first.reservationFailures, 2);
  assert.equal(first.reservationFailuresDelta, 2);
  assert.equal(first.reservationBusy, 1);
  assert.equal(first.reservationBusyDelta, 1);
  assert.equal(first.reservationReleaseFailures, 1);
  assert.equal(first.reservationReleaseFailuresDelta, 1);
  assert.equal(first.turnsStarted, 2);
  assert.equal(first.turnsStartedDelta, 2);
  assert.equal(first.turnsCompleted, 1);
  assert.equal(first.turnsCompletedDelta, 1);
  assert.equal(first.turnsFailed, 1);
  assert.equal(first.turnsFailedDelta, 1);
  assert.equal(first.turnTimeouts, 1);
  assert.equal(first.turnTimeoutsDelta, 1);
  assert.equal(first.deadlineGuards, 1);
  assert.equal(first.deadlineGuardsDelta, 1);
  assert.equal(first.turnLatencySamples, 2);
  assert.equal(first.turnElapsedP50, 20);
  assert.equal(first.turnElapsedP95, 3_001);
  assert.equal(first.turnElapsedMax, 3_001);
  assert.equal(first.turnQueueWaitP50, 5);
  assert.equal(first.turnQueueWaitP95, 40);
  assert.equal(first.turnQueueWaitMax, 40);
  assert.equal(first.pythonPoolErrors, 2);
  assert.equal(first.pythonPoolErrorsDelta, 2);
  assert.equal(first.pythonPoolTimeouts, 1);
  assert.equal(first.pythonPoolTimeoutsDelta, 1);

  const second = counters.snapshot();
  assert.equal(second.moves, 2);
  assert.equal(second.movesDelta, 0);
  assert.equal(second.fallbacksDelta, 0);
  assert.equal(second.turnsFailed, 1);
  assert.equal(second.turnsFailedDelta, 0);
  assert.equal(second.turnLatencySamples, 0);
  assert.equal(second.turnElapsedP95, null);
  assert.equal(second.turnQueueWaitP95, null);
});

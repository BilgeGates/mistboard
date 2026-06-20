import assert from 'node:assert/strict';
import test from 'node:test';
import type { BughouseSeatId } from '@mistboard/game';
import { clearBughouseClockTimer, scheduleBughouseClockTimer } from './bughouse-lifecycle.js';
import { createBughouseRuntimeRoom } from './bughouse-runtime.js';

test('bughouse lifecycle schedules and clears the next active board clock', () => {
  const room = createBughouseRuntimeRoom('bugh_lifecycle_clock', {
    now: 1_000,
    timeControl: { initialMs: 60_000, incrementMs: 2_000 },
  });

  scheduleBughouseClockTimer(room, { now: () => 1_500 });

  assert.ok(room.clockTimer);
  clearBughouseClockTimer(room);
  assert.equal(room.clockTimer, null);
});

test('bughouse lifecycle leaves clock timer unset without an active clock', () => {
  const room = createBughouseRuntimeRoom('bugh_lifecycle_no_clock', {
    now: 1_000,
    timeControl: { initialMs: 60_000, incrementMs: 2_000 },
    deferClockStart: true,
  });

  scheduleBughouseClockTimer(room, { now: () => 1_500 });

  assert.equal(room.clockTimer, null);
});

test('bughouse lifecycle expires a due active board clock', async () => {
  const room = createBughouseRuntimeRoom('bugh_lifecycle_expire', {
    now: 1_000,
    timeControl: { initialMs: 0, incrementMs: 0 },
  });
  const expired: Array<{ seat: BughouseSeatId; at: number }> = [];

  scheduleBughouseClockTimer(room, {
    now: () => 1_000,
    expireClock: (_room, seat, at) => {
      expired.push({ seat, at });
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(expired.length, 1);
  assert.equal(expired[0]?.seat, 'A:white');
  assert.equal(room.clockTimer !== null, true);
  clearBughouseClockTimer(room);
});

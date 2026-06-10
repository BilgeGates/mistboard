import {
  claimMoveJob,
  completeMoveJob,
  enqueueMoveJob,
  getMoveJobResult,
  reapStaleMoveJobs,
} from './persistence-engine-jobs.js';
import {
  countActiveEngineSeats,
  getEnginePreferredWorker,
  reapStaleEngineSeats,
  releaseEngineSeat,
  reserveEngineSeat,
  setEnginePreferredWorker,
} from './persistence-engine-seats.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';

definePersistenceTests('engine-affinity', () => {
  test('reserveEngineSeat caps globally and is idempotent per room', async () => {
    const r1 = await reserveEngineSeat('room-1', 'eng', 'black', 2);
    assert.deepEqual([r1.reserved, r1.activeSeats], [true, 1]);
    const r2 = await reserveEngineSeat('room-2', 'eng', 'black', 2);
    assert.deepEqual([r2.reserved, r2.activeSeats], [true, 2]);

    const overCap = await reserveEngineSeat('room-3', 'eng', 'black', 2);
    assert.deepEqual([overCap.reserved, overCap.activeSeats], [false, 2]);

    const idempotent = await reserveEngineSeat('room-1', 'eng', 'black', 2);
    assert.deepEqual([idempotent.reserved, idempotent.activeSeats], [true, 2]);

    // Different engine_id has its own cap.
    const other = await reserveEngineSeat('room-4', 'eng2', 'white', 1);
    assert.equal(other.reserved, true);

    await releaseEngineSeat('room-1');
    assert.equal(await countActiveEngineSeats('eng'), 1);
  });

  test('reapStaleEngineSeats releases only stale seats', async () => {
    await reserveEngineSeat('room-a', 'eng', 'black', 5);
    assert.equal(await reapStaleEngineSeats(60_000), 0); // fresh → not stale
    assert.equal(await reapStaleEngineSeats(-1), 1); // everything older than now()+1ms → stale
    assert.equal(await countActiveEngineSeats('eng'), 0);
  });

  test('preferred-worker affinity hint round-trips', async () => {
    await reserveEngineSeat('room-x', 'eng', 'black', 5);
    assert.equal(await getEnginePreferredWorker('room-x'), null);
    await setEnginePreferredWorker('room-x', 'worker-7');
    assert.equal(await getEnginePreferredWorker('room-x'), 'worker-7');
  });

  test('move queue: enqueue → claim (prefer-mine) → complete → result', async () => {
    const reqA = { game: 'a' };
    const idA = await enqueueMoveJob({
      roomId: 'r1',
      engineId: 'eng',
      ply: 1,
      request: reqA,
      preferredWorker: 'w1',
    });
    const idB = await enqueueMoveJob({
      roomId: 'r2',
      engineId: 'eng',
      ply: 1,
      request: { game: 'b' },
      preferredWorker: 'w2',
    });

    // w1 prefers its own tagged job.
    const first = await claimMoveJob('w1');
    assert.equal(first?.id, idA);
    assert.deepEqual(first?.request, reqA);

    assert.deepEqual(await getMoveJobResult(idA), { status: 'claimed' });
    await completeMoveJob(idA, { move: 'e2e4' });
    assert.deepEqual(await getMoveJobResult(idA), { status: 'done', result: { move: 'e2e4' } });

    // No more of its own → falls back to any queued job (idB, tagged for w2).
    const second = await claimMoveJob('w1');
    assert.equal(second?.id, idB);

    // Drained.
    assert.equal(await claimMoveJob('w1'), null);
  });

  test('reapStaleMoveJobs requeues stale claims under the attempt cap', async () => {
    const id = await enqueueMoveJob({
      roomId: 'r',
      engineId: 'eng',
      ply: 1,
      request: {},
      preferredWorker: null,
    });
    await claimMoveJob('w1'); // attempts -> 1
    const reaped = await reapStaleMoveJobs(-1, 3); // stale now, under cap → requeue
    assert.deepEqual(reaped, { requeued: 1, failed: 0 });
    assert.deepEqual(await getMoveJobResult(id), { status: 'queued' });
  });
});

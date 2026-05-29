import { DARK_XIANGQI_SPEC_ID } from '@mistboard/game';
import type { DarkXiangqiEvent } from './dark-xiangqi-runtime.js';
import { appendRoomEvent, loadRoomEvents } from './persistence.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';

test('appendRoomEvent rejects mismatched room ids before writing', async () => {
  await assert.rejects(
    appendRoomEvent('dxq_expected', 0, {
      type: 'room-created',
      at: 1,
      roomId: 'dxq_other',
      gameSpecId: DARK_XIANGQI_SPEC_ID,
    } satisfies DarkXiangqiEvent),
    /event roomId mismatch/,
  );
});

definePersistenceTests('room events', () => {
  test('generic room events round-trip Dark Xiangqi canonical events', async () => {
    const events: DarkXiangqiEvent[] = [
      {
        type: 'room-created',
        at: 1,
        roomId: 'dxq_persisted',
        gameSpecId: DARK_XIANGQI_SPEC_ID,
      },
      {
        type: 'move-played',
        at: 2,
        roomId: 'dxq_persisted',
        color: 'red',
        move: { from: 'b3', to: 'b4' },
      },
    ];

    for (const [seq, event] of events.entries()) {
      await appendRoomEvent('dxq_persisted', seq, event);
    }

    assert.deepEqual(await loadRoomEvents<DarkXiangqiEvent>('dxq_persisted'), events);
    assert.equal(await loadRoomEvents<DarkXiangqiEvent>('dxq_missing'), null);
  });
});

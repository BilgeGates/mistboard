import assert from 'node:assert/strict';
import test from 'node:test';
import { DARK_MINI_XIANGQI_SPEC_ID } from '@mistboard/game';
import { buildDarkMiniXiangqiPublicationJson } from './dark-mini-xiangqi-export.js';
import type { DarkMiniXiangqiEvent } from './dark-mini-xiangqi-runtime.js';
import type { GameParticipant, RecentEveGameRecord } from './persistence.js';

const ROOM_ID = 'dmxq_export';

function participant(color: 'red' | 'black'): GameParticipant {
  return {
    color,
    displayName: color === 'red' ? 'Red' : 'Black',
    subjectType: 'guest',
    subjectId: null,
    visibility: 'private',
  };
}

function gameRecord(overrides: Partial<RecentEveGameRecord> = {}): RecentEveGameRecord {
  return {
    roomId: ROOM_ID,
    variant: DARK_MINI_XIANGQI_SPEC_ID,
    mode: 'pvp',
    result: 'black-wins',
    termination: 'resignation',
    plyCount: 2,
    startedAt: new Date(1),
    endedAt: new Date(6),
    whiteName: null,
    blackName: null,
    corpusId: null,
    rated: false,
    visibility: 'private',
    participants: [participant('red'), participant('black')],
    jobId: null,
    gameIndex: null,
    whiteEngineId: null,
    blackEngineId: null,
    timeControl: null,
    initialMs: null,
    incrementMs: null,
    ...overrides,
  };
}

function timedEvents(): DarkMiniXiangqiEvent[] {
  return [
    {
      type: 'room-created',
      at: 1,
      roomId: ROOM_ID,
      gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    {
      type: 'move-played',
      at: 4,
      roomId: ROOM_ID,
      color: 'red',
      move: { from: 'a2', to: 'a3' },
      clock: {
        activeColor: 'black',
        incrementMs: 2_000,
        initialMs: 180_000,
        remainingMs: { red: 181_000, black: 180_000 },
        runningSince: 4,
      },
    },
    {
      type: 'move-played',
      at: 5,
      roomId: ROOM_ID,
      color: 'black',
      move: { from: 'a6', to: 'a5' },
      clock: {
        activeColor: 'red',
        incrementMs: 2_000,
        initialMs: 180_000,
        remainingMs: { red: 181_000, black: 179_000 },
        runningSince: 5,
      },
    },
    { type: 'seat-resigned', at: 6, roomId: ROOM_ID, color: 'red' },
  ];
}

test('Dark Mini Xiangqi export emits an honest red/black publication', () => {
  const pub = buildDarkMiniXiangqiPublicationJson(gameRecord(), timedEvents());

  assert.equal(pub.variant, DARK_MINI_XIANGQI_SPEC_ID);
  assert.equal(pub.result, 'black');
  assert.equal(pub.termination, 'resignation');
  assert.equal(pub.ply_count, 2);
  assert.equal(pub.license, 'CC BY 4.0');
  assert.deepEqual(pub.players, {
    red: { handle: 'Red' },
    black: { handle: 'Black' },
  });
  assert.match(pub.source.game_url, /\/dark-mini-xiangqi\/game\/dmxq_export$/);
});

test('Dark Mini Xiangqi export derives time control from the room-created event', () => {
  const pub = buildDarkMiniXiangqiPublicationJson(gameRecord(), timedEvents());
  assert.deepEqual(pub.time_control, {
    initial_ms: 180_000,
    increment_ms: 2_000,
    label: '180+2',
  });
});

test('Dark Mini Xiangqi export lists coordinate UCI plies with per-seat clocks', () => {
  const pub = buildDarkMiniXiangqiPublicationJson(gameRecord(), timedEvents());
  assert.deepEqual(pub.plies, [
    {
      ply: 1,
      mover: 'red',
      uci: 'a2a3',
      red_clock_ms_after: 181_000,
      black_clock_ms_after: 180_000,
    },
    {
      ply: 2,
      mover: 'black',
      uci: 'a6a5',
      red_clock_ms_after: 181_000,
      black_clock_ms_after: 179_000,
    },
  ]);
});

test('Dark Mini Xiangqi export reports untimed when no time control is present', () => {
  const events: DarkMiniXiangqiEvent[] = [
    { type: 'room-created', at: 1, roomId: ROOM_ID, gameSpecId: DARK_MINI_XIANGQI_SPEC_ID },
    { type: 'move-played', at: 2, roomId: ROOM_ID, color: 'red', move: { from: 'a2', to: 'a3' } },
    { type: 'seat-resigned', at: 3, roomId: ROOM_ID, color: 'black' },
  ];
  const pub = buildDarkMiniXiangqiPublicationJson(
    gameRecord({ result: 'red-wins', plyCount: 1 }),
    events,
  );
  assert.equal(pub.result, 'red');
  assert.equal(pub.time_control.label, 'untimed');
  assert.equal(pub.plies[0]?.red_clock_ms_after, null);
});

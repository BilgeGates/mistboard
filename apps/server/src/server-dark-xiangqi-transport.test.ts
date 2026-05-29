import assert from 'node:assert/strict';
import test from 'node:test';
import { DARK_XIANGQI_SPEC_ID, type XiangqiColor } from '@mistboard/game';
import type { DarkXiangqiEvent, DarkXiangqiRuntimeRoom } from './dark-xiangqi-runtime.js';
import {
  broadcastDarkXiangqiEventAppended,
  broadcastDarkXiangqiSnapshot,
  type DarkXiangqiTransportClient,
  type DarkXiangqiTransportRoom,
  sendDarkXiangqiPayload,
} from './server-dark-xiangqi-transport.js';

test('Dark Xiangqi transport skips displaced clients', () => {
  const client = transportClient('red', { displaced: true });

  sendDarkXiangqiPayload(client, { type: 'snapshot' });

  assert.equal(client.sent.length, 0);
});

test('Dark Xiangqi transport broadcasts redacted snapshots to active clients only', () => {
  const red = transportClient('red');
  const black = transportClient('black');
  const displaced = transportClient('black', { displaced: true });
  const room = transportRoomFixture({
    id: 'dxq_transport_snapshot',
    clients: [red, black, displaced],
  });

  broadcastDarkXiangqiSnapshot(room);

  assert.equal(red.sent.length, 1);
  assert.equal(black.sent.length, 1);
  assert.equal(displaced.sent.length, 0);
  assert.equal(red.frames[0]?.seat, 'red');
  assert.equal(black.frames[0]?.seat, 'black');
  assert.equal(red.frames[0]?.gameSpecId, DARK_XIANGQI_SPEC_ID);
});

test('Dark Xiangqi transport hides opponent move event payloads in live event frames', () => {
  const red = transportClient('red');
  const black = transportClient('black');
  const event: DarkXiangqiEvent = {
    type: 'move-played',
    at: 2,
    roomId: 'dxq_transport_event',
    color: 'red',
    move: { from: 'b3', to: 'b4' },
  };
  const room = transportRoomFixture({
    id: 'dxq_transport_event',
    clients: [red, black],
    events: [
      {
        type: 'room-created',
        at: 1,
        roomId: 'dxq_transport_event',
        gameSpecId: DARK_XIANGQI_SPEC_ID,
      },
      event,
    ],
  });

  broadcastDarkXiangqiEventAppended(room, event, 1);

  assert.equal(red.frames[0]?.type, 'event-appended');
  assert.equal(black.frames[0]?.type, 'event-appended');
  assert.deepEqual(red.frames[0]?.event, event);
  assert.equal(black.frames[0]?.event, undefined);
  assert.equal(JSON.stringify(black.frames[0]).includes('"b3"'), false);
  assert.equal(JSON.stringify(black.frames[0]).includes('"b4"'), false);
});

test('Dark Xiangqi transport sends terminal snapshots instead of event-appended frames', () => {
  const red = transportClient('red');
  const event: DarkXiangqiEvent = {
    type: 'seat-resigned',
    at: 2,
    roomId: 'dxq_transport_terminal',
    color: 'black',
  };
  const room = transportRoomFixture({
    id: 'dxq_transport_terminal',
    clients: [red],
    status: { type: 'finished', winner: 'red', reason: 'resignation' },
    events: [
      {
        type: 'room-created',
        at: 1,
        roomId: 'dxq_transport_terminal',
        gameSpecId: DARK_XIANGQI_SPEC_ID,
      },
      event,
    ],
  });

  broadcastDarkXiangqiEventAppended(room, event, 1);

  assert.equal(red.frames[0]?.type, 'snapshot');
  assert.equal(red.frames[0]?.seq, undefined);
});

type SentFrame = Record<string, unknown>;
type TestTransportClient = DarkXiangqiTransportClient & {
  frames: SentFrame[];
  sent: string[];
};

function transportClient(
  seat: XiangqiColor,
  options: { displaced?: boolean } = {},
): TestTransportClient {
  const client: TestTransportClient = {
    displaced: options.displaced ?? false,
    frames: [],
    id: `${seat}-client`,
    seat,
    sent: [],
    socket: {
      send(payload: string) {
        client.sent.push(payload);
        client.frames.push(JSON.parse(payload) as SentFrame);
      },
    },
  };
  return client;
}

function transportRoomFixture({
  id,
  clients,
  events,
  status,
}: {
  id: string;
  clients: TestTransportClient[];
  events?: DarkXiangqiEvent[];
  status?: DarkXiangqiRuntimeRoom['projection']['state']['status'];
}): DarkXiangqiTransportRoom<TestTransportClient> {
  return {
    kind: 'dark-xiangqi',
    id,
    clients: new Set(clients),
    events: events ?? [
      { type: 'room-created', at: 1, roomId: id, gameSpecId: DARK_XIANGQI_SPEC_ID },
    ],
    projection: {
      roomId: id,
      gameSpecId: DARK_XIANGQI_SPEC_ID,
      state: {
        id,
        board: {
          a1: { color: 'red', role: 'chariot' },
          a10: { color: 'black', role: 'chariot' },
          e1: { color: 'red', role: 'general' },
          e10: { color: 'black', role: 'general' },
        },
        lastMove: { from: 'b3', to: 'b4' },
        moveNumber: 1,
        positionCounts: {},
        progressClock: 0,
        status: status ?? { type: 'playing', turn: 'black' },
      },
      seats: { red: 'red-client', black: 'black-client' },
    },
    gameSpecId: DARK_XIANGQI_SPEC_ID,
    abortTimer: null,
    abortDeadline: null,
    abortPhase: null,
    forfeitTimer: null,
    forfeitDeadline: null,
    forfeitSeat: null,
    gameEndRecorded: status?.type === 'finished',
    pendingWrites: Promise.resolve(),
    seatTokens: {},
  };
}

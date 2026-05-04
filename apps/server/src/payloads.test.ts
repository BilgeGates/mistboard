import assert from 'node:assert/strict';
import test from 'node:test';
import { bidForWhiteVariant, fogOfWarVariant, type GameEvent, type GameProjection } from '@bichess/game';
import { snapshotPayload, type SnapshotClient, type SnapshotRoom } from './payloads.js';

test('Fog of War snapshot payload does not include hidden opponent pieces or move events', () => {
  const state = {
    ...fogOfWarVariant.createInitialState('fog-payload'),
    board: {
      a1: { color: 'white', role: 'rook' },
      e1: { color: 'white', role: 'king' },
      a4: { color: 'black', role: 'rook' },
      e8: { color: 'black', role: 'king' },
      h8: { color: 'black', role: 'queen' },
    },
    status: { type: 'playing', turn: 'white' } as const,
    castlingRights: [],
  } satisfies ReturnType<typeof fogOfWarVariant.createInitialState>;
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'fog-payload',
      variant: 'fog-of-war',
      offer: [],
    },
    {
      type: 'move-played',
      at: 2,
      roomId: 'fog-payload',
      color: 'black',
      move: { from: 'h8', to: 'h7' },
    },
  ];
  const projection: GameProjection = {
    roomId: 'fog-payload',
    variant: 'fog-of-war',
    offer: [],
    state,
    seats: { white: 'white-client', black: 'black-client' },
    selections: {},
    bids: {},
    bidResolution: null,
    resolvedStartId: null,
  };
  const room: SnapshotRoom = {
    id: 'fog-payload',
    clients: { size: 2 },
    events,
    projection,
  };
  const client: SnapshotClient = {
    devViews: false,
    id: 'white-client',
    seat: 'white',
    solo: false,
  };

  const payload = JSON.stringify(snapshotPayload(room, client));

  assert.match(payload, /"a4"/);
  assert.doesNotMatch(payload, /"h8"/);
  assert.doesNotMatch(payload, /queen/);
  assert.doesNotMatch(payload, /move-played/);
  assert.doesNotMatch(payload, /h7/);
});

test('live Fog of War spectator payload has no board or move events', () => {
  const room = fogRoomFixture({ status: { type: 'playing', turn: 'white' } });
  const payload = snapshotPayload(room, {
    devViews: false,
    id: 'spectator-client',
    seat: 'spectator',
    solo: false,
  });

  assert.deepEqual(payload.state.board, {});
  assert.deepEqual(payload.state.visibleSquares, []);
  assert.deepEqual(payload.state.legalMoves, []);
  assert.equal(payload.events.some((event) => event.type === 'move-played'), false);
});

test('finished Fog of War payload exposes full-truth replay', () => {
  const room = fogRoomFixture({
    status: { type: 'finished', winner: 'white', reason: 'king-captured' },
  });
  const payload = JSON.stringify(snapshotPayload(room, {
    devViews: false,
    id: 'spectator-client',
    seat: 'spectator',
    solo: false,
  }));

  assert.match(payload, /"move-played"/);
  assert.match(payload, /"h8"/);
  assert.match(payload, /queen/);
});

test('dev Fog of War payload can include player, opponent, and true views', () => {
  const room = fogRoomFixture({ status: { type: 'playing', turn: 'white' } });
  const payload = snapshotPayload(room, {
    devViews: true,
    id: 'white-client',
    seat: 'white',
    solo: false,
  });

  assert.equal(payload.devViews?.opponent, 'black');
  assert.deepEqual(payload.devViews?.player.board.a1, { color: 'white', role: 'rook' });
  assert.deepEqual(payload.devViews?.opponentView.board.h8, { color: 'black', role: 'queen' });
  assert.deepEqual(payload.devViews?.truth.board.h8, { color: 'black', role: 'queen' });
  assert.equal(payload.devViews?.truth.visibleSquares.length, 64);
});

test('regular Fog of War payload does not include dev views', () => {
  const room = fogRoomFixture({ status: { type: 'playing', turn: 'white' } });
  const payload = snapshotPayload(room, {
    devViews: false,
    id: 'white-client',
    seat: 'white',
    solo: false,
  });

  assert.equal(payload.devViews, null);
});

test('pregame Bid For White payload exposes only the client bid', () => {
  const room = bidRoomFixture({ status: { type: 'pregame' } });
  const payload = snapshotPayload(room, {
    devViews: false,
    id: 'white-client',
    seat: 'white',
    solo: false,
  });
  const body = JSON.stringify(payload);

  assert.deepEqual(payload.bids, { white: 10_000 });
  assert.equal(payload.bidResolution, null);
  assert.doesNotMatch(body, /30000/);
  assert.equal(payload.events.some((event) => event.type === 'bid-submitted'), false);
});

test('resolved Bid For White payload exposes bids and resolution', () => {
  const room = bidRoomFixture({ status: { type: 'playing', turn: 'white' } });
  const payload = snapshotPayload(room, {
    devViews: false,
    id: 'black-client',
    seat: 'white',
    solo: false,
  });

  assert.deepEqual(payload.bids, { white: 10_000, black: 30_000 });
  assert.deepEqual(payload.bidResolution, {
    bids: { white: 10_000, black: 30_000 },
    blackSeat: 'white',
    winner: 'black',
    whiteSeat: 'black',
    winningBidMs: 30_000,
  });
});

function fogRoomFixture({ status }: { status: ReturnType<typeof fogOfWarVariant.createInitialState>['status'] }): SnapshotRoom {
  const state = {
    ...fogOfWarVariant.createInitialState('fog-payload'),
    board: {
      a1: { color: 'white', role: 'rook' },
      e1: { color: 'white', role: 'king' },
      a4: { color: 'black', role: 'rook' },
      e8: { color: 'black', role: 'king' },
      h8: { color: 'black', role: 'queen' },
    },
    status,
    castlingRights: [],
  } satisfies ReturnType<typeof fogOfWarVariant.createInitialState>;
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'fog-payload',
      variant: 'fog-of-war',
      offer: [],
    },
    {
      type: 'move-played',
      at: 2,
      roomId: 'fog-payload',
      color: 'black',
      move: { from: 'h8', to: 'h7' },
    },
  ];
  const projection: GameProjection = {
    roomId: 'fog-payload',
    variant: 'fog-of-war',
    offer: [],
    state,
    seats: { white: 'white-client', black: 'black-client' },
    selections: {},
    bids: {},
    bidResolution: null,
    resolvedStartId: null,
  };
  return {
    id: 'fog-payload',
    clients: { size: 2 },
    events,
    projection,
  };
}

function bidRoomFixture({ status }: { status: ReturnType<typeof bidForWhiteVariant.createInitialState>['status'] }): SnapshotRoom {
  const state = {
    ...bidForWhiteVariant.createInitialState('bid-payload'),
    status,
  } satisfies ReturnType<typeof bidForWhiteVariant.createInitialState>;
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'bid-payload',
      variant: 'bid-for-white',
      offer: [],
    },
    {
      type: 'bid-submitted',
      at: 2,
      roomId: 'bid-payload',
      color: 'white',
      bidMs: 10_000,
    },
    {
      type: 'bid-submitted',
      at: 3,
      roomId: 'bid-payload',
      color: 'black',
      bidMs: 30_000,
    },
    {
      type: 'bid-resolved',
      at: 4,
      roomId: 'bid-payload',
      bids: { white: 10_000, black: 30_000 },
      blackSeat: 'white',
      winner: 'black',
      whiteSeat: 'black',
      winningBidMs: 30_000,
    },
  ];
  const projection: GameProjection = {
    roomId: 'bid-payload',
    variant: 'bid-for-white',
    offer: [],
    state,
    seats: status.type === 'pregame'
      ? { white: 'white-client', black: 'black-client' }
      : { white: 'black-client', black: 'white-client' },
    selections: {},
    bids: { white: 10_000, black: 30_000 },
    bidResolution: status.type === 'pregame'
      ? null
      : {
        bids: { white: 10_000, black: 30_000 },
        blackSeat: 'white',
        winner: 'black',
        whiteSeat: 'black',
        winningBidMs: 30_000,
      },
    resolvedStartId: null,
  };
  return {
    id: 'bid-payload',
    clients: { size: 2 },
    events,
    projection,
  };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bidForWhiteVariant,
  fogOfWarVariant,
  generateChess960Starts,
  replayGameEvents,
  type GameEvent,
  type GameProjection,
} from '@mistboard/game';
import { snapshotPayload, type SnapshotClient, type SnapshotRoom } from './payloads.js';
import { eventReplayResponse } from './server-policy.js';

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
    offers: {},
    state,
    seats: { white: 'white-client', black: 'black-client' },
    selections: {},
    bids: {},
    bidResolution: null,
    resolvedStartId: null,
    resolvedStartIds: {},
    paused: false,
    pausedAt: null,
    pauseReason: null,
  };
  const room: SnapshotRoom = {
    id: 'fog-payload',
    clients: new Set([{ seat: 'white', displaced: false }, { seat: 'black', displaced: false }]),
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

test('live Fog of War seated payload exposes own last move and own move event', () => {
  const room = lastMoveRoomFixture();
  const payload = snapshotPayload(room, {
    devViews: false,
    id: 'white-client',
    seat: 'white',
    solo: false,
  });

  assert.deepEqual(payload.state.lastMove, { from: 'e2', to: 'e4' });
  assert.deepEqual(
    payload.events.filter((event) => event.type === 'move-played'),
    [{
      type: 'move-played',
      at: 2,
      roomId: 'fog-last-move-payload',
      color: 'white',
      move: { from: 'e2', to: 'e4' },
    }],
  );
});

test('live Fog of War seated payload does not expose opponent last-move coordinates', () => {
  const room = lastMoveRoomFixture();
  const payload = snapshotPayload(room, {
    devViews: false,
    id: 'black-client',
    seat: 'black',
    solo: false,
  });

  assert.deepEqual(payload.state.board.e4, { color: 'white', role: 'pawn' });
  assert.equal(payload.state.lastMove, undefined);
  assert.equal(payload.events.some((event) => event.type === 'move-played'), false);
});

test('live Fog Draft960 payload hides opponent offer and selection', () => {
  const starts = generateChess960Starts();
  const whiteOffer = starts.slice(0, 3);
  const blackOffer = starts.slice(3, 6);
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'fog-draft-payload',
      variant: 'fog-of-war',
      offer: whiteOffer,
      offers: {
        white: whiteOffer,
        black: blackOffer,
      },
    },
    {
      type: 'seat-assigned',
      at: 2,
      roomId: 'fog-draft-payload',
      clientId: 'white-client',
      seat: 'white',
    },
    {
      type: 'seat-assigned',
      at: 3,
      roomId: 'fog-draft-payload',
      clientId: 'black-client',
      seat: 'black',
    },
    {
      type: 'draft-start-selected',
      at: 4,
      roomId: 'fog-draft-payload',
      color: 'white',
      startId: whiteOffer[1]!.id,
    },
    {
      type: 'draft-start-selected',
      at: 5,
      roomId: 'fog-draft-payload',
      color: 'black',
      startId: blackOffer[1]!.id,
    },
    {
      type: 'draft-start-resolved',
      at: 6,
      roomId: 'fog-draft-payload',
      startIds: {
        white: whiteOffer[1]!.id,
        black: blackOffer[1]!.id,
      },
    },
  ];
  const room: SnapshotRoom = {
    id: 'fog-draft-payload',
    clients: new Set([{ seat: 'white', displaced: false }, { seat: 'black', displaced: false }]),
    events,
    projection: replayGameEvents(events),
  };

  const payload = snapshotPayload(room, {
    devViews: false,
    id: 'white-client',
    seat: 'white',
    solo: false,
  });
  const visibleEventTypes = payload.events.map((event) => event.type);
  const roomCreated = payload.events.find((event) => event.type === 'room-created');

  assert.deepEqual(payload.offer.map((start) => start.id), whiteOffer.map((start) => start.id));
  assert.deepEqual(payload.offers, { white: whiteOffer });
  assert.deepEqual(payload.selections, { white: whiteOffer[1]!.id });
  assert.equal(payload.resolvedStartId, null);
  assert.deepEqual(payload.resolvedStartIds, { white: whiteOffer[1]!.id });
  assert.deepEqual(visibleEventTypes, ['room-created', 'seat-assigned', 'seat-assigned', 'draft-start-selected']);
  assert.equal(roomCreated?.type, 'room-created');
  if (roomCreated?.type === 'room-created') {
    assert.deepEqual(roomCreated.offer.map((start) => start.id), whiteOffer.map((start) => start.id));
    assert.deepEqual(roomCreated.offers, { white: whiteOffer });
  }

  const json = JSON.stringify(payload);
  assert.doesNotMatch(json, new RegExp(`"id":${blackOffer[1]!.id}\\b`));
  assert.doesNotMatch(json, new RegExp(`"fenPlacement":"${blackOffer[1]!.fenPlacement}"`));
  assert.doesNotMatch(json, /draft-start-resolved/);
});

test('live fog spectator payload is empty regardless of mode (PvP, PvE, EvE)', () => {
  // Uniform rule: live games are private to seated players. Spectators are
  // rejected at the connection layer; if a SnapshotClient with seat='spectator'
  // ever reaches snapshotPayload for a live fog game, defense-in-depth returns
  // an empty view rather than leaking any board state. This test pins the
  // defense-in-depth behavior for all three modes.
  const fixtures = [
    {
      label: 'pvp',
      room: replayRoomFixture({
        roomId: 'pvp-spectator-empty',
        seats: { white: 'human-white', black: 'human-black' },
        mode: 'pvp',
      }),
    },
    {
      label: 'pve',
      room: replayRoomFixture({
        roomId: 'pve-spectator-empty',
        seats: { white: 'human-white', black: 'random-engine' },
        mode: 'pve',
        pveEngineId: 'builtin-random-legal',
      }),
    },
    {
      label: 'eve',
      room: replayRoomFixture({
        roomId: 'eve-spectator-empty',
        seats: { white: 'engine:white', black: 'engine:black' },
        mode: 'eve',
      }),
    },
  ];

  for (const { label, room } of fixtures) {
    const payload = snapshotPayload(room, spectatorClient());
    assert.deepEqual(payload.state.board, {}, `${label} board not empty`);
    assert.deepEqual(payload.state.visibleSquares, [], `${label} visibleSquares not empty`);
    assert.deepEqual(payload.state.legalMoves, [], `${label} legalMoves not empty`);
    assert.equal(payload.events.some((event) => event.type === 'move-played'), false, `${label} leaked move-played`);
  }
});

test('live fog replay API returns 403 for every mode', () => {
  const pveRoom = replayRoomFixture({
    roomId: 'pve-policy-alignment',
    seats: { white: 'human-white', black: 'random-engine' },
    mode: 'pve',
  });
  assert.deepEqual(eventReplayResponse(pveRoom.events), { status: 403, body: { error: 'game_not_public' } });

  const eveRoom = replayRoomFixture({
    roomId: 'eve-policy-alignment',
    seats: { white: 'engine:white', black: 'engine:black' },
    mode: 'eve',
  });
  assert.deepEqual(eventReplayResponse(eveRoom.events), { status: 403, body: { error: 'game_not_public' } });

  const pvpRoom = replayRoomFixture({
    roomId: 'pvp-policy-alignment',
    seats: { white: 'human-white', black: 'human-black' },
    mode: 'pvp',
  });
  assert.deepEqual(eventReplayResponse(pvpRoom.events), { status: 403, body: { error: 'game_not_public' } });
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
    offers: {},
    state,
    seats: { white: 'white-client', black: 'black-client' },
    selections: {},
    bids: {},
    bidResolution: null,
    resolvedStartId: null,
    resolvedStartIds: {},
    paused: false,
    pausedAt: null,
    pauseReason: null,
  };
  return {
    id: 'fog-payload',
    clients: new Set([{ seat: 'white', displaced: false }, { seat: 'black', displaced: false }]),
    events,
    projection,
  };
}

function lastMoveRoomFixture(): SnapshotRoom {
  const state = {
    ...fogOfWarVariant.createInitialState('fog-last-move-payload'),
    board: {
      e1: { color: 'white', role: 'king' },
      e4: { color: 'white', role: 'pawn' },
      e8: { color: 'black', role: 'rook' },
      h8: { color: 'black', role: 'king' },
    },
    status: { type: 'playing', turn: 'black' } as const,
    castlingRights: [],
    lastMove: { from: 'e2', to: 'e4' },
  } satisfies ReturnType<typeof fogOfWarVariant.createInitialState>;
  const events: GameEvent[] = [
    {
      type: 'room-created',
      at: 1,
      roomId: 'fog-last-move-payload',
      variant: 'fog-of-war',
      offer: [],
    },
    {
      type: 'move-played',
      at: 2,
      roomId: 'fog-last-move-payload',
      color: 'white',
      move: { from: 'e2', to: 'e4' },
    },
  ];
  return {
    id: 'fog-last-move-payload',
    clients: new Set([{ seat: 'white', displaced: false }, { seat: 'black', displaced: false }]),
    events,
    projection: {
      roomId: 'fog-last-move-payload',
      variant: 'fog-of-war',
      offer: [],
      offers: {},
      state,
      seats: { white: 'white-client', black: 'black-client' },
      selections: {},
      bids: {},
      bidResolution: null,
      resolvedStartId: null,
      resolvedStartIds: {},
    paused: false,
    pausedAt: null,
    pauseReason: null,
    },
  };
}

function replayRoomFixture({
  mode,
  pveEngineId,
  roomId,
  seats,
}: {
  mode: SnapshotRoom['mode'];
  pveEngineId?: string | null;
  roomId: string;
  seats: { white: string; black: string };
}): SnapshotRoom {
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId, variant: 'fog-of-war', offer: [] },
    { type: 'seat-assigned', at: 1, roomId, clientId: seats.white, seat: 'white' },
    { type: 'seat-assigned', at: 1, roomId, clientId: seats.black, seat: 'black' },
    { type: 'move-played', at: 2, roomId, color: 'white', move: { from: 'e2', to: 'e4' } },
    { type: 'move-played', at: 3, roomId, color: 'black', move: { from: 'e7', to: 'e5' } },
  ];
  return {
    id: roomId,
    clients: new Set([{ seat: 'white', displaced: false }, { seat: 'black', displaced: false }, { seat: 'spectator', displaced: false }]),
    events,
    mode,
    projection: replayGameEvents(events),
    pveEngineId,
  };
}

function spectatorClient(): SnapshotClient {
  return {
    devViews: false,
    id: 'spectator-client',
    seat: 'spectator',
    solo: false,
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
    offers: {},
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
    resolvedStartIds: {},
    paused: false,
    pausedAt: null,
    pauseReason: null,
  };
  return {
    id: 'bid-payload',
    clients: new Set([{ seat: 'white', displaced: false }, { seat: 'black', displaced: false }]),
    events,
    projection,
  };
}

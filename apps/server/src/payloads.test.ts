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
    clients: { size: 2 },
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

test('live PvE spectator sees human perspective and not engine move events', () => {
  const room = replayRoomFixture({
    roomId: 'pve-payload',
    seats: { white: 'human-white', black: 'random-engine' },
    mode: 'pve',
  });
  const payload = snapshotPayload(room, {
    devViews: false,
    id: 'spectator-client',
    seat: 'spectator',
    solo: false,
  });

  assert.equal(payload.state.perspective, 'white');
  assert.notDeepEqual(payload.state.board, {});
  assert.equal(
    payload.events.some((event) => event.type === 'move-played' && event.color === 'white'),
    true,
  );
  assert.equal(
    payload.events.some((event) => event.type === 'move-played' && event.color === 'black'),
    false,
  );
});

test('live PvE spectator follows the human perspective when the engine is white', () => {
  const room = replayRoomFixture({
    roomId: 'pve-engine-white-payload',
    seats: { white: 'engine:white', black: 'human-black' },
    mode: 'pve',
  });
  const payload = snapshotPayload(room, {
    devViews: false,
    id: 'spectator-client',
    seat: 'spectator',
    solo: false,
  });

  assert.equal(payload.state.perspective, 'black');
  assert.notDeepEqual(payload.state.board, {});
  assert.equal(
    payload.events.some((event) => event.type === 'move-played' && event.color === 'black'),
    true,
  );
  assert.equal(
    payload.events.some((event) => event.type === 'move-played' && event.color === 'white'),
    false,
  );
});

test('live EvE spectator sees full truth and full event stream', () => {
  const room = replayRoomFixture({
    roomId: 'eve-payload',
    seats: { white: 'engine:white', black: 'engine:black' },
    mode: 'eve',
  });
  const payload = snapshotPayload(room, {
    devViews: false,
    id: 'spectator-client',
    seat: 'spectator',
    solo: false,
  });

  assert.equal(payload.state.visibleSquares.length, 64);
  assert.deepEqual(payload.state.board.h8, { color: 'black', role: 'rook' });
  assert.equal(
    payload.events.filter((event) => event.type === 'move-played').length,
    2,
  );
});

test('live replay API and WebSocket snapshot event policies stay aligned', () => {
  const pveRoom = replayRoomFixture({
    roomId: 'pve-policy-alignment',
    seats: { white: 'human-white', black: 'random-engine' },
    mode: 'pve',
  });
  const pvePayload = snapshotPayload(pveRoom, spectatorClient());
  const pveReplay = eventReplayResponse(pveRoom.events);
  assert.equal(pveReplay.status, 200);
  assert.deepEqual(pvePayload.events, pveReplay.body.events);

  const eveRoom = replayRoomFixture({
    roomId: 'eve-policy-alignment',
    seats: { white: 'engine:white', black: 'engine:black' },
    mode: 'eve',
  });
  const evePayload = snapshotPayload(eveRoom, spectatorClient());
  const eveReplay = eventReplayResponse(eveRoom.events);
  assert.equal(eveReplay.status, 200);
  assert.deepEqual(evePayload.events, eveReplay.body.events);

  const pvpRoom = replayRoomFixture({
    roomId: 'pvp-policy-alignment',
    seats: { white: 'human-white', black: 'human-black' },
    mode: 'pvp',
  });
  const pvpPayload = snapshotPayload(pvpRoom, spectatorClient());
  assert.deepEqual(eventReplayResponse(pvpRoom.events), { status: 403, body: { error: 'game_not_public' } });
  assert.equal(pvpPayload.events.some((event) => event.type === 'move-played'), false);
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
  };
  return {
    id: 'fog-payload',
    clients: { size: 2 },
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
    clients: { size: 2 },
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
    },
  };
}

function replayRoomFixture({
  mode,
  roomId,
  seats,
}: {
  mode: SnapshotRoom['mode'];
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
    clients: { size: 3 },
    events,
    mode,
    projection: replayGameEvents(events),
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
  };
  return {
    id: 'bid-payload',
    clients: { size: 2 },
    events,
    projection,
  };
}

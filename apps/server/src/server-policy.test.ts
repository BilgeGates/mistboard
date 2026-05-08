import assert from 'node:assert/strict';
import test from 'node:test';
import { createClock, expireClock, replayGameEvents, type GameEvent } from '@bichess/game';
import {
  adminDebugTokenFromProtocolHeader,
  canExposeFullEventReplay,
  canObserveLiveRoom,
  eventReplayResponse,
  isAdminDebugToken,
  isAllowedWebSocketOrigin,
  isDatabaseRequired,
  recordMessageTimestamp,
  type RuntimeEnv,
} from './server-policy.js';

test('live persisted events are not public replay data', () => {
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'live-room', variant: 'fog-of-war', offer: [] },
    { type: 'move-played', at: 2, roomId: 'live-room', color: 'white', move: { from: 'e2', to: 'e4' } },
  ];

  assert.equal(canExposeFullEventReplay(events), false);
  assert.deepEqual(eventReplayResponse(events), { status: 403, body: { error: 'game_not_public' } });
});

test('live PvE replay API exposes human moves but redacts engine moves', () => {
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'pve-live', variant: 'fog-of-war', offer: [] },
    { type: 'seat-assigned', at: 1, roomId: 'pve-live', clientId: 'human-white', seat: 'white' },
    { type: 'seat-assigned', at: 1, roomId: 'pve-live', clientId: 'random-engine', seat: 'black' },
    { type: 'move-played', at: 2, roomId: 'pve-live', color: 'white', move: { from: 'e2', to: 'e4' } },
    { type: 'move-played', at: 3, roomId: 'pve-live', color: 'black', move: { from: 'e7', to: 'e5' } },
  ];

  assert.equal(canExposeFullEventReplay(events), false);
  assert.deepEqual(eventReplayResponse(events), {
    status: 200,
    body: { events: events.filter((event) => event.type !== 'move-played' || event.color !== 'black') },
  });
});

test('live EvE replay API exposes full truth stream', () => {
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'eve-live', variant: 'fog-of-war', offer: [] },
    { type: 'seat-assigned', at: 1, roomId: 'eve-live', clientId: 'engine:white', seat: 'white' },
    { type: 'seat-assigned', at: 1, roomId: 'eve-live', clientId: 'engine:black', seat: 'black' },
    { type: 'move-played', at: 2, roomId: 'eve-live', color: 'white', move: { from: 'e2', to: 'e4' } },
    { type: 'move-played', at: 3, roomId: 'eve-live', color: 'black', move: { from: 'e7', to: 'e5' } },
  ];

  assert.equal(canExposeFullEventReplay(events), false);
  assert.deepEqual(eventReplayResponse(events), { status: 200, body: { events } });
});

test('live room observation policy allows EvE and PvE but not PvP', () => {
  const roomCreated: GameEvent = { type: 'room-created', at: 1, roomId: 'policy-room', variant: 'fog-of-war', offer: [] };

  assert.equal(canObserveLiveRoom(replayGameEvents([roomCreated])), false);
  assert.equal(canObserveLiveRoom(replayGameEvents([
    roomCreated,
    { type: 'seat-assigned', at: 1, roomId: 'policy-room', clientId: 'human-white', seat: 'white' },
    { type: 'seat-assigned', at: 1, roomId: 'policy-room', clientId: 'random-engine', seat: 'black' },
  ])), true);
  assert.equal(canObserveLiveRoom(replayGameEvents([
    roomCreated,
    { type: 'seat-assigned', at: 1, roomId: 'policy-room', clientId: 'engine:white', seat: 'white' },
    { type: 'seat-assigned', at: 1, roomId: 'policy-room', clientId: 'engine:black', seat: 'black' },
  ])), true);
});

test('finished persisted events are public replay data', () => {
  const clock = expireClock(createClock(1, 1, 0), 2, 'white');
  assert.ok(clock);
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'finished-room', variant: 'fog-of-war', offer: [] },
    { type: 'clock-expired', at: 2, roomId: 'finished-room', color: 'white', clock },
  ];

  assert.equal(canExposeFullEventReplay(events), true);
  assert.deepEqual(eventReplayResponse(events), { status: 200, body: { events } });
});

test('missing persisted events return not found for replay API', () => {
  assert.deepEqual(eventReplayResponse(null), { status: 404, body: { error: 'not_found' } });
});

test('production-like runtime requires database unless explicitly allowed', () => {
  assert.equal(isDatabaseRequired({ NODE_ENV: 'production' }), true);
  assert.equal(isDatabaseRequired({ RAILWAY_SERVICE_NAME: 'bichess' }), true);
  assert.equal(isDatabaseRequired({ NODE_ENV: 'production', BICHESS_ALLOW_IN_MEMORY_PERSISTENCE: 'true' }), false);
  assert.equal(isDatabaseRequired({ BICHESS_REQUIRE_DATABASE: '1' }), true);
  assert.equal(isDatabaseRequired({}), false);
});

test('admin debug token is required and constant-length checked', () => {
  const env: RuntimeEnv = { BICHESS_ADMIN_DEBUG_TOKEN: 'secret-admin-token' };

  assert.equal(isAdminDebugToken(undefined, env), false);
  assert.equal(isAdminDebugToken('wrong', env), false);
  assert.equal(isAdminDebugToken('secret-admin-token', env), true);
  assert.equal(isAdminDebugToken('secret-admin-token', {}), false);
});

test('admin debug token can be read from a websocket subprotocol header', () => {
  assert.equal(
    adminDebugTokenFromProtocolHeader('foo, bichess-admin-debug.secret-admin-token, bar'),
    'secret-admin-token',
  );
  assert.equal(
    adminDebugTokenFromProtocolHeader(['foo', 'bichess-admin-debug.secret-admin-token']),
    'secret-admin-token',
  );
  assert.equal(adminDebugTokenFromProtocolHeader('foo, bar'), undefined);
});

test('production websocket origin defaults to https host and supports explicit allowlist', () => {
  const prod: RuntimeEnv = { NODE_ENV: 'production' };

  assert.equal(isAllowedWebSocketOrigin(undefined, 'bichess.org', prod), false);
  assert.equal(isAllowedWebSocketOrigin('http://bichess.org', 'bichess.org', prod), false);
  assert.equal(isAllowedWebSocketOrigin('https://bichess.org', 'bichess.org', prod), true);
  assert.equal(isAllowedWebSocketOrigin('https://staging.bichess.org', 'bichess.org', {
    ...prod,
    BICHESS_ALLOWED_ORIGINS: 'https://bichess.org, https://staging.bichess.org',
  }), true);
  assert.equal(isAllowedWebSocketOrigin(undefined, 'localhost:3001', {}), true);
});

test('websocket message rate window rejects over-limit bursts and recovers after window', () => {
  const timestamps: number[] = [];

  assert.equal(recordMessageTimestamp(timestamps, 1_000, 2, 1_000), true);
  assert.equal(recordMessageTimestamp(timestamps, 1_100, 2, 1_000), true);
  assert.equal(recordMessageTimestamp(timestamps, 1_200, 2, 1_000), false);
  assert.equal(recordMessageTimestamp(timestamps, 2_300, 2, 1_000), true);
  assert.deepEqual(timestamps, [2_300]);
});

import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { clearPresence, PRESENCE_TTL_MS, touchPresence } from './presence.js';
import type { HttpApiContext } from './routes/lib.js';
import { tryHandle } from './routes/meta.js';
import type { Client, Room } from './server-types.js';
import {
  registerVariantTenant,
  type VariantTenantRegistration,
} from './variant-tenant/registry.js';

type ResponseCapture = { body: string; headers: Record<string, string>; status: number | null };

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    headers: {} as Record<string, string>,
    status: null as number | null,
    writeHead(status: number, headers?: Record<string, string>) {
      capture.status = status;
      capture.headers = headers ?? {};
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  return capture as unknown as ServerResponse & ResponseCapture;
}

function getRequest(): IncomingMessage {
  return { method: 'GET', headers: {} } as unknown as IncomingMessage;
}

// Only the bits the live-stats handler reads: a connection identity (id +
// optional userId) and the room's playing status.
function client(id: string, userId: string | null = null): Client {
  return { id, userId } as unknown as Client;
}

function room(status: 'playing' | 'waiting', clients: Client[], mode: Room['mode'] = 'pvp'): Room {
  return {
    clients: new Set(clients),
    mode,
    projection: { state: { status: { type: status } } },
  } as unknown as Room;
}

function liveStatsContext(rooms: Map<string, Room>): HttpApiContext {
  return { rooms } as unknown as HttpApiContext;
}

async function liveStats(rooms: Map<string, Room>): Promise<{ playing: number; online: number }> {
  const response = captureResponse();
  const handled = await tryHandle(
    liveStatsContext(rooms),
    getRequest(),
    response,
    '/api/live-stats',
    new URL('http://localhost/api/live-stats'),
  );
  assert.equal(handled, true);
  assert.equal(response.status, 200);
  return JSON.parse(response.body) as { playing: number; online: number };
}

test('live-stats counts a signed-in user once across multiple rooms/tabs', async () => {
  // Same user (userId "u1") connected from two different rooms, each with its
  // own per-room client id — the inflation this fix targets.
  const rooms = new Map<string, Room>([
    ['a', room('playing', [client('room-a-client', 'u1')])],
    ['b', room('waiting', [client('room-b-client', 'u1')])],
  ]);
  const stats = await liveStats(rooms);
  assert.equal(stats.online, 1);
  assert.equal(stats.playing, 1);
});

test('live-stats counts distinct signed-in users separately', async () => {
  const rooms = new Map<string, Room>([
    ['a', room('playing', [client('ca', 'u1'), client('cb', 'u2')])],
  ]);
  const stats = await liveStats(rooms);
  assert.equal(stats.online, 2);
  assert.equal(stats.playing, 1);
});

test('live-stats dedupes anonymous connections by per-room client id', async () => {
  // Two tabs of the same room share a localStorage client id; a third anon
  // connection in another room is a distinct identity.
  const rooms = new Map<string, Room>([
    ['a', room('playing', [client('anon-room-a'), client('anon-room-a')])],
    ['b', room('waiting', [client('anon-room-b')])],
  ]);
  const stats = await liveStats(rooms);
  assert.equal(stats.online, 2);
});

test('live-stats excludes EvE games from the playing count but keeps PvP/PvE', async () => {
  // Engine-vs-engine has no human player, so it must not inflate "N playing".
  // A spectator watching the EvE game is still a real human, so they count as
  // online — only the "playing" tally drops EvE.
  const rooms = new Map<string, Room>([
    ['pvp', room('playing', [client('a', 'u1'), client('b', 'u2')], 'pvp')],
    ['pve', room('playing', [client('c', 'u3')], 'pve')],
    ['eve', room('playing', [client('spectator', 'u4')], 'eve')],
  ]);
  const stats = await liveStats(rooms);
  assert.equal(stats.playing, 2); // pvp + pve, not eve
  assert.equal(stats.online, 4); // every connected human, spectator included
});

test('live-stats keeps signed-in and anonymous id spaces separate', async () => {
  // A userId and a client id with the same raw string must not collapse.
  const rooms = new Map<string, Room>([
    ['a', room('playing', [client('shared', 'shared'), client('shared')])],
  ]);
  const stats = await liveStats(rooms);
  assert.equal(stats.online, 2);
});

// ── /api/players/online ─────────────────────────────────────────────────────

type OnlinePlayers = {
  players: Array<{
    handle: string;
    displayName: string;
    rating: { variant: string; eloRating: number; provisional: boolean } | null;
  }>;
  count: number;
};

async function onlinePlayers(rooms: Map<string, Room> = new Map()): Promise<OnlinePlayers> {
  const response = captureResponse();
  const handled = await tryHandle(
    liveStatsContext(rooms),
    getRequest(),
    response,
    '/api/players/online',
    new URL('http://localhost/api/players/online'),
  );
  assert.equal(handled, true);
  assert.equal(response.status, 200);
  return JSON.parse(response.body) as OnlinePlayers;
}

function presenceUser(
  id: string,
  handle: string,
  profileVisibility: 'public' | 'unlisted' | 'private' = 'public',
) {
  return { id, handle, displayName: handle, profileVisibility };
}

test('players/online lists recently seen users sorted by handle', async () => {
  clearPresence();
  touchPresence(presenceUser('u1', 'zoe'));
  touchPresence(presenceUser('u2', 'amir'));
  const result = await onlinePlayers();
  assert.deepEqual(
    result.players.map((p) => p.handle),
    ['amir', 'zoe'],
  );
  assert.equal(result.count, 2);
  // Without persistence there is no rating lookup; the field is still present.
  assert.equal(result.players[0]!.rating, null);
});

test('players/online drops users past the presence TTL', async () => {
  clearPresence();
  touchPresence(presenceUser('u1', 'stale'), Date.now() - PRESENCE_TTL_MS - 1_000);
  touchPresence(presenceUser('u2', 'fresh'));
  const result = await onlinePlayers();
  assert.deepEqual(
    result.players.map((p) => p.handle),
    ['fresh'],
  );
});

test('players/online hides private profiles but counts them nowhere', async () => {
  clearPresence();
  touchPresence(presenceUser('u1', 'hidden', 'private'));
  touchPresence(presenceUser('u2', 'listed', 'unlisted'));
  const result = await onlinePlayers();
  assert.deepEqual(
    result.players.map((p) => p.handle),
    ['listed'],
  );
  assert.equal(result.count, 1);
});

test('players/online keeps a silent open-socket player listed past the TTL', async () => {
  // A player mid-game holds a WebSocket but may make no authed HTTP request
  // for longer than the TTL. Their live room connection must refresh presence.
  clearPresence();
  touchPresence(presenceUser('u1', 'marathoner'), Date.now() - PRESENCE_TTL_MS - 1_000);
  const rooms = new Map<string, Room>([['a', room('playing', [client('c1', 'u1')])]]);
  const result = await onlinePlayers(rooms);
  assert.deepEqual(
    result.players.map((p) => p.handle),
    ['marathoner'],
  );
});

test('players/online refreshes connections in variant-tenant rooms too', async () => {
  clearPresence();
  touchPresence(presenceUser('u1', 'tenant-player'), Date.now() - PRESENCE_TTL_MS - 1_000);
  // Minimal registration slice: the endpoint only walks `rooms`.
  registerVariantTenant({
    kind: 'test-presence-tenant',
    gameSpecId: 'test-presence-spec',
    roomIdPrefix: 'tpres_',
    rooms: new Map([
      [
        'tpres_1',
        {
          id: 'tpres_1',
          clients: [{ socket: { close() {}, send() {} }, userId: 'u1' }],
          pendingWrites: Promise.resolve(),
        },
      ],
    ]),
  } as unknown as VariantTenantRegistration);
  const result = await onlinePlayers();
  assert.deepEqual(
    result.players.map((p) => p.handle),
    ['tenant-player'],
  );
});

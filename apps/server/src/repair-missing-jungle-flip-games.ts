/**
 * One-off repair: rebuild the `games` rows for finished Flip Jungle rooms whose
 * terminal write was rejected by games_termination_check.
 *
 * Before migration 114, a game ending in 'dead-position' failed recordGameEnd's
 * whole transaction, so the games row AND its game_participants rolled back and
 * the finished game had no row at all: the postgame API 404s and the game is
 * absent from profile lists. The event log is untouched, so the game can be
 * rebuilt by replaying it.
 *
 * Run AFTER migration 114 is applied (otherwise every write fails the same way).
 * From the repo root, against prod (the Postgres service carries the public URL
 * that resolves off-platform; DATABASE_URL there is the private hostname):
 *   railway run --service Postgres npx tsx apps/server/src/repair-missing-jungle-flip-games.ts
 *   railway run --service Postgres npx tsx apps/server/src/repair-missing-jungle-flip-games.ts --apply
 *
 * Dry run by default. Idempotent: rooms that already have a completed row are
 * skipped, as are rooms whose log replays to a non-terminal state.
 */

import {
  applyJungleFlipMove,
  createInitialJungleFlipState,
  type JungleFlipDeal,
  type JungleFlipMove,
  type JungleFlipSeat,
} from '@mistboard/game';
import { firstPartyBotForEngine, firstPartyBotForId } from './first-party-bots.js';
import {
  isJungleFlipEngineClientId,
  jungleFlipEngineDisplayName,
  jungleFlipEngineVersion,
} from './jungle-flip-engine.js';
import type { JungleFlipEvent } from './jungle-flip-runtime.js';
import { jungleFlipTenant } from './jungle-flip-tenant.js';
import * as persistence from './persistence.js';
import { getPool } from './persistence-db.js';

const apply = process.argv.includes('--apply');
const databaseUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('no DATABASE_PUBLIC_URL or DATABASE_URL in the environment');

type Candidate = { roomId: string; events: JungleFlipEvent[] };

async function findCandidates(): Promise<string[]> {
  // Rooms with a Flip Jungle event log but no completed games row. Includes rooms
  // with no row at all (the dead-position case) and rooms stuck non-completed.
  const { rows } = await getPool().query<{ room_id: string }>(
    `SELECT DISTINCT e.room_id
       FROM events e
       LEFT JOIN games g ON g.room_id = e.room_id AND g.status = 'completed'
      WHERE e.room_id LIKE 'jgf\\_%'
        AND g.room_id IS NULL
      ORDER BY e.room_id`,
  );
  return rows.map((row: { room_id: string }) => row.room_id);
}

function participantFor(
  seat: JungleFlipSeat,
  seatClientId: string | undefined,
  seatTokens: Awaited<ReturnType<typeof persistence.loadRoomSeatTokens<JungleFlipSeat>>>,
  pveBotId: string | undefined,
): persistence.GameParticipant {
  const visibility: persistence.GameVisibility = 'public';
  if (seatClientId && isJungleFlipEngineClientId(seatClientId)) {
    const engineVersion = jungleFlipEngineVersion(seatClientId) ?? null;
    const bot = pveBotId ? firstPartyBotForId(pveBotId) : firstPartyBotForEngine(seatClientId);
    if (bot) {
      return {
        color: seat as persistence.GameParticipantColor,
        displayName: bot.displayName,
        subjectType: 'bot',
        subjectId: bot.id,
        ...(engineVersion != null ? { engineVersion } : {}),
        visibility,
      };
    }
    return {
      color: seat as persistence.GameParticipantColor,
      displayName: jungleFlipEngineDisplayName(seatClientId),
      subjectType: 'engine-version',
      subjectId: seatClientId,
      ...(engineVersion != null ? { engineVersion } : {}),
      visibility,
    };
  }
  const token = seatTokens[seat];
  if (token?.userId) {
    return {
      color: seat as persistence.GameParticipantColor,
      displayName: token.userDisplayName ?? token.userHandle ?? 'Player',
      subjectType: 'user',
      subjectId: token.userId,
      visibility,
    };
  }
  return {
    color: seat as persistence.GameParticipantColor,
    displayName: 'Guest',
    subjectType: 'guest',
    subjectId: null,
    visibility,
  };
}

async function repair(candidate: Candidate): Promise<string> {
  const { roomId, events } = candidate;
  const created = events[0];
  if (created?.type !== 'room-created') return 'skipped: no room-created event';
  const deal = created.setup as JungleFlipDeal | undefined;
  if (!deal) return 'skipped: no deal in room-created';

  const moveEvents = events.filter(
    (e): e is Extract<JungleFlipEvent, { type: 'move-played' }> => e.type === 'move-played',
  );
  let state = createInitialJungleFlipState(roomId, deal);
  for (const e of moveEvents) state = applyJungleFlipMove(state, e.move as JungleFlipMove);
  if (state.status.type !== 'finished') return `skipped: replays to ${state.status.type}`;

  // Seats come from seat-assigned events (last assignment per seat wins).
  const seats: Partial<Record<JungleFlipSeat, string>> = {};
  for (const e of events) if (e.type === 'seat-assigned') seats[e.seat] = e.clientId;

  const seatTokens = await persistence.loadRoomSeatTokens<JungleFlipSeat>(roomId);
  const pveBotId = created.pveBotId;
  const participants = jungleFlipTenant.colors.map((seat) =>
    participantFor(seat, seats[seat], seatTokens, pveBotId),
  );
  const engineSeated = participants.some(
    (p) => p.subjectType === 'bot' || p.subjectType === 'engine-version',
  );

  const result = jungleFlipTenant.persistence.resultForWinner(state.status.winner);
  const termination = jungleFlipTenant.persistence.termination(state.status.reason);
  const firstAt = events[0]?.at ?? Date.now();
  const lastAt = events[events.length - 1]?.at ?? Date.now();

  if (!apply) {
    return `WOULD REPAIR: ${result}/${termination} plies=${moveEvents.length} mode=${engineSeated ? 'pve' : 'pvp'} participants=${participants.map((p) => `${p.color}:${p.subjectType}:${p.displayName}`).join(' ')}`;
  }
  await persistence.recordGameEnd(roomId, {
    variant: jungleFlipTenant.gameSpecId,
    mode: engineSeated ? 'pve' : 'pvp',
    result,
    termination,
    plyCount: moveEvents.length,
    startedAt: new Date(firstAt),
    endedAt: new Date(lastAt),
    whiteClient: null,
    blackClient: null,
    whiteName: null,
    blackName: null,
    corpusId: null,
    // A repaired game is never rated: the rating update happened (or did not) at
    // game end and must not be replayed here.
    rated: false,
    visibility: 'public',
    initialMs: created.timeControl?.initialMs ?? null,
    incrementMs: created.timeControl?.incrementMs ?? null,
    participants,
  });
  return `REPAIRED: ${result}/${termination} plies=${moveEvents.length}`;
}

persistence.init(databaseUrl);
const roomIds = await findCandidates();
console.log(`${roomIds.length} Flip Jungle room(s) without a completed games row`);
console.log(apply ? 'mode: APPLY' : 'mode: DRY RUN (pass --apply to write)');
let repaired = 0;
for (const roomId of roomIds) {
  const events = await persistence.loadRoomEvents<JungleFlipEvent>(roomId);
  if (!events || events.length === 0) {
    console.log(`  ${roomId}: skipped: no events`);
    continue;
  }
  try {
    const outcome = await repair({ roomId, events });
    if (outcome.startsWith('REPAIRED') || outcome.startsWith('WOULD')) repaired++;
    console.log(`  ${roomId}: ${outcome}`);
  } catch (err) {
    console.log(`  ${roomId}: FAILED: ${(err as Error).message}`);
  }
}
console.log(`${apply ? 'repaired' : 'repairable'}: ${repaired}/${roomIds.length}`);
await persistence.close();

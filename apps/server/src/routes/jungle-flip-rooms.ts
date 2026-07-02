import { JUNGLE_FLIP_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import {
  isJungleFlipEngineClientId,
  JUNGLE_FLIP_DEFAULT_ENGINE_ID,
} from './../jungle-flip-engine.js';
import {
  createTenantRoomsRoute,
  resolveFirstMoverHumanSeat,
} from './../variant-tenant/rooms-route.js';

// `preferredColor` selects the move-order SEAT — 'red' = first mover (the flip game
// binds the actual ink on the first flip, so this is a move-order choice, not an ink
// choice).
export type JungleFlipCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createJungleFlipRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'red' | 'black' | 'random',
    engine?: { engineId: string; seat: 'red' | 'black'; botId?: string },
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | { ok: false; error: 'jungle_flip_disabled' | 'persistence_failure' | 'room_id_collision' }
  >;
};

const JUNGLE_FLIP_SEATS = ['red', 'black'] as const;

const jungleFlipRoute = createTenantRoomsRoute<
  JungleFlipCreateContext,
  'red' | 'black' | 'random',
  'red' | 'black'
>({
  gameSpecId: JUNGLE_FLIP_SPEC_ID,
  errorPrefix: 'jungle_flip',
  hasDisabledFlag: true,
  preferredColors: ['red', 'black', 'random'],
  engine: {
    kind: 'seated',
    defaultEngineId: JUNGLE_FLIP_DEFAULT_ENGINE_ID,
    isEngineClientId: isJungleFlipEngineClientId,
    seats: JUNGLE_FLIP_SEATS,
  },
  // PvP + PvE (the Tier-B MistyJungleFlip UCI engine). Rated is still unsupported.
  rated: { kind: 'reject-as-surface' },
  createRoom: (ctx, { timeControl, preferredColor, engine }) =>
    ctx.createJungleFlipRoom(timeControl, preferredColor, engine),
});

export const requestsJungleFlip = jungleFlipRoute.matchesCreateRequest;
export const handleJungleFlipCreate = jungleFlipRoute.handleCreate;

// The human's move-order seat for PvE. Default 'red' (the human opens); 'random' picks
// uniformly. The engine takes the other seat.
export function jungleFlipPveHumanSeat(
  preferredSeat: 'red' | 'black' | 'random' | undefined,
  randomByte?: number,
): 'red' | 'black' {
  return resolveFirstMoverHumanSeat(preferredSeat, JUNGLE_FLIP_SEATS, randomByte);
}

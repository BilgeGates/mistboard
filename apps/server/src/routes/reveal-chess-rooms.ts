import { REVEAL_CHESS_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { createTenantRoomsRoute } from './../variant-tenant/rooms-route.js';

// The slice of server context this route needs; the registry entry binds the
// tenant's room factory in (reveal-chess-registration.ts). Reveal Chess is
// PvP-only (no engine/bot), so there is no PvE branch and no engine seat.
export type RevealChessCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createRevealChessRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'white' | 'black' | 'random',
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | {
        ok: false;
        error: 'reveal_chess_disabled' | 'persistence_failure' | 'room_id_collision';
      }
  >;
};

const revealChessRoute = createTenantRoomsRoute<
  RevealChessCreateContext,
  'white' | 'black' | 'random'
>({
  gameSpecId: REVEAL_CHESS_SPEC_ID,
  errorPrefix: 'reveal_chess',
  hasDisabledFlag: true,
  preferredColors: ['white', 'black', 'random'],
  // PvP only (no engine/bot). Unlike the other PvP-only tenants, a stray
  // engineId is ignored rather than rejected as an unsupported surface.
  engine: { kind: 'none', rejectEngineId: false },
  rated: { kind: 'reject-as-surface' },
  createRoom: (ctx, { timeControl, preferredColor }) =>
    ctx.createRevealChessRoom(timeControl, preferredColor),
});

export const requestsRevealChess = revealChessRoute.matchesCreateRequest;
export const handleRevealChessCreate = revealChessRoute.handleCreate;

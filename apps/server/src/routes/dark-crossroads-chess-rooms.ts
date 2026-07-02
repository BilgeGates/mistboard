import { DARK_CROSSROADS_CHESS_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { createTenantRoomsRoute } from './../variant-tenant/rooms-route.js';

// The slice of server context this route needs; the registry entry binds the
// tenant's room factory in (dark-crossroads-chess-registration.ts).
export type DarkCrossroadsChessCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createDarkCrossroadsChessRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'white' | 'red' | 'random',
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | {
        ok: false;
        error: 'dark_crossroads_chess_disabled' | 'persistence_failure' | 'room_id_collision';
      }
  >;
};

const darkCrossroadsChessRoute = createTenantRoomsRoute<
  DarkCrossroadsChessCreateContext,
  'white' | 'red' | 'random'
>({
  gameSpecId: DARK_CROSSROADS_CHESS_SPEC_ID,
  errorPrefix: 'dark_crossroads_chess',
  hasDisabledFlag: true,
  preferredColors: ['white', 'red', 'random'],
  engine: { kind: 'none', rejectEngineId: true },
  rated: { kind: 'reject-as-surface' },
  createRoom: (ctx, { timeControl, preferredColor }) =>
    ctx.createDarkCrossroadsChessRoom(timeControl, preferredColor),
});

export const requestsDarkCrossroadsChess = darkCrossroadsChessRoute.matchesCreateRequest;
export const handleDarkCrossroadsChessCreate = darkCrossroadsChessRoute.handleCreate;

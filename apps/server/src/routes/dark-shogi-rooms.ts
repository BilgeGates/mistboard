import { DARK_SHOGI_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { createTenantRoomsRoute } from './../variant-tenant/rooms-route.js';

export type DarkShogiCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createDarkShogiRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'black' | 'white' | 'random',
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | { ok: false; error: 'dark_shogi_disabled' | 'persistence_failure' | 'room_id_collision' }
  >;
};

const darkShogiRoute = createTenantRoomsRoute<DarkShogiCreateContext, 'black' | 'white' | 'random'>(
  {
    gameSpecId: DARK_SHOGI_SPEC_ID,
    errorPrefix: 'dark_shogi',
    hasDisabledFlag: true,
    preferredColors: ['black', 'white', 'random'],
    engine: { kind: 'none', rejectEngineId: true },
    rated: { kind: 'reject-as-surface' },
    createRoom: (ctx, { timeControl, preferredColor }) =>
      ctx.createDarkShogiRoom(timeControl, preferredColor),
  },
);

export const requestsDarkShogi = darkShogiRoute.matchesCreateRequest;
export const handleDarkShogiCreate = darkShogiRoute.handleCreate;

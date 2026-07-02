import { DARK_CRAZYHOUSE_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { createTenantRoomsRoute } from './../variant-tenant/rooms-route.js';

export type DarkCrazyhouseCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createDarkCrazyhouseRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'white' | 'black' | 'random',
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | {
        ok: false;
        error: 'dark_crazyhouse_disabled' | 'persistence_failure' | 'room_id_collision';
      }
  >;
};

const darkCrazyhouseRoute = createTenantRoomsRoute<
  DarkCrazyhouseCreateContext,
  'white' | 'black' | 'random'
>({
  gameSpecId: DARK_CRAZYHOUSE_SPEC_ID,
  errorPrefix: 'dark_crazyhouse',
  hasDisabledFlag: true,
  preferredColors: ['white', 'black', 'random'],
  engine: { kind: 'none', rejectEngineId: true },
  rated: { kind: 'reject-as-surface' },
  createRoom: (ctx, { timeControl, preferredColor }) =>
    ctx.createDarkCrazyhouseRoom(timeControl, preferredColor),
});

export const requestsDarkCrazyhouse = darkCrazyhouseRoute.matchesCreateRequest;
export const handleDarkCrazyhouseCreate = darkCrazyhouseRoute.handleCreate;

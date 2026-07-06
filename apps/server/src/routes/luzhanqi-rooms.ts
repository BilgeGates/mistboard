import { LUZHANQI_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { createTenantRoomsRoute } from './../variant-tenant/rooms-route.js';

export type LuzhanqiCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createLuzhanqiRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'red' | 'black' | 'random',
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | { ok: false; error: 'luzhanqi_disabled' | 'persistence_failure' | 'room_id_collision' }
  >;
};

const luzhanqiRoute = createTenantRoomsRoute<
  LuzhanqiCreateContext,
  'red' | 'black' | 'random',
  'red' | 'black'
>({
  gameSpecId: LUZHANQI_SPEC_ID,
  errorPrefix: 'luzhanqi',
  hasDisabledFlag: true,
  preferredColors: ['red', 'black', 'random'],
  engine: { kind: 'none', rejectEngineId: true },
  rated: { kind: 'reject-as-surface' },
  createRoom: (ctx, { timeControl, preferredColor }) =>
    ctx.createLuzhanqiRoom(timeControl, preferredColor),
});

export const requestsLuzhanqi = luzhanqiRoute.matchesCreateRequest;
export const handleLuzhanqiCreate = luzhanqiRoute.handleCreate;

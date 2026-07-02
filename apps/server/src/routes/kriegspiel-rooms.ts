import { KRIEGSPIEL_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import { createTenantRoomsRoute } from './../variant-tenant/rooms-route.js';

export type KriegspielCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createKriegspielRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'black' | 'white' | 'random',
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string } }
    | { ok: false; error: 'kriegspiel_disabled' | 'persistence_failure' | 'room_id_collision' }
  >;
};

const kriegspielRoute = createTenantRoomsRoute<
  KriegspielCreateContext,
  'black' | 'white' | 'random'
>({
  gameSpecId: KRIEGSPIEL_SPEC_ID,
  errorPrefix: 'kriegspiel',
  hasDisabledFlag: true,
  preferredColors: ['black', 'white', 'random'],
  engine: { kind: 'none', rejectEngineId: true },
  rated: { kind: 'reject-as-surface' },
  createRoom: (ctx, { timeControl, preferredColor }) =>
    ctx.createKriegspielRoom(timeControl, preferredColor),
});

export const requestsKriegspiel = kriegspielRoute.matchesCreateRequest;
export const handleKriegspielCreate = kriegspielRoute.handleCreate;

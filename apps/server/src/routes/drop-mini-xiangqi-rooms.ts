import { DROP_MINI_XIANGQI_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import {
  DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
  isDropMiniXiangqiEngineClientId,
} from './../server-drop-mini-xiangqi-engine.js';
import {
  createTenantRoomsRoute,
  resolveFirstMoverHumanSeat,
} from './../variant-tenant/rooms-route.js';

export type DropMiniXiangqiCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createDropMiniXiangqiRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'red' | 'black' | 'random',
    rated?: boolean,
    engine?: { engineId: string; seat: 'red' | 'black'; botId?: string },
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string; rated: boolean } }
    | {
        ok: false;
        error: 'drop_mini_xiangqi_disabled' | 'persistence_failure' | 'room_id_collision';
      }
  >;
};

const DROP_MINI_XIANGQI_SEATS = ['red', 'black'] as const;

const dropMiniXiangqiRoute = createTenantRoomsRoute<
  DropMiniXiangqiCreateContext,
  'red' | 'black' | 'random',
  'red' | 'black'
>({
  gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
  errorPrefix: 'drop_mini_xiangqi',
  hasDisabledFlag: true,
  preferredColors: ['red', 'black', 'random'],
  engine: {
    kind: 'seated',
    defaultEngineId: DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
    isEngineClientId: isDropMiniXiangqiEngineClientId,
    seats: DROP_MINI_XIANGQI_SEATS,
  },
  rated: { kind: 'account-gated' },
  createRoom: (ctx, { timeControl, preferredColor, rated, engine }) =>
    ctx.createDropMiniXiangqiRoom(timeControl, preferredColor, rated, engine),
});

export const requestsDropMiniXiangqi = dropMiniXiangqiRoute.matchesCreateRequest;
export const handleDropMiniXiangqiCreate = dropMiniXiangqiRoute.handleCreate;

export function dropMiniXiangqiPveHumanColor(
  preferredColor: 'red' | 'black' | 'random' | undefined,
  randomByte?: number,
): 'red' | 'black' {
  return resolveFirstMoverHumanSeat(preferredColor, DROP_MINI_XIANGQI_SEATS, randomByte);
}

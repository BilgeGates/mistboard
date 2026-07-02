import { MINI_XIANGQI_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import {
  isMiniXiangqiEngineClientId,
  MINI_XIANGQI_DEFAULT_ENGINE_ID,
} from './../mini-xiangqi-engine.js';
import {
  createTenantRoomsRoute,
  resolveFirstMoverHumanSeat,
} from './../variant-tenant/rooms-route.js';

export type MiniXiangqiCreateContext = {
  databaseRequired: boolean;
  isDraining(): boolean;
  drainDeadlineMs(): number | null;
  createMiniXiangqiRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: 'red' | 'black' | 'random',
    rated?: boolean,
    engine?: { engineId: string; seat: 'red' | 'black'; botId?: string },
  ): Promise<
    | { ok: true; room: { id: string; gameSpecId: string; rated: boolean } }
    | {
        ok: false;
        error: 'persistence_failure' | 'room_id_collision';
      }
  >;
};

const MINI_XIANGQI_SEATS = ['red', 'black'] as const;

// Mini Xiangqi has no launch flag (always integrated) and is casual-only at
// launch: any rated request is rejected with `rated_unsupported_surface`.
const miniXiangqiRoute = createTenantRoomsRoute<
  MiniXiangqiCreateContext,
  'red' | 'black' | 'random',
  'red' | 'black'
>({
  gameSpecId: MINI_XIANGQI_SPEC_ID,
  errorPrefix: 'mini_xiangqi',
  hasDisabledFlag: false,
  preferredColors: ['red', 'black', 'random'],
  engine: {
    kind: 'seated',
    defaultEngineId: MINI_XIANGQI_DEFAULT_ENGINE_ID,
    isEngineClientId: isMiniXiangqiEngineClientId,
    seats: MINI_XIANGQI_SEATS,
  },
  rated: { kind: 'reject-as-rated' },
  createRoom: (ctx, { timeControl, preferredColor, rated, engine }) =>
    ctx.createMiniXiangqiRoom(timeControl, preferredColor, rated, engine),
});

export const requestsMiniXiangqi = miniXiangqiRoute.matchesCreateRequest;
export const handleMiniXiangqiCreate = miniXiangqiRoute.handleCreate;

export function miniXiangqiPveHumanColor(
  preferredColor: 'red' | 'black' | 'random' | undefined,
  randomByte?: number,
): 'red' | 'black' {
  return resolveFirstMoverHumanSeat(preferredColor, MINI_XIANGQI_SEATS, randomByte);
}

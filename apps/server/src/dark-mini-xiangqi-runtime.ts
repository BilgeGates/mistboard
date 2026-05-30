import {
  createInitialMiniXiangqiState,
  DARK_MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
} from '@mistboard/game';
import { darkMiniXiangqiEnabled } from './feature-flags.js';

export const DARK_MINI_XIANGQI_ROOM_ID_PREFIX = 'dmxq_';

export type DarkMiniXiangqiSeat = MiniXiangqiColor | 'spectator';
export type DarkMiniXiangqiCreatorPreference = MiniXiangqiColor | 'random';

export type DarkMiniXiangqiEvent = {
  type: 'room-created';
  at: number;
  roomId: string;
  gameSpecId: typeof DARK_MINI_XIANGQI_SPEC_ID;
  creatorPreference?: DarkMiniXiangqiCreatorPreference;
};

export type DarkMiniXiangqiProjection = {
  roomId: string;
  creatorPreference?: DarkMiniXiangqiCreatorPreference;
  gameSpecId: typeof DARK_MINI_XIANGQI_SPEC_ID;
  state: MiniXiangqiGameState;
  seats: Partial<Record<MiniXiangqiColor, string>>;
};

export type DarkMiniXiangqiClientRef = {
  id?: string;
  seat: DarkMiniXiangqiSeat;
  displaced: boolean;
};

export type DarkMiniXiangqiSeatTokenState = {
  clientId: string;
  seat: MiniXiangqiColor;
  tokenHash: string;
  userId: string | null;
  userHandle: string | null;
  userDisplayName: string | null;
  issuedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type DarkMiniXiangqiRuntimeRoom = {
  kind: 'dark-mini-xiangqi';
  id: string;
  clients: Set<DarkMiniXiangqiClientRef>;
  events: DarkMiniXiangqiEvent[];
  projection: DarkMiniXiangqiProjection;
  gameSpecId: typeof DARK_MINI_XIANGQI_SPEC_ID;
  pendingWrites: Promise<void>;
  seatTokens: Partial<Record<MiniXiangqiColor, DarkMiniXiangqiSeatTokenState>>;
};

export type DarkMiniXiangqiRoomCreation =
  | { ok: true; room: DarkMiniXiangqiRuntimeRoom }
  | { ok: false; error: 'dark_mini_xiangqi_disabled' };

export type DarkMiniXiangqiRoomHydration =
  | { ok: true; room: DarkMiniXiangqiRuntimeRoom }
  | { ok: false; error: 'empty_event_log' | 'invalid_event_log' };

export function isDarkMiniXiangqiRoomId(roomId: string): boolean {
  return roomId.startsWith(DARK_MINI_XIANGQI_ROOM_ID_PREFIX);
}

export function createDarkMiniXiangqiRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: DarkMiniXiangqiCreatorPreference;
    now?: number;
  } = {},
): DarkMiniXiangqiRoomCreation {
  if (!darkMiniXiangqiEnabled()) return { ok: false, error: 'dark_mini_xiangqi_disabled' };

  const now = options.now ?? Date.now();
  const events: DarkMiniXiangqiEvent[] = [
    {
      type: 'room-created',
      at: now,
      roomId,
      gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
      ...(options.creatorPreference ? { creatorPreference: options.creatorPreference } : {}),
    },
  ];
  const hydrated = createDarkMiniXiangqiRuntimeRoomFromEvents(events);
  if (!hydrated.ok) throw new Error(`failed to create Dark Mini Xiangqi room: ${hydrated.error}`);
  return { ok: true, room: hydrated.room };
}

export function createDarkMiniXiangqiRuntimeRoomFromEvents(
  events: readonly DarkMiniXiangqiEvent[],
  projection = replayDarkMiniXiangqiEvents(events),
): DarkMiniXiangqiRoomHydration {
  if (events.length === 0) return { ok: false, error: 'empty_event_log' };
  if (!isDarkMiniXiangqiEventLog(events)) return { ok: false, error: 'invalid_event_log' };
  const first = events[0]!;
  return {
    ok: true,
    room: {
      kind: 'dark-mini-xiangqi',
      id: first.roomId,
      clients: new Set(),
      events: [...events],
      projection,
      gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
      pendingWrites: Promise.resolve(),
      seatTokens: {},
    },
  };
}

export function replayDarkMiniXiangqiEvents(
  events: readonly DarkMiniXiangqiEvent[],
): DarkMiniXiangqiProjection {
  const firstRoomId = events[0]?.roomId ?? 'unknown-room';
  return events.reduce(
    (projection, event) => applyDarkMiniXiangqiEvent(projection, event),
    initialDarkMiniXiangqiProjection(firstRoomId),
  );
}

export function applyDarkMiniXiangqiEvent(
  projection: DarkMiniXiangqiProjection,
  event: DarkMiniXiangqiEvent,
): DarkMiniXiangqiProjection {
  if (event.roomId !== projection.roomId) return projection;
  if (event.type === 'room-created') {
    return initialDarkMiniXiangqiProjection(event.roomId, event.creatorPreference);
  }
  return projection;
}

export function isDarkMiniXiangqiEventLog(
  events: readonly unknown[],
  roomId?: string,
): events is readonly DarkMiniXiangqiEvent[] {
  const firstRoomId = roomId ?? roomIdFromUnknownEvent(events[0]);
  if (!firstRoomId) return false;
  const [created, ...rest] = events;
  if (
    !isDarkMiniXiangqiEvent(created, firstRoomId) ||
    created.type !== 'room-created' ||
    created.gameSpecId !== DARK_MINI_XIANGQI_SPEC_ID ||
    !isFiniteTimestamp(created.at)
  ) {
    return false;
  }
  return rest.every((event) => isDarkMiniXiangqiEvent(event, firstRoomId));
}

export function isDarkMiniXiangqiEvent(
  value: unknown,
  roomId?: string,
): value is DarkMiniXiangqiEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  if (event.type !== 'room-created') return false;
  if (typeof event.roomId !== 'string') return false;
  if (roomId !== undefined && event.roomId !== roomId) return false;
  return (
    event.gameSpecId === DARK_MINI_XIANGQI_SPEC_ID &&
    isFiniteTimestamp(event.at) &&
    (event.creatorPreference === undefined ||
      event.creatorPreference === 'red' ||
      event.creatorPreference === 'black' ||
      event.creatorPreference === 'random')
  );
}

function initialDarkMiniXiangqiProjection(
  roomId: string,
  creatorPreference?: DarkMiniXiangqiCreatorPreference,
): DarkMiniXiangqiProjection {
  return {
    roomId,
    ...(creatorPreference ? { creatorPreference } : {}),
    gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
    state: createInitialMiniXiangqiState(roomId),
    seats: {},
  };
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function roomIdFromUnknownEvent(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const roomId = (value as Record<string, unknown>).roomId;
  return typeof roomId === 'string' ? roomId : undefined;
}

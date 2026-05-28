import type { GameSpecId } from '@mistboard/game';
import { isGameSpecId } from '@mistboard/game';

const DARK_XIANGQI_ROOM_ID_PREFIX = 'dxq_';

export function roomIdFromPath(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, '');
  if (normalized === '/room') return 'dev-room';
  const match = normalized.match(/^\/room\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export function gameSpecIdForRoomBootstrap(
  roomId: string,
  requested: string | null,
): GameSpecId | null {
  if (roomId.startsWith(DARK_XIANGQI_ROOM_ID_PREFIX)) return 'dark-xiangqi';
  return isGameSpecId(requested) ? requested : null;
}

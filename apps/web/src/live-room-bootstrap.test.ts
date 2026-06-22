import { describe, expect, it } from 'vitest';
import { gameSpecIdForRoomBootstrap } from './live-room-bootstrap.js';
import { roomIdFromPath } from './room-url.js';

describe('live room bootstrap', () => {
  it('extracts direct room ids from /room/:id paths', () => {
    expect(roomIdFromPath('/room/dxq_abc%20123')).toBe('dxq_abc 123');
    expect(roomIdFromPath('/room/')).toBe('dev-room');
    expect(roomIdFromPath('/play/dxq_abc')).toBeNull();
  });

  it('routes chess-shell tenant prefixes and leaves self-contained clients alone', () => {
    // Mini Xiangqi rides the same shell as DMX, but without the fog mask.
    expect(gameSpecIdForRoomBootstrap('mxq_abc', null)).toBe('mini-xiangqi');
    expect(gameSpecIdForRoomBootstrap('mxq_abc', 'dark-chess')).toBe('mini-xiangqi');
    // DMX rides the chess live shell, so its prefix resolves here.
    expect(gameSpecIdForRoomBootstrap('dmxq_abc', null)).toBe('dark-mini-xiangqi');
    expect(gameSpecIdForRoomBootstrap('dmxq_abc', 'dark-chess')).toBe('dark-mini-xiangqi');
    // Dark-chess correspondence rooms ride the chess shell too.
    expect(gameSpecIdForRoomBootstrap('dchx_abc', null)).toBe('dark-chess');
    // Dark Xiangqi and Crossroads have their own clients (routed before the
    // shell boots), so the shell never claims their rooms.
    expect(gameSpecIdForRoomBootstrap('dxq_abc', null)).toBeNull();
    expect(gameSpecIdForRoomBootstrap('dchess_abc', null)).toBeNull();
    expect(gameSpecIdForRoomBootstrap('dmxqd_abc', null)).toBeNull();
    expect(gameSpecIdForRoomBootstrap('room-abc', 'dark-xiangqi')).toBe('dark-xiangqi');
    expect(gameSpecIdForRoomBootstrap('room-abc', 'not-a-spec')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { gameSpecIdForRoomBootstrap } from './live-room-bootstrap.js';
import { roomIdFromPath } from './room-url.js';

describe('live room bootstrap', () => {
  it('extracts direct room ids from /room/:id paths', () => {
    expect(roomIdFromPath('/room/dxq_abc%20123')).toBe('dxq_abc 123');
    expect(roomIdFromPath('/room/')).toBe('dev-room');
    expect(roomIdFromPath('/play/dxq_abc')).toBeNull();
  });

  it('routes Dark Xiangqi room ids by prefix before query fallback', () => {
    expect(gameSpecIdForRoomBootstrap('dxq_abc', null)).toBe('dark-xiangqi');
    expect(gameSpecIdForRoomBootstrap('dxq_abc', 'dark-chess')).toBe('dark-xiangqi');
    expect(gameSpecIdForRoomBootstrap('room-abc', 'dark-xiangqi')).toBe('dark-xiangqi');
    expect(gameSpecIdForRoomBootstrap('room-abc', 'not-a-spec')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { type CompactPaneKind, hashRoomId, pickCompactViewKey } from './showcase-compact-view';

// Xiangqi-family view keys: 'red' renders as the white-side pane, 'black' the
// black-side pane, 'truth' the server-truth pane.
type XKey = 'red' | 'truth' | 'black';
const xPaneKind = (key: XKey): CompactPaneKind =>
  key === 'red' ? 'white' : key === 'black' ? 'black' : 'truth';
const triptych: ReadonlyArray<{ key: XKey }> = [{ key: 'red' }, { key: 'truth' }, { key: 'black' }];

describe('pickCompactViewKey', () => {
  it('perfect-info / symmetric variants (truth only) show the truth board', () => {
    const choice = pickCompactViewKey({
      roomId: 'banqi-1',
      entries: [{ key: 'truth' as XKey }],
      paneKind: xPaneKind,
    });
    expect(choice).toEqual({ key: 'truth', side: 'none' });
  });

  it('reveal (hidden-identity) variants show the masked board, never truth', () => {
    for (const roomId of ['jieqi-a', 'jieqi-b', 'jieqi-c']) {
      const choice = pickCompactViewKey({
        roomId,
        entries: [{ key: 'truth' as XKey }],
        paneKind: xPaneKind,
        reveal: { hiddenKey: 'red' as XKey },
      });
      expect(choice.key).toBe('red');
      expect(choice.key).not.toBe('truth');
      expect(choice.side).toBe('none');
    }
  });

  it('fog variants show one side POV and NEVER the truth board', () => {
    for (let i = 0; i < 200; i += 1) {
      const choice = pickCompactViewKey({
        roomId: `dxq-${i}`,
        entries: triptych,
        paneKind: xPaneKind,
      });
      expect(choice.key).not.toBe('truth');
      expect(['red', 'black']).toContain(choice.key);
      expect(choice.side).toBe(choice.key === 'black' ? 'second' : 'first');
    }
  });

  it('picks a stable side per room across repeated calls', () => {
    const call = () =>
      pickCompactViewKey({ roomId: 'dxq-stable', entries: triptych, paneKind: xPaneKind });
    const first = call();
    for (let i = 0; i < 10; i += 1) expect(call()).toEqual(first);
  });

  it('varies the chosen side across rooms (not always the same POV)', () => {
    const sides = new Set(
      Array.from(
        { length: 50 },
        (_, i) =>
          pickCompactViewKey({ roomId: `room-${i}`, entries: triptych, paneKind: xPaneKind }).side,
      ),
    );
    expect(sides.has('first')).toBe(true);
    expect(sides.has('second')).toBe(true);
  });
});

describe('hashRoomId', () => {
  it('is deterministic per id', () => {
    expect(hashRoomId('room-xyz')).toBe(hashRoomId('room-xyz'));
  });
  it('differs across ids', () => {
    expect(hashRoomId('abc')).not.toBe(hashRoomId('abd'));
  });
});

import { isShogiDrop } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { shogiArticle } from './articles/content/shogi.js';
import type { ShogiReplayBlock } from './articles/types.js';
import { replayShogiNotation } from './shogi-replay.js';

function articleReplayBlock(): ShogiReplayBlock {
  for (const section of shogiArticle.sections) {
    for (const block of section.blocks ?? []) {
      if (block.kind === 'shogi-replay') return block;
    }
  }
  throw new Error('Shogi article is missing its replay block');
}

describe('Shogi article replay', () => {
  it('replays the Habu-Watanabe NHK Cup final through the shogi kernel', () => {
    const block = articleReplayBlock();
    const replay = replayShogiNotation(block.spec.notation);

    expect(replay.tokens).toHaveLength(147);
    expect(replay.moves).toHaveLength(147);
    expect(replay.states).toHaveLength(148);
    expect(replay.moves.some(isShogiDrop)).toBe(true);
    expect(replay.moves.some((move) => !isShogiDrop(move) && Boolean(move.promote))).toBe(true);
    expect(replay.moves.at(-1)).toMatchObject({ to: '9c' });
    expect(replay.states.at(-1)?.status).toMatchObject({ type: 'playing', turn: 'white' });
  });
});

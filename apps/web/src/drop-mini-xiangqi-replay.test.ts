import { isDropMiniXiangqiDropMove } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { dropMiniXiangqiArticle } from './articles/content/drop-mini-xiangqi.js';
import type { DropMiniXiangqiReplayBlock } from './articles/types.js';
import { replayDropMiniXiangqiNotation } from './drop-mini-xiangqi-replay.js';

function articleReplayBlock(): DropMiniXiangqiReplayBlock {
  for (const section of dropMiniXiangqiArticle.sections) {
    for (const block of section.blocks ?? []) {
      if (block.kind === 'drop-mini-xiangqi-replay') return block;
    }
  }
  throw new Error('Drop Mini Xiangqi article is missing its replay block');
}

describe('Drop Mini Xiangqi article replay', () => {
  it('replays the sample game through the Drop Mini Xiangqi kernel', () => {
    const block = articleReplayBlock();
    const replay = replayDropMiniXiangqiNotation(block.spec.moves, block.spec.rules);

    expect(replay.tokens).toHaveLength(114);
    expect(replay.moves).toHaveLength(114);
    expect(replay.states).toHaveLength(115);
    expect(replay.moves.filter(isDropMiniXiangqiDropMove)).toHaveLength(29);
    expect(block.caption).toBeUndefined();
    expect(replay.states.at(-1)?.status).toMatchObject({
      type: 'finished',
      winner: 'black',
      reason: 'checkmate',
    });
  });
});

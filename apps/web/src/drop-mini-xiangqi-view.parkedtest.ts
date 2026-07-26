import { DEFAULT_DROP_MINI_XIANGQI_RULES, type DropMiniXiangqiPlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { fillDropMiniXiangqiReserve } from './drop-mini-xiangqi-view.js';

function viewFixture(): DropMiniXiangqiPlayerView {
  return {
    id: 'dmxqd_test',
    perspective: 'red',
    board: {},
    hands: {
      red: { cannon: 2, horse: 1 },
      black: {},
    },
    cooldownHands: {
      red: {},
      black: {},
    },
    legalMoves: [],
    rules: DEFAULT_DROP_MINI_XIANGQI_RULES,
    inCheck: false,
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
  };
}

describe('fillDropMiniXiangqiReserve', () => {
  it('keeps playable reserve pieces out of captured-piece sizing classes', () => {
    const shell = document.createElement('div');
    shell.className = 'board-shell';
    const host = document.createElement('div');
    host.className = 'captures-strip';
    shell.append(host);

    fillDropMiniXiangqiReserve(host, viewFixture(), 'red', { interactive: true });

    expect(shell.classList.contains('drop-mini-reserve-container')).toBe(true);
    expect(host.classList.contains('drop-mini-reserve-strip')).toBe(true);
    expect(host.classList.contains('has-captures')).toBe(true);
    expect(host.querySelector('.mini-xq-capture-piece')).toBeNull();
    expect(host.querySelector('.mini-xq-captures-row')).toBeNull();

    const pieces = [...host.querySelectorAll<HTMLButtonElement>('.drop-mini-reserve-piece')];
    expect(pieces.map((piece) => piece.dataset.drop)).toEqual(['horse', 'cannon']);
    expect(pieces[1]?.querySelector('.captures-count-badge')?.textContent).toBe('2');
  });
});

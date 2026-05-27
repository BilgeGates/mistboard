import { darkChessVariant, type GameState, type Move } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { chapters, learnModules, type TutorialChapter, type Uci } from './learn-content.js';

describe('king capture learn module', () => {
  it('is the first playable lesson module', () => {
    expect(learnModules[0]).toMatchObject({
      id: 'always-take-the-king',
      status: 'available',
      title: 'Always Take The King',
    });
  });

  it('uses visible legal king-capture examples', () => {
    const module = learnModules.find((candidate) => candidate.id === 'always-take-the-king');
    expect(module?.chapterIds?.length).toBeGreaterThanOrEqual(5);

    for (const chapterId of module?.chapterIds ?? []) {
      const chapter = chapters.find((candidate) => candidate.id === chapterId);
      expect(chapter, chapterId).toBeDefined();
      if (!chapter) continue;

      const step = chapter.steps[0]!;
      expect(step.accepted, chapterId).toHaveLength(1);

      const state = stateForChapter(chapter);
      const view = darkChessVariant.getPlayerView(state, 'white');
      const move = moveFromUci(step.accepted[0]!);

      expect(view.board[move.to], `${chapterId}: target should be visible`).toEqual({
        color: 'black',
        role: 'king',
      });
      expect(
        view.legalMoves.some((candidate) => movesMatch(candidate, move)),
        `${chapterId}: accepted move should be legal`,
      ).toBe(true);

      const next = darkChessVariant.applyMove(state, move);
      expect(next.status, `${chapterId}: accepted move should end by king capture`).toEqual({
        type: 'finished',
        winner: 'white',
        reason: 'king-captured',
      });
    }
  });
});

function stateForChapter(chapter: TutorialChapter): GameState {
  return {
    ...darkChessVariant.createInitialState(`learn-test-${chapter.id}`),
    board: chapter.board,
    status: { type: 'playing', turn: 'white' },
    castlingRights: chapter.castlingRights ?? [],
    enPassantSquare: chapter.enPassantSquare,
    halfmoveClock: chapter.halfmoveClock ?? 0,
    moveNumber: chapter.moveNumber ?? 1,
  };
}

function moveFromUci(uci: Uci): Move {
  return {
    from: uci.slice(0, 2) as Move['from'],
    to: uci.slice(2, 4) as Move['to'],
  };
}

function movesMatch(left: Move, right: Move): boolean {
  return (
    left.from === right.from &&
    left.to === right.to &&
    (left.promotion ?? undefined) === (right.promotion ?? undefined)
  );
}

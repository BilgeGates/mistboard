import { describe, expect, it } from 'vitest';
import {
  crossroadsChessReviewUrl,
  crossroadsChessTerminalActionsMarkup,
} from './live-crossroads-chess.js';

describe('Crossroads Chess live room terminal actions', () => {
  it('links finished games to the Crossroads review page', () => {
    const actions = crossroadsChessTerminalActionsMarkup('dchess_test', 'finished');

    expect(actions).toContain('href="/crossroads-chess/game/dchess_test"');
    expect(actions).toContain('Review game');
    expect(actions).toContain('href="/crossroads-chess"');
    expect(actions).toContain('New game');
    expect(actions).toContain('href="/"');
    expect(actions).toContain('Home');
  });

  it('does not offer review or new-game actions after aborts', () => {
    const actions = crossroadsChessTerminalActionsMarkup('dchess_abort', 'aborted');

    expect(actions).not.toContain('Review game');
    expect(actions).not.toContain('/crossroads-chess/game/dchess_abort');
    expect(actions).not.toContain('href="/crossroads-chess"');
    expect(actions).not.toContain('New game');
    expect(actions).toContain('href="/"');
    expect(actions).toContain('Home');
  });

  it('encodes room ids in review URLs', () => {
    expect(crossroadsChessReviewUrl('dchess room')).toBe('/crossroads-chess/game/dchess%20room');
  });
});

import { describe, expect, it } from 'vitest';
import {
  crossroadsChessReviewUrl,
  crossroadsChessTerminalActionsMarkup,
  crossroadsLivePlayAgainRequestBody,
  crossroadsLiveTimeControlLabel,
} from './live-crossroads-chess.js';

describe('Crossroads Chess live room terminal actions', () => {
  it('links finished games to the Crossroads review page', () => {
    const actions = crossroadsChessTerminalActionsMarkup('dchess_test', 'finished');

    expect(actions).toContain('href="/crossroads-chess/game/dchess_test"');
    expect(actions).toContain('Review game');
    expect(actions).toContain('Play again');
    expect(actions).not.toContain('href="/crossroads-chess"');
    expect(actions).toContain('href="/"');
    expect(actions).toContain('Home');
  });

  it('does not offer review or new-game actions after aborts', () => {
    const actions = crossroadsChessTerminalActionsMarkup('dchess_abort', 'aborted');

    expect(actions).not.toContain('Review game');
    expect(actions).not.toContain('/crossroads-chess/game/dchess_abort');
    expect(actions).not.toContain('href="/crossroads-chess"');
    expect(actions).not.toContain('Play again');
    expect(actions).toContain('href="/"');
    expect(actions).toContain('Home');
  });

  it('encodes room ids in review URLs', () => {
    expect(crossroadsChessReviewUrl('dchess room')).toBe('/crossroads-chess/game/dchess%20room');
  });

  it('creates play-again room requests with the current time control', () => {
    expect(crossroadsLivePlayAgainRequestBody({ initialMs: 300_000, incrementMs: 5_000 })).toEqual({
      mode: 'pvp',
      gameSpecId: 'crossroads-chess',
      timeControl: { initialMs: 300_000, incrementMs: 5_000 },
      rated: false,
      preferredColor: 'random',
    });
  });

  it('falls back to 5+5 when a finished live room had no time control', () => {
    expect(crossroadsLivePlayAgainRequestBody(null).timeControl).toEqual({
      initialMs: 300_000,
      incrementMs: 5_000,
    });
  });

  it('formats Crossroads room time controls for the live metadata panel', () => {
    expect(crossroadsLiveTimeControlLabel({ initialMs: 300_000, incrementMs: 5_000 })).toBe('5+5');
    expect(crossroadsLiveTimeControlLabel({ initialMs: 300_000, incrementMs: 0 })).toBe('5+0');
    expect(crossroadsLiveTimeControlLabel(null)).toBeNull();
  });
});

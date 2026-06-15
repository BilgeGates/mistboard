import { describe, expect, it } from 'vitest';
import type { FeaturedGame } from './game-display.js';
import { gameMetaForGame, reviewUrlForGame, timeControlLabelForGame } from './game-meta.js';

function game(overrides: Partial<FeaturedGame>): FeaturedGame {
  return {
    roomId: 'r',
    variant: 'dark-chess',
    result: 'white-wins',
    termination: 'king-captured',
    plyCount: 11,
    whiteName: null,
    blackName: null,
    corpusId: null,
    ...overrides,
  };
}

describe('gameMetaForGame timeControl', () => {
  it('rebuilds a clocked time control from initialMs/incrementMs when timeControl is null', () => {
    // PvP/PvE games store the clock in initialMs/incrementMs columns; the legacy
    // `timeControl` blob is null for them. If we drop it, maybeDeriveThinkingBudget
    // mistakes the clocked game for clockless engine self-play and synthesizes a
    // phantom per-move budget that animates a count-up on the frozen first plies.
    const meta = gameMetaForGame(
      game({ mode: 'pve', timeControl: null, initialMs: 180_000, incrementMs: 2_000 }),
    );
    expect(meta.timeControl).toEqual({ initialMs: 180_000, incrementMs: 2_000 });
  });

  it('defaults increment to 0 when only initialMs is present', () => {
    const meta = gameMetaForGame(game({ timeControl: null, initialMs: 60_000 }));
    expect(meta.timeControl).toEqual({ initialMs: 60_000, incrementMs: 0 });
  });

  it('prefers an explicit timeControl blob over the columns', () => {
    const meta = gameMetaForGame(
      game({ timeControl: { label: '3+2 blitz' }, initialMs: 180_000, incrementMs: 2_000 }),
    );
    expect(meta.timeControl).toEqual({ label: '3+2 blitz' });
  });

  it('leaves clockless engine self-play (EvE) without a time control', () => {
    const meta = gameMetaForGame(
      game({ mode: 'eve', timeControl: null, initialMs: null, incrementMs: null }),
    );
    expect(meta.timeControl).toBeNull();
  });
});

describe('reviewUrlForGame', () => {
  it('routes a finished jieqi game to its family-native review base', () => {
    expect(reviewUrlForGame(game({ variant: 'jieqi', roomId: 'jq_review' }))).toBe(
      '/jieqi/game/jq_review',
    );
  });

  it('falls back to the legacy /game/:id review link for dark chess', () => {
    expect(reviewUrlForGame(game({ variant: 'dark-chess', roomId: 'dchx_review' }))).toBe(
      '/game/dchx_review',
    );
  });
});

describe('timeControlLabelForGame', () => {
  it('renders the official registry label for a recognized clock', () => {
    expect(
      timeControlLabelForGame(game({ timeControl: null, initialMs: 180_000, incrementMs: 2_000 })),
    ).toBe('3 + 2');
    expect(
      timeControlLabelForGame(game({ timeControl: null, initialMs: 60_000, incrementMs: 1_000 })),
    ).toBe('1 + 1');
  });

  it('falls back to the generic formatter for an off-grid clock', () => {
    // A clock outside TIME_CONTROLS (e.g. a legacy/imported game) still gets a
    // readable label rather than disappearing.
    expect(
      timeControlLabelForGame(game({ timeControl: null, initialMs: 120_000, incrementMs: 0 })),
    ).toBe('2:00');
  });

  it('returns null for a clockless game so the badge is omitted', () => {
    expect(
      timeControlLabelForGame(
        game({ mode: 'eve', timeControl: null, initialMs: null, incrementMs: null }),
      ),
    ).toBeNull();
  });
});

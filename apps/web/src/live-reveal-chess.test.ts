import type { RevealChessColor, RevealChessMove, RevealChessPieceRole } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  fillCapturedPool,
  revealChessLivePlayAgainRequestBody,
  revealChessLiveTimeControlLabel,
  revealChessReasonPhrase,
  revealChessReviewUrl,
  visibleMoveRows,
} from './live-reveal-chess.js';

type Captured = { owner: RevealChessColor; role: RevealChessPieceRole | null };
type MoveEvent = {
  type: 'move-played';
  color: RevealChessColor;
  move: RevealChessMove;
  at: number;
};

function host(): HTMLDivElement {
  return document.createElement('div');
}

function pieces(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('.reveal-chess-capture-piece')];
}

describe('Reveal Chess captured pool', () => {
  it('renders nothing and clears has-captures for an empty pool', () => {
    const el = host();
    el.classList.add('has-captures');
    fillCapturedPool(el, [], 'white');
    expect(el.classList.contains('has-captures')).toBe(false);
    expect(pieces(el)).toHaveLength(0);
  });

  it('shows a revealed capture by its true identity', () => {
    const el = host();
    const captured: Captured[] = [{ owner: 'white', role: 'rook' }];
    fillCapturedPool(el, captured, 'white');
    expect(el.classList.contains('has-captures')).toBe(true);
    const [span] = pieces(el);
    expect(span.getAttribute('aria-label')).toBe('white rook');
    // A revealed capture shows the real cburnett glyph, not a "?" disc.
    expect(span.innerHTML).not.toContain('>?</text>');
  });

  it('shows an unidentifiable dark capture as a hidden "?" disc', () => {
    const el = host();
    const captured: Captured[] = [{ owner: 'black', role: null }];
    fillCapturedPool(el, captured, 'black');
    const [span] = pieces(el);
    expect(span.getAttribute('aria-label')).toBe('black hidden piece');
    expect(span.innerHTML).toContain('>?</text>');
  });

  it('only renders pieces belonging to the named owner', () => {
    const el = host();
    const captured: Captured[] = [
      { owner: 'white', role: 'pawn' },
      { owner: 'black', role: 'knight' },
      { owner: 'white', role: null },
    ];
    fillCapturedPool(el, captured, 'white');
    const labels = pieces(el).map((span) => span.getAttribute('aria-label'));
    expect(labels).toEqual(['white pawn', 'white hidden piece']);
  });
});

describe('Reveal Chess live helpers', () => {
  it('encodes room ids in review URLs', () => {
    expect(revealChessReviewUrl('rc room')).toBe('/reveal-chess/game/rc%20room');
  });

  it('builds PvP play-again requests with the current time control', () => {
    expect(revealChessLivePlayAgainRequestBody({ initialMs: 180_000, incrementMs: 2_000 })).toEqual(
      {
        mode: 'pvp',
        gameSpecId: 'reveal-chess',
        preferredColor: 'random',
        timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      },
    );
  });

  it('omits the time control when the finished room had none', () => {
    expect(revealChessLivePlayAgainRequestBody(null)).toEqual({
      mode: 'pvp',
      gameSpecId: 'reveal-chess',
      preferredColor: 'random',
    });
  });

  it('formats room time controls for the live metadata panel', () => {
    expect(revealChessLiveTimeControlLabel({ initialMs: 300_000, incrementMs: 5_000 })).toBe('5+5');
    expect(revealChessLiveTimeControlLabel({ initialMs: 180_000, incrementMs: 0 })).toBe('3+0');
    expect(revealChessLiveTimeControlLabel(null)).toBeNull();
  });

  it('maps kernel + canonical termination reasons to readable phrases', () => {
    expect(revealChessReasonPhrase('checkmate')).toBe('checkmate');
    expect(revealChessReasonPhrase('no-progress-clock')).toBe('no progress');
    expect(revealChessReasonPhrase('progress-clock')).toBe('no progress');
    expect(revealChessReasonPhrase('threefold-repetition')).toBe('repetition');
    expect(revealChessReasonPhrase('repetition')).toBe('repetition');
  });

  it('groups move events into white/black rows with promotion suffixes', () => {
    const moves: MoveEvent[] = [
      { type: 'move-played', color: 'white', move: { from: 'e2', to: 'e3' }, at: 1 },
      { type: 'move-played', color: 'black', move: { from: 'd7', to: 'd6' }, at: 2 },
      {
        type: 'move-played',
        color: 'white',
        move: { from: 'a7', to: 'a8', promotion: 'queen' },
        at: 3,
      },
    ];
    const rows = visibleMoveRows(moves, 3);
    expect(rows).toEqual([
      { fullMove: 1, white: 'e2e3', black: 'd7d6' },
      { fullMove: 2, white: 'a7a8Q' },
    ]);
  });
});

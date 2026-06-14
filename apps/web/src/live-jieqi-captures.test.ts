import type { JieqiColor, JieqiPieceRole } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { fillCapturedPool } from './live-jieqi.js';

// Locks the captured-pool data path that the live room builds after a capture.
// Jieqi positions are public but identities are hidden, so a captured piece is
// either revealed (the captor learns its role) or still "?" to this viewer
// (an opponent took a dark piece, so its role arrives as null). This is the one
// visual the browser smoke could not exercise (that move was not a capture).

type Captured = { owner: JieqiColor; role: JieqiPieceRole | null };

function host(): HTMLDivElement {
  return document.createElement('div');
}

function pieces(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('.mini-xq-capture-piece')];
}

describe('fillCapturedPool', () => {
  it('renders nothing and clears has-captures for an empty pool', () => {
    const el = host();
    el.classList.add('has-captures'); // stale from a prior render
    fillCapturedPool(el, [], 'red');
    expect(el.classList.contains('has-captures')).toBe(false);
    expect(pieces(el)).toHaveLength(0);
  });

  it('shows a revealed capture by its true identity', () => {
    const el = host();
    const captured: Captured[] = [{ owner: 'red', role: 'chariot' }];
    fillCapturedPool(el, captured, 'red');
    expect(el.classList.contains('has-captures')).toBe(true);
    const [span] = pieces(el);
    expect(span.getAttribute('aria-label')).toBe('red chariot');
  });

  it('shows an unidentifiable dark capture as a hidden piece', () => {
    const el = host();
    const captured: Captured[] = [{ owner: 'black', role: null }];
    fillCapturedPool(el, captured, 'black');
    const [span] = pieces(el);
    expect(span.getAttribute('aria-label')).toBe('black hidden piece');
  });

  it('only renders pieces belonging to the named owner', () => {
    const el = host();
    const captured: Captured[] = [
      { owner: 'red', role: 'soldier' },
      { owner: 'black', role: 'horse' },
      { owner: 'red', role: null },
    ];
    fillCapturedPool(el, captured, 'red');
    const labels = pieces(el).map((span) => span.getAttribute('aria-label'));
    expect(labels).toEqual(['red soldier', 'red hidden piece']);
  });
});

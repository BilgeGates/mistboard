import type { BanqiColor, BanqiPieceRole } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { fillCapturedPool } from './live-banqi.js';

// Locks the captured-pool data path the live room builds after a capture. Banqi
// captures only ever remove REVEALED pieces (adjacency and cannon both require a
// revealed target), so every captured piece has a known identity — there is no
// "?" hidden case (the contrast with jieqi). This is the one visual the browser
// smoke could not exercise without a captured position.

type Captured = { owner: BanqiColor; role: BanqiPieceRole };

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

  it('shows a captured piece by its true identity', () => {
    const el = host();
    const captured: Captured[] = [{ owner: 'red', role: 'chariot' }];
    fillCapturedPool(el, captured, 'red');
    expect(el.classList.contains('has-captures')).toBe(true);
    const [span] = pieces(el);
    expect(span.getAttribute('aria-label')).toBe('red chariot');
  });

  it('only renders pieces belonging to the named owner', () => {
    const el = host();
    const captured: Captured[] = [
      { owner: 'red', role: 'soldier' },
      { owner: 'black', role: 'horse' },
      { owner: 'red', role: 'general' },
    ];
    fillCapturedPool(el, captured, 'red');
    const labels = pieces(el).map((span) => span.getAttribute('aria-label'));
    expect(labels).toEqual(['red soldier', 'red general']);
  });

  it('stacks repeats of a role into one glyph with a count badge', () => {
    const el = host();
    // Non-consecutive duplicates must collapse into a single glyph (a full banqi
    // pool would otherwise overflow the strip).
    const captured: Captured[] = [
      { owner: 'red', role: 'soldier' },
      { owner: 'red', role: 'cannon' },
      { owner: 'red', role: 'soldier' },
      { owner: 'red', role: 'soldier' },
    ];
    fillCapturedPool(el, captured, 'red');
    const glyphs = pieces(el);
    // One glyph per distinct role, in first-capture order.
    expect(glyphs.map((span) => span.getAttribute('aria-label'))).toEqual([
      'red soldier x3',
      'red cannon',
    ]);
    const soldier = glyphs[0]!;
    expect(soldier.classList.contains('has-count')).toBe(true);
    expect(soldier.querySelector('.captures-count-badge')?.textContent).toBe('3');
    // A singleton role carries no badge.
    expect(glyphs[1]!.querySelector('.captures-count-badge')).toBeNull();
  });
});

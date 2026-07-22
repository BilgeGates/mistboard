// The fog review surface standardizes on ONE interactive board plus a segmented
// perspective toggle (Red | Truth | Black) — the same control the watch page
// uses — rather than a dominant truth board flanked by two small read-only POV
// boards. This pins the toggle's presence, order, default, and that open
// (single-view) variants render no toggle and no secondary boards.
import { fsfUciToXiangqiSquares, type XiangqiMove } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { mountDarkXiangqiReview } from './dark-xiangqi-review.js';
import { mountXiangqiReview } from './xiangqi-review.js';

const move = (uci: string): XiangqiMove => {
  const m = fsfUciToXiangqiSquares(uci);
  if (!m) throw new Error(`bad uci ${uci}`);
  return m;
};

const SAMPLE_MOVES = ['b3b4', 'b8b7', 'h3h4'].map(move);

function mountFog(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  mountDarkXiangqiReview(root, {
    ariaLabel: 'Fog review',
    title: 'Fog review',
    summary: '',
    moves: SAMPLE_MOVES,
    analysis: null,
  });
  return root;
}

describe('fog review perspective toggle', () => {
  it('renders one board plus a Red | Truth | Black toggle, defaulting to Truth', () => {
    const root = mountFog();

    // One interactive board: no small secondary boards.
    expect(root.querySelectorAll('.review-stage__slot--secondary')).toHaveLength(0);

    const toggle = root.querySelector('.review-pov');
    expect(toggle).not.toBeNull();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.review-pov__button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Red', 'Truth', 'Black']);
    expect(buttons.map((b) => b.dataset.pov)).toEqual(['red', 'truth', 'black']);

    // Truth is selected on mount (the fully-revealed, interactive view).
    const active = buttons.find((b) => b.classList.contains('active'));
    expect(active?.dataset.pov).toBe('truth');
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);

    root.remove();
  });

  it('promotes a POV to the board when its button is clicked', () => {
    const root = mountFog();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.review-pov__button')];
    const red = buttons.find((b) => b.dataset.pov === 'red')!;

    red.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(red.classList.contains('active')).toBe(true);
    expect(red.getAttribute('aria-pressed')).toBe('true');
    expect(buttons.filter((b) => b.classList.contains('active'))).toHaveLength(1);
    // The board host is still a single interactive board (no extra slots grew).
    expect(root.querySelectorAll('.review-stage__slot--secondary')).toHaveLength(0);

    root.remove();
  });
});

describe('open review has no perspective toggle', () => {
  it('renders a single board and no POV toggle for a single-view variant', () => {
    const root = document.createElement('div');
    document.body.append(root);
    mountXiangqiReview(root, {
      ariaLabel: 'Xiangqi review',
      title: 'Xiangqi review',
      summary: '',
      moves: SAMPLE_MOVES,
      analysis: null,
    });
    expect(root.querySelector('.review-pov')).toBeNull();
    expect(root.querySelectorAll('.review-stage__slot--secondary')).toHaveLength(0);
    root.remove();
  });
});

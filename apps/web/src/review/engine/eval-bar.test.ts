import { describe, expect, it } from 'vitest';
import { createEvalBar } from './eval-bar.js';

// The bar had no test coverage before 2026-07-23. These pin the two things a
// reader depends on: where the gridlines sit, and that the fill tracks the eval.

const tickPositions = (el: HTMLElement): number[] =>
  [...el.querySelectorAll<HTMLElement>('.review-eval-bar__tick')]
    .map((t) => Number.parseFloat(t.style.bottom))
    .sort((a, b) => a - b);

describe('eval bar gridlines', () => {
  it('spaces ticks evenly at every eighth, skipping the centre', () => {
    // Even spacing is the whole point: unlabelled ticks read as equal steps, so
    // they must BE equal steps. 50% is the red equality line, drawn in CSS.
    const bar = createEvalBar();
    expect(tickPositions(bar.el)).toEqual([12.5, 25, 37.5, 62.5, 75, 87.5]);
  });

  it('keeps every gap identical', () => {
    const positions = tickPositions(createEvalBar().el);
    const gaps = positions.slice(1).map((p, i) => Number((p - positions[i]!).toFixed(4)));
    // The centre gap spans the skipped equality line, so it is a double step.
    expect(new Set(gaps.filter((g) => g < 20))).toEqual(new Set([12.5]));
  });

  it('is symmetric about the centre', () => {
    const positions = tickPositions(createEvalBar().el);
    expect(positions.map((p) => Number((100 - p).toFixed(4))).sort((a, b) => a - b)).toEqual(
      positions,
    );
  });
});

describe('eval bar fill', () => {
  it('marks the gauge idle without removing it from the layout', () => {
    const bar = createEvalBar();
    bar.setIdle(true);
    expect(bar.el.classList.contains('review-eval-bar--idle')).toBe(true);
    bar.setIdle(false);
    expect(bar.el.classList.contains('review-eval-bar--idle')).toBe(false);
  });

  it('sits at half height for an even position', () => {
    const bar = createEvalBar();
    bar.setEval(0, null);
    const fill = bar.el.querySelector<HTMLElement>('.review-eval-bar__fill');
    expect(fill?.style.height).toBe('50.0%');
  });

  it('grows past half when Red is ahead and shrinks when behind', () => {
    const bar = createEvalBar();
    const height = () =>
      Number.parseFloat(
        bar.el.querySelector<HTMLElement>('.review-eval-bar__fill')?.style.height ?? '0',
      );
    bar.setEval(300, null);
    const ahead = height();
    bar.setEval(-300, null);
    const behind = height();
    expect(ahead).toBeGreaterThan(50);
    expect(behind).toBeLessThan(50);
    expect(Number((ahead + behind).toFixed(0))).toBe(100);
  });

  it('reads a mate as decisive rather than merely large', () => {
    const bar = createEvalBar();
    bar.setEval(null, 3);
    const fill = bar.el.querySelector<HTMLElement>('.review-eval-bar__fill');
    expect(Number.parseFloat(fill?.style.height ?? '0')).toBeGreaterThan(90);
  });
});

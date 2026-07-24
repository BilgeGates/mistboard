import { describe, expect, it } from 'vitest';
import { createEvalBar } from './eval-bar.js';

describe('eval bar ruler', () => {
  it('does not imply a linear scale with unlabelled ticks', () => {
    expect(createEvalBar().el.querySelector('.review-eval-bar__tick')).toBeNull();
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

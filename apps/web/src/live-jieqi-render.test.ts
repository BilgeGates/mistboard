import { createInitialJieqiState, getJieqiPlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { renderJieqiBoardSvg } from './live-jieqi-render.js';

describe('renderJieqiBoardSvg', () => {
  const view = getJieqiPlayerView(createInitialJieqiState('render'), 'red');

  it('renders a 9x10 board with the river and no fog', () => {
    const svg = renderJieqiBoardSvg(view);
    expect(svg).toContain('viewBox="0 0 660 732"');
    expect(svg).toContain('jieqi-river');
    // Jieqi positions are public: there is no fog mask of any kind.
    expect(svg).not.toContain('mask');
    expect(svg.toLowerCase()).not.toContain('fog');
  });

  it('reveals generals and hides every dealt identity', () => {
    const svg = renderJieqiBoardSvg(view);
    expect(svg).toContain('aria-label="red general"');
    expect(svg).toContain('aria-label="black general"');
    const hidden = svg.match(/hidden piece/g) ?? [];
    expect(hidden).toHaveLength(30);
  });

  it('emits an interactive hit layer only when asked', () => {
    expect(renderJieqiBoardSvg(view)).not.toContain('data-square');
    const interactive = renderJieqiBoardSvg(view, 'red', { interactive: true });
    expect(interactive).toContain('data-square="e1"');
    expect(interactive).toContain('data-square="e10"');
  });

  it('draws move hints and a selection ring for the side to move', () => {
    const svg = renderJieqiBoardSvg(view, 'red', {
      selectedSquare: 'a1',
      legalMoves: view.legalMoves.filter((move) => move.from === 'a1'),
    });
    expect(svg).toContain('jieqi-selection');
    expect(svg).toContain('jieqi-hint');
  });
});

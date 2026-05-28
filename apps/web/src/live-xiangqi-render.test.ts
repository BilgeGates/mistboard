import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveRefs } from './live-state.js';
import { liveState } from './live-state.js';
import { type DarkXiangqiWireView, renderDarkXiangqiRoom } from './live-xiangqi-render.js';

describe('Dark Xiangqi live renderer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'true');
    liveState.gameSpecId = 'dark-xiangqi';
    liveState.connectionState = 'connected';
    liveState.closeReason = '';
    liveState.seat = 'red';
    liveState.events = [];
    liveState.state = viewFixture() as never;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    liveState.gameSpecId = null;
    liveState.connectionState = 'connecting';
    liveState.closeReason = '';
    liveState.seat = 'spectator';
    liveState.events = [];
    liveState.state = null;
  });

  it('renders the article-style intersection board instead of a cell grid', () => {
    const refs = refsFixture();

    renderDarkXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    const svg = refs.board.querySelector('.xq-live-svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 552 612');
    expect(refs.board.querySelectorAll('.xq-live-line')).toHaveLength(26);
    expect(refs.board.querySelectorAll('.xq-live-cell')).toHaveLength(0);
    expect(refs.board.querySelector('.xq-live-river text')?.textContent).toBe('楚 河   漢 界');
    expect(refs.board.querySelector('.xq-live-border')).not.toBeNull();
  });

  it('keeps shrouded live pieces role-neutral in the DOM', () => {
    const refs = refsFixture();

    renderDarkXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.board.innerHTML).toContain('aria-label="black hidden piece"');
    expect(refs.board.innerHTML).not.toContain('aria-label="black soldier"');
  });

  it('submits selected legal moves from intersection click targets', () => {
    const refs = refsFixture();
    const sent: unknown[] = [];
    renderDarkXiangqiRoom(refs, {
      reconnectNow: () => {},
      sendSocket: (payload) => {
        sent.push(payload);
        return true;
      },
    });

    refs.board.querySelector<SVGElement>('[data-square="b3"]')?.dispatchEvent(clickEvent());
    refs.board.querySelector<SVGElement>('[data-square="b4"]')?.dispatchEvent(clickEvent());

    expect(sent).toEqual([{ type: 'move', from: 'b3', to: 'b4' }]);
  });

  it('renders stale Dark Xiangqi rooms as unavailable without a board', () => {
    const refs = refsFixture();
    liveState.connectionState = 'rejected';
    liveState.closeReason = 'room unavailable';
    liveState.state = null;

    renderDarkXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.actionStatus.textContent).toContain('Room unavailable');
    expect(refs.actionStatus.textContent).toContain('This Dark Xiangqi room is not active');
    expect(refs.board.querySelector('.xq-live-svg')).toBeNull();
  });
});

function viewFixture(): DarkXiangqiWireView {
  return {
    id: 'xq-test',
    perspective: 'red',
    board: {
      b3: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
      b8: { color: 'black', shrouded: true },
    },
    visibleSquares: ['b3', 'b4', 'b8'],
    legalMoves: [{ from: 'b3', to: 'b4' }],
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
  };
}

function refsFixture(): LiveRefs {
  const root = document.createElement('div');
  root.innerHTML = '<button data-replay="first"></button><button data-replay="next"></button>';
  return {
    actionSection: el('section'),
    actionStatus: el('div'),
    board: el('div'),
    boardPaused: el('div'),
    boardStatus: el('div'),
    capturesBottom: el('div'),
    capturesTop: el('div'),
    clockBottom: el('div'),
    clockNote: el('p'),
    clockTop: el('div'),
    devViews: el('div'),
    devViewsSection: el('section'),
    draftPicker: el('div'),
    gameControls: el('div'),
    gameControlsSection: el('section'),
    gameInfo: el('div'),
    moveList: el('ol'),
    offerSection: el('section'),
    promotion: el('div'),
    replayControls: root.querySelectorAll<HTMLButtonElement>('[data-replay]'),
    replayMeta: el('p'),
    roomActions: el('div'),
    roomMeta: el('p'),
    selectionList: el('div'),
    selectionSection: el('section'),
    starts: el('div'),
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] {
  return document.createElement(tagName);
}

function clickEvent(): MouseEvent {
  return new MouseEvent('click', { bubbles: true });
}

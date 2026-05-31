import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isDarkMiniXiangqiLiveRoom,
  renderDarkMiniXiangqiRoom,
  resetDarkMiniXiangqiReplayState,
} from './live-mini-xiangqi-room.js';
import type { LiveRefs } from './live-state.js';
import { liveState } from './live-state.js';

type MiniView = {
  id: string;
  perspective: 'red' | 'black';
  board: Record<
    string,
    { piece: { color: string; role: string }; shrouded: false } | { color: string; shrouded: true }
  >;
  visibleSquares: string[];
  legalMoves: { from: string; to: string }[];
  status: { type: string; turn?: string; winner?: string | null; reason?: string };
  moveNumber: number;
  lastMove?: { from: string; to: string };
};

describe('Dark Mini Xiangqi live room', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    liveState.gameSpecId = 'dark-mini-xiangqi';
    liveState.connectionState = 'connected';
    liveState.closeReason = '';
    liveState.room = 'dmxq_test';
    liveState.seat = 'red';
    liveState.events = [];
    liveState.state = viewFixture() as never;
    resetDarkMiniXiangqiReplayState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    document.body.classList.remove('live-route--mini-xiangqi');
    liveState.gameSpecId = null;
    liveState.connectionState = 'connecting';
    liveState.seat = 'spectator';
    liveState.events = [];
    liveState.state = null;
    resetDarkMiniXiangqiReplayState();
  });

  it('detects a dark-mini-xiangqi live room', () => {
    expect(isDarkMiniXiangqiLiveRoom()).toBe(true);
    liveState.gameSpecId = 'dark-xiangqi';
    expect(isDarkMiniXiangqiLiveRoom()).toBe(false);
  });

  it('renders the 7x7 intersection board with a fog mask and tags the layout', () => {
    const refs = refsFixture();

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    const svg = refs.board.querySelector('.mini-xq-board');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 516 516');
    expect(refs.board.querySelector('mask')).not.toBeNull();
    expect(document.body.classList.contains('live-route--mini-xiangqi')).toBe(true);
  });

  it('keeps shrouded live pieces role-neutral in the DOM', () => {
    const refs = refsFixture();

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.board.innerHTML).toContain('aria-label="black hidden piece"');
    expect(refs.board.innerHTML).not.toContain('aria-label="black soldier"');
  });

  it('submits a selected legal move from intersection click targets', () => {
    const refs = refsFixture();
    const sent: unknown[] = [];
    renderDarkMiniXiangqiRoom(refs, {
      reconnectNow: () => {},
      sendSocket: (payload) => {
        sent.push(payload);
        return true;
      },
    });

    refs.board.querySelector<SVGElement>('[data-square="b1"]')?.dispatchEvent(clickEvent());
    refs.board.querySelector<SVGElement>('[data-square="b2"]')?.dispatchEvent(clickEvent());

    expect(sent).toEqual([{ type: 'move', from: 'b1', to: 'b2' }]);
  });

  it('shows resign controls only after the first-move window', () => {
    const refs = refsFixture();
    liveState.state = { ...viewFixture(), moveNumber: 2 } as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.textContent).toContain('Resign');
  });

  it('shows abort controls during the first-move window', () => {
    const refs = refsFixture();

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.textContent).toContain('Abort');
  });

  it('renders aborted rooms without reading a side to move', () => {
    const refs = refsFixture();
    liveState.state = {
      ...viewFixture(),
      status: { type: 'aborted', reason: 'user-abort' },
      legalMoves: [],
    } as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.actionStatus.textContent).toContain('Game aborted');
    expect(refs.gameControlsSection.hidden).toBe(true);
  });

  it('scrubs back through snapshots and returns to live', () => {
    const refs = refsFixture();
    const callbacks = { reconnectNow: () => {}, sendSocket: () => true };

    liveState.state = viewFixture() as never;
    renderDarkMiniXiangqiRoom(refs, callbacks);
    liveState.state = {
      ...viewFixture(),
      board: {
        b2: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
        b7: { color: 'black', shrouded: true },
      },
      lastMove: { from: 'b1', to: 'b2' },
      status: { type: 'playing', turn: 'black' },
      visibleSquares: ['b2', 'b7'],
    } as never;
    renderDarkMiniXiangqiRoom(refs, callbacks);

    expect(refs.replayMeta.textContent).toBe('Live · ply 1 of 1');
    refs.replayControls[0]!.dispatchEvent(clickEvent()); // first
    expect(refs.replayMeta.textContent).toBe('Replay · ply 0 of 1');
    refs.replayControls[1]!.dispatchEvent(clickEvent()); // next
    expect(refs.replayMeta.textContent).toBe('Live · ply 1 of 1');
  });

  it('renders visible moves in full-move rows with hidden opponent plies', () => {
    const refs = refsFixture();
    liveState.state = {
      ...viewFixture(),
      moveNumber: 2,
      status: { type: 'playing', turn: 'black' },
    } as never;
    liveState.events = [
      { type: 'move-played', at: 2, color: 'red', move: { from: 'b1', to: 'b2' }, ply: 1 },
      { type: 'move-played', at: 4, color: 'red', move: { from: 'b2', to: 'b3' }, ply: 3 },
    ] as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    const rows = [...refs.moveList.querySelectorAll('.xiangqi-move-row')].map((row) =>
      row.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows).toEqual(['1.b1-b2...', '2.b2-b3']);
  });
});

function viewFixture(): MiniView {
  return {
    id: 'mxq-test',
    perspective: 'red',
    board: {
      b1: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
      b7: { color: 'black', shrouded: true },
    },
    visibleSquares: ['b1', 'b2', 'b7'],
    legalMoves: [{ from: 'b1', to: 'b2' }],
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

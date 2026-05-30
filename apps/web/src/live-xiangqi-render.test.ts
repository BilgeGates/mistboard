import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveRefs } from './live-state.js';
import { liveState } from './live-state.js';
import {
  type DarkXiangqiWireView,
  renderDarkXiangqiRoom,
  resetDarkXiangqiReplayState,
} from './live-xiangqi-render.js';

describe('Dark Xiangqi live renderer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'true');
    liveState.gameSpecId = 'dark-xiangqi';
    liveState.connectionState = 'connected';
    liveState.closeReason = '';
    liveState.seat = 'red';
    liveState.events = [];
    liveState.state = viewFixture() as never;
    resetDarkXiangqiReplayState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    liveState.gameSpecId = null;
    liveState.connectionState = 'connecting';
    liveState.closeReason = '';
    liveState.seat = 'spectator';
    liveState.events = [];
    liveState.state = null;
    resetDarkXiangqiReplayState();
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

  it('shows Dark Xiangqi resign controls only after the first-move window', () => {
    const refs = refsFixture();
    liveState.state = { ...viewFixture(), moveNumber: 2 } as never;

    renderDarkXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.textContent).toContain('Resign');
  });

  it('shows Dark Xiangqi abort controls during the first-move window', () => {
    const refs = refsFixture();

    renderDarkXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.textContent).toContain('Abort');
  });

  it('renders aborted Dark Xiangqi rooms without reading a side to move', () => {
    const refs = refsFixture();
    liveState.state = {
      ...viewFixture(),
      status: { type: 'aborted', reason: 'user-abort' },
      legalMoves: [],
    } as never;

    renderDarkXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.actionStatus.textContent).toContain('Game aborted');
    expect(refs.actionStatus.textContent).toContain('before both sides completed their first move');
    expect(refs.gameControlsSection.hidden).toBe(true);
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

  it('renders visible moves in full-move rows with hidden opponent plies', () => {
    const refs = refsFixture();
    liveState.state = {
      ...viewFixture(),
      moveNumber: 2,
      status: { type: 'playing', turn: 'black' },
    } as never;
    liveState.events = [
      { type: 'move-played', at: 2, color: 'red', move: { from: 'b3', to: 'b4' }, ply: 1 },
      { type: 'move-played', at: 4, color: 'red', move: { from: 'b4', to: 'b5' }, ply: 3 },
    ] as never;

    renderDarkXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    const rows = [...refs.moveList.querySelectorAll('.xiangqi-move-row')].map((row) =>
      row.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows).toEqual(['1.b3-b4...', '2.b4-b5']);
  });

  it('renders hidden opponent plies even before the seated player has a visible move', () => {
    const refs = refsFixture();
    liveState.seat = 'black';
    liveState.state = {
      ...viewFixture(),
      perspective: 'black',
      status: { type: 'playing', turn: 'black' },
    } as never;

    renderDarkXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.moveList.textContent?.replace(/\s+/g, '')).toBe('1....');
  });

  it('enables replay navigation for Dark Xiangqi live snapshots', () => {
    const refs = refsFixture();
    const callbacks = { reconnectNow: () => {}, sendSocket: () => true };

    liveState.state = viewFixture() as never;
    renderDarkXiangqiRoom(refs, callbacks);
    liveState.state = {
      ...viewFixture(),
      board: {
        b4: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
        b8: { color: 'black', shrouded: true },
      },
      lastMove: { from: 'b3', to: 'b4' },
      status: { type: 'playing', turn: 'black' },
      visibleSquares: ['b4', 'b8'],
    } as never;
    renderDarkXiangqiRoom(refs, callbacks);

    expect(refs.replayMeta.textContent).toBe('Live · ply 1 of 1');
    const first = refs.replayControls[0]!;
    first.dispatchEvent(clickEvent());

    expect(refs.replayMeta.textContent).toBe('Replay · ply 0 of 1');
    expect(refs.board.innerHTML).toContain('data-square="b3"');
  });

  it('shows terminal room actions for Dark Xiangqi games', () => {
    const refs = refsFixture();
    liveState.room = 'dxq_done';
    liveState.state = {
      ...viewFixture(),
      status: { type: 'finished', winner: 'red', reason: 'resignation' },
      legalMoves: [],
    } as never;

    renderDarkXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.roomActions.textContent).toContain('Play again');
    expect(refs.roomActions.textContent).toContain('Home');
    expect(refs.roomActions.textContent).toContain('Game review');
    expect(
      refs.roomActions.querySelector<HTMLAnchorElement>('a[href="/dark-xiangqi/game/dxq_done"]'),
    ).not.toBeNull();
  });

  it('creates play-again Dark Xiangqi rooms with the current room time control', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchSpy);
    const refs = refsFixture();
    liveState.room = 'dxq_done';
    liveState.events = [
      {
        type: 'room-created',
        roomId: 'dxq_done',
        gameSpecId: 'dark-xiangqi',
        at: 1,
        timeControl: { initialMs: 60_000, incrementMs: 1_000 },
      },
    ] as never;
    liveState.state = {
      ...viewFixture(),
      status: { type: 'finished', winner: 'red', reason: 'resignation' },
      legalMoves: [],
    } as never;

    renderDarkXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });
    refs.roomActions
      .querySelector<HTMLButtonElement>('button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'pvp',
        gameSpecId: 'dark-xiangqi',
        preferredColor: 'random',
        timeControl: { initialMs: 60_000, incrementMs: 1_000 },
      }),
    });
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

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status ?? 200,
  });
}

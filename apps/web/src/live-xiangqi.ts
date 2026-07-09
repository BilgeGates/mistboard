// Live multiplayer room client for standard Xiangqi (9x10) — an OPEN-INFORMATION
// tenant on the generic live-client core (variant-tenant/live-client.ts owns
// bootstrap, frame application, renderAll skeleton, the replay CAPTURE
// controller, and the two-column move list). This module keeps what is genuinely
// standard Xiangqi's: the intersection-board SVG, click/drag over pieces, and the
// pure click-to-move decision. The postgame module reuses renderXiangqiBoardSvg.
//
// Unlike Dark Xiangqi there is NO fog: every player and spectator receives the
// full truth board (plain pieces, no shrouding), so there is no fog mask, no
// shrouded entries, and no visible-square gating.

import {
  type StandardXiangqiPlayerView,
  XIANGQI_SPEC_ID,
  type XiangqiColor,
  type XiangqiMove,
} from '@mistboard/game';
import './live-xiangqi.css';
import { xiangqiEnabled } from './feature-flags.js';
import { playSound } from './live-sound.js';
import type { LiveRefs } from './live-state.js';
import {
  maybePlayXiangqiSnapshotSound,
  resetXiangqiSoundState,
  soundForOwnXiangqiMove,
} from './live-xiangqi-sound.js';
import {
  createTenantLiveClient,
  type TenantLiveClientContext,
  type TenantLiveEvent,
  type TenantMovePlayed,
} from './variant-tenant/live-client.js';
import type { WebVariantTenant } from './variant-tenant/room-chrome.js';
import {
  createXiangqiInteractiveBoard,
  isXiangqiColor,
  type XiangqiInteractiveBoard,
} from './xiangqi-board.js';

export type { XiangqiClickResult } from './xiangqi-board.js';
// The board geometry, SVG layers, pure click-to-move decision, and the
// interactive board instance now live in the shared xiangqi-board module (also
// consumed by the analysis board). Re-export the render-only SVG for this
// module's existing importers (postgame / replay / broadcast).
export { renderXiangqiBoardSvg, xiangqiClickResult } from './xiangqi-board.js';

type XiangqiMoveEvent = TenantMovePlayed<XiangqiColor, XiangqiMove>;

// ── Xiangqi-owned live state ─────────────────────────────────────────────────

let core: TenantLiveClientContext<XiangqiColor, StandardXiangqiPlayerView> | null = null;
// The instance-based interactive board, created once at setup. It owns its own
// selection/drag state; this module supplies the live policies + move sink.
let board: XiangqiInteractiveBoard | null = null;

function livePerspective(view: StandardXiangqiPlayerView): XiangqiColor {
  return core?.orientation() ?? view.perspective;
}

// ── Shared tenant room chrome config ─────────────────────────────────────────

const xiangqiWebTenant: WebVariantTenant<XiangqiColor> = {
  displayName: 'Elephant Chess',
  colors: ['red', 'black'],
  isColor: isXiangqiColor,
  oppositeColor: (color) => (color === 'red' ? 'black' : 'red'),
  enabled: xiangqiEnabled,
  reviewUrl: (roomId) => `/xiangqi/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: xiangqiReasonPhrase,
  disabledTitle: 'Elephant Chess disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Elephant Chess room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching the full board.',
  selectInstruction: 'Select one of your pieces, then choose a destination.',
};

function xiangqiReasonPhrase(reason: string): string {
  switch (reason) {
    case 'checkmate':
      return 'checkmate';
    case 'stalemate':
      return 'stalemate';
    case 'general-captured':
      return 'general capture';
    case 'timeout':
      return 'timeout';
    case 'resignation':
      return 'resignation';
    case 'abandonment':
      return 'abandonment';
    case 'repetition':
      return 'threefold repetition';
    default:
      return 'the game rules';
  }
}

const client = createTenantLiveClient<XiangqiColor, StandardXiangqiPlayerView, XiangqiMove>({
  tenant: xiangqiWebTenant,
  gameSpecId: XIANGQI_SPEC_ID,
  defaultRoomId: 'xq_dev',
  boardClass: 'xiangqi-live-board',
  playAgainRequestBody: (state) => ({
    mode: 'pvp',
    gameSpecId: XIANGQI_SPEC_ID,
    preferredColor: 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  onSnapshotApplied: () => {
    if (core) maybePlayXiangqiSnapshotSound(core.state.view, core.state.seat);
  },
  onEventApplied: () => {
    if (core) maybePlayXiangqiSnapshotSound(core.state.view, core.state.seat);
  },
  resetSounds: resetXiangqiSoundState,
  resetState: () => {
    board?.clearSelection();
  },
  renderBoard,
  onDisabled: () => {
    board?.clearSelection();
  },
  setup: (ctx) => {
    core = ctx;
    board = createXiangqiInteractiveBoard({
      board: ctx.refs.board,
      getInteractionView: () => core?.state.view ?? null,
      getPerspective: () => {
        const view = core?.state.view;
        return view ? livePerspective(view) : 'red';
      },
      // Live: only the seated player's own pieces are interactive.
      seatFor: () => {
        const seat = core?.state.seat;
        return isXiangqiColor(seat) ? seat : null;
      },
      // Live gate: connected AND live (not scrubbing replay history).
      enabled: () => Boolean(core?.replay.isLive()) && core?.connection() === 'connected',
      // Optimistic-free: send to the server; the confirmed frame re-renders.
      onMove: (move, view) => {
        if (core?.send({ type: 'move', from: move.from, to: move.to })) {
          playSound(soundForOwnXiangqiMove(view, move));
        }
      },
    });
  },
  moveList: {
    rowClass: 'move-row xiangqi-move-row',
    cellPrefix: 'xiangqi-move-row',
    listClass: 'xiangqi-move-list',
    masked: false,
    emptyText: 'No moves yet',
    notate: (move) => `${move.from}-${move.to}`,
    isMoveEvent: isXiangqiMoveEvent,
  },
  replayCapture: {
    positionKey: replayPositionKey,
    plyForView: (view, ctx) => {
      if (view.status.type === 'playing') {
        const completedFullMoves = Math.max(0, view.moveNumber - 1);
        return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
      }
      if (ctx.positionChanged && view.lastMove) return ctx.latestPly + 1;
      return ctx.latestPly;
    },
  },
});

export function bootstrapXiangqiLiveRoom(): void {
  client.bootstrap();
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderBoard(liveRefs: LiveRefs, view: StandardXiangqiPlayerView | null): void {
  liveRefs.board.className = 'board xiangqi-live-board';
  liveRefs.board.setAttribute('aria-label', 'Elephant Chess board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }
  // The instance board (created in setup) owns selection/drag state and the SVG
  // layers; click + drag are delegated once and survive these re-renders.
  board?.render(view, livePerspective(view));
}

// ── Notation + replay capture key ────────────────────────────────────────────

function isXiangqiMoveEvent(event: TenantLiveEvent): event is XiangqiMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isXiangqiColor((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as { from?: unknown }).from === 'string' &&
    typeof (move as { to?: unknown }).to === 'string'
  );
}

function replayPositionKey(view: StandardXiangqiPlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, piece]) => [square, piece.color, piece.role]);
  return JSON.stringify({
    board,
    lastMove: view.lastMove ?? null,
    moveNumber: view.moveNumber,
    perspective: view.perspective,
    turn: view.status.type === 'playing' ? view.status.turn : view.status.type,
  });
}

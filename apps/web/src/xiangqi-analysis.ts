// Analysis board for standard Xiangqi fed by a bare MOVE LIST rather than a
// persisted room. This is the imported-game / study path: the same shared review
// shell (mountReviewLayout) the /game postgame rides, but the per-ply positions
// are reconstructed on the client from the moves (buildXiangqiReplayFromMoves)
// and the whole-game engine runs locally (ceval) — no server round-trip, so it
// works for a game that was never played on the platform.
//
// The board + captures + eval gauge + engine panel + move list + analysis UI
// all live in the shared review/xiangqi-review.ts (the DRY-extract with
// xiangqi-postgame.ts); this file only supplies the replay model and the
// client-side ceval sweep (no server room to analyse — computeGameAnalysis on
// per-ply evals computed in the browser).

import { type XiangqiGameStatus, type XiangqiMove, xiangqiMoveToFsfUci } from '@mistboard/game';
import './game-shell.css';
import './live-xiangqi.css';
import './dark-xiangqi-postgame.css';
import './xiangqi-postgame.css';
import { createCeval } from './review/engine/ceval.js';
import { computeGameAnalysis, type GameAnalysis, type PlyEval } from './review/game-analysis.js';
import { mountXiangqiReview } from './review/xiangqi-review.js';
import {
  buildXiangqiReplayFromMoves,
  type XiangqiReplay,
  xiangqiReplayViewAtPly,
} from './review/xiangqi-review-model.js';

// Depth for the whole-game sweep. Shallower than the live panel's interactive
// search so N+1 sequential evaluations stay tolerable on a client (the server
// Pikafish path goes deeper; this is the roomless fallback).
const ANALYSIS_SWEEP_DEPTH = 12;

function statusSummary(status: XiangqiGameStatus, plyCount: number): string {
  const plies = `${plyCount} ${plyCount === 1 ? 'ply' : 'plies'}`;
  if (status.type === 'finished') {
    const outcome =
      status.winner === 'red' ? 'Red wins' : status.winner === 'black' ? 'Black wins' : 'Draw';
    return `${outcome} by ${status.reason} · ${plies}`;
  }
  return `Analysis · ${plies}`;
}

export interface XiangqiAnalysisOptions {
  /** Left-rail title (default "Xiangqi analysis"). */
  title?: string;
}

/** Mount the review board for an arbitrary standard-xiangqi move list. Illegal
 *  moves truncate the replay to the legal prefix and surface a notice rather
 *  than throwing. */
export function mountXiangqiAnalysis(
  root: HTMLElement,
  moves: XiangqiMove[],
  opts: XiangqiAnalysisOptions = {},
): void {
  const replay = buildXiangqiReplayFromMoves(moves);
  const engineMovesUci = replay.moves.map((move) => xiangqiMoveToFsfUci(move));

  // Evaluate every ply cursor (0..N) in the browser and build the Red-POV eval
  // series computeGameAnalysis expects. ceval scores are side-to-move POV, so
  // they flip on black-to-move plies (ply 0 = start = red to move).
  async function runClientAnalysis(
    onProgress: (done: number, total: number) => void,
  ): Promise<GameAnalysis> {
    const handle = createCeval('xiangqi');
    const plies: PlyEval[] = [];
    try {
      for (let ply = 0; ply <= replay.maxPly; ply += 1) {
        const update = await handle.evaluate({
          movesUci: engineMovesUci.slice(0, ply),
          multiPv: 1,
          maxDepth: ANALYSIS_SWEEP_DEPTH,
        });
        const best = update.lines[0];
        const redToMove = ply % 2 === 0;
        const cp = best?.scoreCp ?? null;
        const mate = best?.mate ?? null;
        plies.push({
          ply,
          cp: cp === null ? null : redToMove ? cp : -cp,
          mate: mate === null ? null : redToMove ? mate : -mate,
          best: best?.pvUci[0] ?? null,
        });
        onProgress(ply, replay.maxPly);
      }
    } finally {
      handle.dispose();
    }
    return computeGameAnalysis({
      engineId: 'fairy-stockfish',
      depth: ANALYSIS_SWEEP_DEPTH,
      plies,
    });
  }

  const finalStatus = xiangqiReplayViewAtPly(replay, replay.maxPly).status;

  root.replaceChildren();
  mountXiangqiReview(root, {
    pageClassName: 'xiangqi-review',
    ariaLabel: 'Xiangqi analysis',
    title: opts.title ?? 'Xiangqi analysis',
    summary: statusSummary(finalStatus, replay.maxPly),
    boardAriaLabel: 'Xiangqi board',
    actions: analysisActions(),
    details: replay.illegalAt ? illegalNotice(replay) : undefined,
    moves: replay.moves,
    maxPly: replay.maxPly,
    viewAtPly: (ply) => xiangqiReplayViewAtPly(replay, ply),
    // Roomless import: the whole-game analysis is a client ceval sweep.
    analysis: {
      requestLabel: 'Analyse the whole game',
      run: runClientAnalysis,
    },
  });
}

function analysisActions(): HTMLElement {
  const actions = document.createElement('nav');
  actions.className = 'dxq-postgame__actions';
  actions.setAttribute('aria-label', 'Analysis links');
  const home = document.createElement('a');
  home.className = 'dxq-postgame__link';
  home.href = '/';
  home.textContent = 'Back home';
  actions.append(home);
  return actions;
}

function illegalNotice(replay: XiangqiReplay): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Truncated import';
  const body = document.createElement('p');
  const move = replay.illegalAt;
  body.textContent = move
    ? `Move ${move.ply} (${move.move.from}-${move.move.to}) is illegal from that position; showing the first ${replay.maxPly} legal ${replay.maxPly === 1 ? 'move' : 'moves'}.`
    : '';
  panel.append(heading, body);
  return panel;
}

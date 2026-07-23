// Opening explorer read API.
//
//   GET /api/xiangqi/explorer?fen=<position>   moves played from this position
//
// `fen` accepts either a bare position key ("<placement> r") or a full
// standardXiangqiFen — only the placement and side-to-move are read, so the
// caller can pass whatever its board hands it without normalizing first.
//
// The response always states the corpus it came from. An explorer that renders
// "3 games" without saying it is drawn from ~10k anonymized club games invites
// the reader to treat it as authority; the build block is what keeps the
// surface honest.

import type { IncomingMessage, ServerResponse } from 'node:http';
import * as persistence from './../persistence.js';
import { canonicalPosition, mirrorMove } from './../xiangqi-opening-mirror.js';
import { openingNameForCanonicalKey } from './../xiangqi-opening-names.js';
import { requireMethod, requirePersistence, writeJson } from './lib.js';

// Side to move is r/b, or '-' for a FINISHED position (the kernel's own key
// spelling). A terminal position has no continuations, so it answers an empty
// result rather than an error: a review page opening on the final move of a
// checkmate would otherwise report the explorer as broken.
const POSITION_KEY = /^([a-zA-Z0-9/]+)\s+([rb-])(?:\s|$)/;

/** Example games shown under the move table, best first. */
const TOP_GAMES = 8;

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  if (pathname !== '/api/xiangqi/explorer') return false;
  if (!requireMethod(request, response, 'GET')) return true;
  if (!requirePersistence(response)) return true;

  const positionKey = normalizePositionKey(parsedUrl.searchParams.get('fen'));
  if (!positionKey) {
    writeJson(response, 400, { error: 'invalid_position' });
    return true;
  }

  const build = await persistence.readXiangqiOpeningBuild();
  if (positionKey.endsWith(' -')) {
    writeJson(response, 200, {
      position: positionKey,
      opening: null,
      total: 0,
      moves: [],
      topGames: [],
      build: buildBlock(build),
    });
    return true;
  }

  // Positions are stored mirror-canonically; ask under the canonical key and
  // mirror the answer back into the caller's frame, so a client never has to
  // know the storage convention. The opening NAME hangs off the same canonical
  // key, so a line and its mirror image resolve to one name for free.
  const canonical = canonicalPosition(positionKey);
  const opening = openingNameForCanonicalKey(canonical.key);
  const stored = await persistence.lookupXiangqiOpeningMoves(canonical.key);
  const moves = canonical.mirrored
    ? stored.map((row) => ({ ...row, move: mirrorMove(row.move) }))
    : stored;
  // Sum of the per-move game counts. Each row counts a game at most once, but a
  // game that revisits this position and plays a different move counts under
  // each, so this can slightly exceed the number of distinct games that reached
  // here. It is the correct denominator for a move's share, not a game census.
  const total = moves.reduce((sum, row) => sum + row.games, 0);

  // Position-level "Top games": each move keeps its own highest-rated examples,
  // so the union's best N is exactly the position's best N.
  const topGames = moves
    .flatMap((row) => row.sampleGames)
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    .slice(0, TOP_GAMES);

  writeJson(response, 200, {
    position: positionKey,
    total,
    moves: moves.map((row) => ({
      from: row.move.from,
      to: row.move.to,
      games: row.games,
      redWins: row.redWins,
      blackWins: row.blackWins,
      draws: row.draws,
      unknowns: row.unknowns,
    })),
    opening,
    topGames,
    build: buildBlock(build),
  });
  return true;
}

function buildBlock(
  build: persistence.XiangqiOpeningBuildInfo | null,
): { gameCount: number; maxPly: number; sources: string[]; builtAt: string } | null {
  if (!build) return null;
  return {
    gameCount: build.gameCount,
    maxPly: build.maxPly,
    sources: build.sourceSlugs,
    builtAt: build.builtAt.toISOString(),
  };
}

/**
 * Reduce any accepted spelling to the stored key. Placement plus side to move
 * is the whole key: clocks and move numbers must NOT participate, or the same
 * position reached by different move orders would miss its own statistics.
 */
function normalizePositionKey(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return null;
  const match = trimmed.match(POSITION_KEY);
  if (!match) return null;
  return `${match[1]} ${match[2]}`;
}

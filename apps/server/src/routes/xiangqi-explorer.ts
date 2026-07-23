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
import { requireMethod, requirePersistence, writeJson } from './lib.js';

const POSITION_KEY = /^([a-zA-Z0-9/]+)\s+([rb])(?:\s|$)/;

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

  const [moves, build] = await Promise.all([
    persistence.lookupXiangqiOpeningMoves(positionKey),
    persistence.readXiangqiOpeningBuild(),
  ]);
  const total = moves.reduce((sum, row) => sum + row.games, 0);

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
      sampleGameIds: row.sampleGameIds,
    })),
    build: build
      ? {
          gameCount: build.gameCount,
          maxPly: build.maxPly,
          sources: build.sourceSlugs,
          builtAt: build.builtAt.toISOString(),
        }
      : null,
  });
  return true;
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

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Color, GameEvent } from '@mistboard/game';
import { currentAccountUser } from './../account-session.js';
import { buildGamePgn, buildGamePublicationJson } from './../game-export.js';
import * as persistence from './../persistence.js';
import {
  eventReplayResponse,
  isProductionLikeRuntime,
  parsePositiveInteger,
} from './../server-policy.js';
import {
  type HttpApiContext,
  isHttpAdminAuthorized,
  requireMethod,
  requirePersistence,
  writeJson,
} from './lib.js';

type ReviewArtifactType = 'belief-snapshot' | 'trace-row' | 'engine-move-choice';

const WATCH_UNLOCK_LIMIT = 20;
const WATCH_UNLOCK_WINDOW_MS = 2 * 60 * 60 * 1000;

export async function tryHandle(
  ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  const url = request.url ?? '/';

  if (pathname === '/api/watch') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const now = new Date();
    const [sealedCount, unlocked] = await Promise.all([
      persistence.countWatchSealedGames(),
      persistence.listWatchUnlockedGames({
        limit: WATCH_UNLOCK_LIMIT,
        now,
        unlockWindowMs: WATCH_UNLOCK_WINDOW_MS,
      }),
    ]);
    writeJson(response, 200, {
      now: now.toISOString(),
      unlockWindowMs: WATCH_UNLOCK_WINDOW_MS,
      sealedCount,
      unlocked,
    });
    return true;
  }

  if (pathname === '/api/games/recent') {
    if (!requirePersistence(response)) return true;
    const games = await persistence.listRecentPublicGames(10);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ games }));
    return true;
  }

  const reviewMatch = url.match(/^\/api\/games\/([^/]+)\/review$/);
  if (reviewMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    const roomId = decodeURIComponent(reviewMatch[1]!);
    const review = await gameReviewForApi(ctx, roomId, request);
    if (!review) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, review);
    return true;
  }

  const artifactsMatch = pathname.match(/^\/api\/games\/([^/]+)\/artifacts$/);
  if (artifactsMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    const artifactType = parseReviewArtifactType(parsedUrl.searchParams.get('type'));
    if (!artifactType) {
      writeJson(response, 400, { error: 'invalid_artifact_type' });
      return true;
    }
    const color = parseOptionalColor(parsedUrl.searchParams.get('color'));
    if (parsedUrl.searchParams.has('color') && !color) {
      writeJson(response, 400, { error: 'invalid_color' });
      return true;
    }
    const roomId = decodeURIComponent(artifactsMatch[1]!);
    const artifactResponse = await gameArtifactsForApi(ctx, roomId, artifactType, color, request);
    if (!artifactResponse) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (artifactResponse.status === 403) {
      writeJson(response, 403, { error: 'forbidden' });
      return true;
    }
    writeJson(response, 200, artifactResponse.body);
    return true;
  }

  const exportMatch = pathname.match(/^\/api\/games\/([^/]+)\/export\.(pgn|json)$/);
  if (exportMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    const roomId = decodeURIComponent(exportMatch[1]!);
    const format = exportMatch[2]!;
    const summary = await gameSummaryForApi(ctx, roomId);
    const events = await gameEventsForApi(ctx, roomId);
    const replayResponse = eventReplayResponse(events);
    if (replayResponse.status !== 200 || !summary || !events) {
      writeJson(response, replayResponse.status, replayResponse.body);
      return true;
    }
    if (summary.variant === 'draft960') {
      writeJson(response, 501, {
        error: 'export_not_supported_for_variant',
        variant: summary.variant,
      });
      return true;
    }
    if (format === 'pgn') {
      const pgn = buildGamePgn(summary, events);
      response.writeHead(200, {
        'content-type': 'application/x-chess-pgn; charset=utf-8',
        'content-disposition': `inline; filename="mistboard-${roomId}.pgn"`,
      });
      response.end(pgn);
      return true;
    }
    const payload = buildGamePublicationJson(summary, events);
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `inline; filename="mistboard-${roomId}.json"`,
    });
    response.end(JSON.stringify(payload));
    return true;
  }

  const summaryMatch = url.match(/^\/api\/games\/([^/]+)$/);
  if (summaryMatch) {
    const roomId = decodeURIComponent(summaryMatch[1]!);
    const game = await gameSummaryForApi(ctx, roomId);
    if (!game) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return true;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ game }));
    return true;
  }

  const eventsMatch = url.match(/^\/api\/games\/([^/]+)\/events$/);
  if (eventsMatch) {
    const roomId = decodeURIComponent(eventsMatch[1]!);
    const events = await gameEventsForApi(ctx, roomId);
    const replayResponse = eventReplayResponse(events);
    response.writeHead(replayResponse.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(replayResponse.body));
    return true;
  }

  if (pathname === '/api/games') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    if (!isHttpAdminAuthorized(request)) {
      response.writeHead(403, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'admin_required' }));
      return true;
    }

    const date = parseUtcDateParam(parsedUrl.searchParams.get('date'));
    const mode = parseGameModeParam(parsedUrl.searchParams.get('mode'));
    const limit = parsePositiveInteger(parsedUrl.searchParams.get('limit') ?? undefined);
    if (!date) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_date' }));
      return true;
    }
    if (parsedUrl.searchParams.has('mode') && !mode) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_mode' }));
      return true;
    }

    const endedFrom = date;
    const endedTo = new Date(endedFrom.getTime() + 24 * 60 * 60 * 1000);
    const games = await persistence.listCompletedGames({
      endedFrom,
      endedTo,
      ...(limit ? { limit } : {}),
      ...(mode ? { mode } : {}),
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        games,
        range: {
          date: parsedUrl.searchParams.get('date'),
          endedFrom: endedFrom.toISOString(),
          endedTo: endedTo.toISOString(),
        },
      }),
    );
    return true;
  }

  if (pathname === '/api/eve-games/recent') {
    if (!requirePersistence(response)) return true;
    const games = await persistence.listRecentEveGames();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ games }));
    return true;
  }

  return false;
}

async function gameSummaryForApi(
  ctx: HttpApiContext,
  roomId: string,
): Promise<persistence.RecentEveGameRecord | null> {
  const persisted = persistence.isInitialized() ? await persistence.getGameSummary(roomId) : null;
  return persisted ?? ctx.inMemoryGameSummary(roomId);
}

async function gameEventsForApi(ctx: HttpApiContext, roomId: string): Promise<GameEvent[] | null> {
  const persisted = persistence.isInitialized() ? await persistence.loadRoom(roomId) : null;
  return persisted ?? ctx.rooms.get(roomId)?.events ?? null;
}

async function gameReviewForApi(
  ctx: HttpApiContext,
  roomId: string,
  request: IncomingMessage,
): Promise<Record<string, unknown> | null> {
  const game = await gameSummaryForApi(ctx, roomId);
  const events = await gameEventsForApi(ctx, roomId);
  const replayResponse = eventReplayResponse(events);
  if (!game || replayResponse.status !== 200) return null;

  const canViewEngineArtifacts = await canViewEngineArtifactsForRequest(request);
  const artifactSummaries = persistence.isInitialized()
    ? await persistence.listGameDebugArtifactSummaries(roomId)
    : [];
  const engineColors = engineParticipantColors(game);
  const hasEngineParticipant = engineColors.length > 0;
  const beliefArtifacts = artifactSummaries.filter(
    (artifact) => artifact.artifactType === 'belief-snapshot',
  );
  const traceArtifacts = artifactSummaries.filter(
    (artifact) =>
      artifact.artifactType === 'engine-move-choice' || artifact.artifactType === 'trace-row',
  );
  const beliefColors = intersectionColors(engineColors, artifactColors(beliefArtifacts));
  const traceColors = intersectionColors(engineColors, artifactColors(traceArtifacts));

  return {
    game,
    events: replayResponse.body.events,
    capabilities: {
      canViewEngineArtifacts,
      canAnnotate: false,
      canManageEngineArtifacts: canViewEngineArtifacts,
    },
    panels: {
      belief: {
        available:
          canViewEngineArtifacts &&
          hasEngineParticipant &&
          beliefArtifacts.length > 0 &&
          beliefColors.length > 0,
        defaultOpen: false,
        seats: beliefColors,
        snapshotKinds: uniqueStrings(beliefArtifacts.flatMap((artifact) => artifact.snapshotKinds)),
      },
      trace: {
        available:
          canViewEngineArtifacts &&
          hasEngineParticipant &&
          traceArtifacts.length > 0 &&
          traceColors.length > 0,
        defaultOpen: false,
        seats: traceColors,
      },
      annotations: {
        available: false,
        writable: false,
      },
    },
    artifacts: canViewEngineArtifacts ? artifactSummaries : [],
  };
}

async function gameArtifactsForApi(
  ctx: HttpApiContext,
  roomId: string,
  artifactType: ReviewArtifactType,
  color: Color | null,
  request: IncomingMessage,
): Promise<{ status: 200; body: Record<string, unknown> } | { status: 403 } | null> {
  if (!persistence.isInitialized()) return null;
  const game = await gameSummaryForApi(ctx, roomId);
  const events = await gameEventsForApi(ctx, roomId);
  const replayResponse = eventReplayResponse(events);
  if (!game || replayResponse.status !== 200) return null;
  if (!(await canViewEngineArtifactsForRequest(request))) return { status: 403 };

  const engineColors = engineParticipantColors(game);
  if (engineColors.length === 0) {
    return { status: 200, body: { artifacts: [] } };
  }
  const requestedColors = color ? [color] : engineColors;
  const allowedColors = intersectionColors(engineColors, requestedColors);
  if (allowedColors.length === 0) {
    return { status: 200, body: { artifacts: [] } };
  }

  const artifacts = await persistence.listGameDebugArtifactPayloads(roomId, {
    artifactType,
    engineColors: allowedColors,
  });
  return {
    status: 200,
    body: {
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        gameId: artifact.gameId,
        ply: artifact.ply,
        engineColor: artifact.engineColor,
        artifactType: artifact.artifactType,
        payload: artifact.payload,
        createdAt: artifact.createdAt.toISOString(),
      })),
    },
  };
}

async function canViewEngineArtifactsForRequest(request: IncomingMessage): Promise<boolean> {
  if (!isProductionLikeRuntime()) return true;
  const user = await currentAccountUser(request);
  return user?.accountRole === 'admin';
}

function engineParticipantColors(game: persistence.RecentEveGameRecord): Color[] {
  return game.participants
    .filter((participant) => participant.subjectType === 'engine-version')
    .map((participant) => participant.color);
}

function artifactColors(artifacts: persistence.GameDebugArtifactSummary[]): Color[] {
  return uniqueColors(artifacts.flatMap((artifact) => artifact.engineColors));
}

function intersectionColors(left: Color[], right: Color[]): Color[] {
  const rightSet = new Set(right);
  return uniqueColors(left.filter((color) => rightSet.has(color)));
}

function uniqueColors(values: Color[]): Color[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function parseReviewArtifactType(value: string | null): ReviewArtifactType | null {
  return value === 'belief-snapshot' || value === 'trace-row' || value === 'engine-move-choice'
    ? value
    : null;
}

function parseOptionalColor(value: string | null): Color | null {
  return value === 'white' || value === 'black' ? value : null;
}

function parseGameModeParam(value: string | null): persistence.GameMode | null {
  if (
    value === 'pvp' ||
    value === 'pve' ||
    value === 'eve' ||
    value === 'imported' ||
    value === 'manual'
  ) {
    return value;
  }
  return null;
}

function parseUtcDateParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().startsWith(value) ? date : null;
}

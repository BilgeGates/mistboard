import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RoomTimeControl, VariantId } from '@mistboard/game';
import serveHandler from 'serve-handler';
import type {
  CrossroadsChessCreatorPreference,
  CrossroadsChessRuntimeRoom,
} from './crossroads-chess-runtime.js';
import type {
  DarkMiniXiangqiCreatorPreference,
  DarkMiniXiangqiRuntimeRoom,
} from './dark-mini-xiangqi-runtime.js';
import type {
  DarkXiangqiCreatorPreference,
  DarkXiangqiRuntimeRoom,
} from './dark-xiangqi-runtime.js';
import { type HttpApiContext, handleApiRequest } from './http-api.js';
import { serveArticleOgImage, serveGameOgImage } from './og-image.js';
import * as persistence from './persistence.js';
import type { DrainController } from './server-drain.js';
import { isClientRoute } from './server-policy.js';
import {
  ARTICLE_META,
  serveArticlePage,
  serveArticlesIndexPage,
  serveGamePage,
  serveHomePage,
  serveRulesIndexPage,
  serveSitemap,
} from './server-static-pages.js';
import type { LobbyTicket, Room } from './server-types.js';

export type PersistenceHealthEntry = {
  at: number;
  roomId: string;
  eventType: string;
};

type ServerHttpHandlerOptions = {
  rooms: Map<string, Room>;
  lobbyTickets: Map<string, LobbyTicket>;
  lobbyQueue: LobbyTicket[];
  databaseRequired: boolean;
  persistenceErrors: PersistenceHealthEntry[];
  pveBuiltinEngineClientId: string;
  annotationsFile: string;
  liveClockInitialMs: number;
  liveClockIncrementMs: number;
  staticDir: string;
  publicHost: string;
  drainController: DrainController;
  createRoom(
    mode: 'pvp' | 'pve',
    variant: VariantId,
    engineId: string,
    hiddenDraft960?: boolean,
    timeControl?: RoomTimeControl,
    rated?: boolean,
    options?: {
      randomSeating?: boolean;
      engineColor?: 'white' | 'black';
      engineReservationId?: string;
      creatorPreference?: 'white' | 'black';
      region?: string;
    },
  ): Promise<Room>;
  createDarkXiangqiRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: DarkXiangqiCreatorPreference,
  ): Promise<
    | { ok: true; room: DarkXiangqiRuntimeRoom }
    | { ok: false; error: 'dark_xiangqi_disabled' | 'persistence_failure' | 'room_id_collision' }
  >;
  createDarkMiniXiangqiRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: DarkMiniXiangqiCreatorPreference,
  ): Promise<
    | { ok: true; room: DarkMiniXiangqiRuntimeRoom }
    | {
        ok: false;
        error: 'dark_mini_xiangqi_disabled' | 'persistence_failure' | 'room_id_collision';
      }
  >;
  createCrossroadsChessRoom(
    timeControl?: RoomTimeControl,
    creatorPreference?: CrossroadsChessCreatorPreference,
  ): Promise<
    | { ok: true; room: CrossroadsChessRuntimeRoom }
    | {
        ok: false;
        error: 'crossroads_chess_disabled' | 'persistence_failure' | 'room_id_collision';
      }
  >;
  reserveLiveEngineSeat(engineId: string, color: 'white' | 'black'): Promise<string | null>;
  releaseLiveEngineReservation(reservationId: string, reason: string): void;
  abandonRoom(
    roomId: string,
    seatToken: string,
  ): Promise<
    { ok: true } | { ok: false; error: 'not_found' | 'unauthorized' | 'already_terminal' }
  >;
  inMemoryGameSummary(roomId: string): persistence.RecentEveGameRecord | null;
};

export function createHttpRequestHandler(options: ServerHttpHandlerOptions) {
  return function handleHttpRequest(request: IncomingMessage, response: ServerResponse): void {
    const url = request.url ?? '/';
    const pathname = url.split('?', 1)[0] ?? '/';

    if (url === '/health') {
      void handleHealthRequest(options, response);
      return;
    }

    if (pathname === '/admin/drain' || pathname === '/admin/drain/cancel') {
      void options.drainController.handleRequest(request, response, pathname).catch((err) => {
        console.error(
          JSON.stringify({
            level: 'error',
            kind: 'drain_handler_failure',
            error: (err as Error).message,
            at: Date.now(),
          }),
        );
        if (!response.headersSent) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'internal_error' }));
        }
      });
      return;
    }

    if (url.startsWith('/api/')) {
      void handleApiRequest(buildApiContext(options), request, response).catch((err) => {
        console.error(
          JSON.stringify({
            level: 'error',
            kind: 'api_handler_failure',
            url,
            error: (err as Error).message,
            at: Date.now(),
          }),
        );
        if (!response.headersSent) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'internal_error' }));
        }
      });
      return;
    }

    const ogImageMatch = pathname.match(/^\/og\/game\/([^/]+)\.png$/);
    if (ogImageMatch && persistence.isInitialized()) {
      const roomId = decodeURIComponent(ogImageMatch[1]!);
      void serveGameOgImage(roomId, response).catch((err) => {
        console.warn('og image render failed', (err as Error).message);
        if (!response.headersSent) {
          response.writeHead(302, { location: '/og-image.png' });
          response.end();
        }
      });
      return;
    }

    const articleOgMatch = pathname.match(/^\/og\/article\/([^/]+)\.png$/);
    if (articleOgMatch) {
      const slug = decodeURIComponent(articleOgMatch[1]!);
      const meta = ARTICLE_META[slug];
      try {
        if (meta) {
          serveArticleOgImage(slug, meta.title, response);
        } else {
          response.writeHead(302, { location: '/og-image.png' });
          response.end();
        }
      } catch (err) {
        console.warn('article og render failed', (err as Error).message);
        if (!response.headersSent) {
          response.writeHead(302, { location: '/og-image.png' });
          response.end();
        }
      }
      return;
    }

    if (pathname === '/robots.txt') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(
        `User-agent: *\nAllow: /\nDisallow: /database\nDisallow: /engines\nSitemap: ${options.publicHost}/sitemap.xml\n`,
      );
      return;
    }

    if (pathname === '/sitemap.xml') {
      void serveSitemap({
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
      }).catch(() => {
        response.writeHead(500);
        response.end();
      });
      return;
    }

    const gameRouteMatch = pathname.match(/^\/game\/([^/]+)$/);
    if (gameRouteMatch && persistence.isInitialized()) {
      const roomId = decodeURIComponent(gameRouteMatch[1]!);
      void serveGamePage({
        roomId,
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
      }).catch(() => {
        request.url = '/';
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    const articleRouteMatch = pathname.match(/^(?:\/(zh-hans|zh-hant))?\/articles\/([^/]+)$/);
    if (articleRouteMatch) {
      const langPrefix = articleRouteMatch[1];
      const slug = decodeURIComponent(articleRouteMatch[2]!);
      void serveArticlePage({
        slug,
        base: 'articles',
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
        langPrefix,
      }).catch(() => {
        request.url = '/';
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    // Rules docs are canonical under /rules/<slug>; same renderer as articles,
    // with serveArticlePage 301ing any base/slug mismatch to the canonical path.
    const rulesArticleRouteMatch = pathname.match(/^(?:\/(zh-hans|zh-hant))?\/rules\/([^/]+)$/);
    if (rulesArticleRouteMatch) {
      const langPrefix = rulesArticleRouteMatch[1];
      const slug = decodeURIComponent(rulesArticleRouteMatch[2]!);
      void serveArticlePage({
        slug,
        base: 'rules',
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
        langPrefix,
      }).catch(() => {
        request.url = '/';
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    const articlesIndexMatch = pathname.match(/^(?:\/(zh-hans|zh-hant))?\/articles\/?$/);
    if (articlesIndexMatch) {
      void serveArticlesIndexPage({
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
        langPrefix: articlesIndexMatch[1],
      }).catch(() => {
        request.url = '/';
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    const rulesIndexMatch = pathname.match(/^(?:\/(zh-hans|zh-hant))?\/rules\/?$/);
    if (rulesIndexMatch) {
      void serveRulesIndexPage({
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
        langPrefix: rulesIndexMatch[1],
      }).catch(() => {
        request.url = '/';
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    if (pathname === '/') {
      void serveHomePage({ response, staticDir: options.staticDir }).catch(() => {
        // No prerendered home.html (e.g. an older build): fall back to the shell.
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    if (isClientRoute(pathname)) {
      request.url = '/';
    }

    void serveHandler(request, response, { public: options.staticDir });
  };
}

async function handleHealthRequest(
  options: Pick<ServerHttpHandlerOptions, 'databaseRequired' | 'persistenceErrors'>,
  response: ServerResponse,
): Promise<void> {
  const cutoff1m = Date.now() - 60_000;
  const recent = options.persistenceErrors.filter((entry) => entry.at > cutoff1m);
  const lastAt =
    options.persistenceErrors.length > 0
      ? options.persistenceErrors[options.persistenceErrors.length - 1]!.at
      : null;
  const dbReachable = options.databaseRequired ? await persistence.probeDb() : true;
  const ok = recent.length === 0 && dbReachable;
  response.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      ok,
      databaseRequired: options.databaseRequired,
      persistence: persistence.isInitialized() ? 'enabled' : 'disabled',
      persistenceErrors: { count1m: recent.length, lastAt },
    }),
  );
}

function buildApiContext(options: ServerHttpHandlerOptions): HttpApiContext {
  return {
    rooms: options.rooms,
    lobbyTickets: options.lobbyTickets,
    lobbyQueue: options.lobbyQueue,
    databaseRequired: options.databaseRequired,
    pveBuiltinEngineClientId: options.pveBuiltinEngineClientId,
    annotationsFile: options.annotationsFile,
    liveClockInitialMs: options.liveClockInitialMs,
    liveClockIncrementMs: options.liveClockIncrementMs,
    createRoom: options.createRoom,
    createDarkXiangqiRoom: options.createDarkXiangqiRoom,
    createDarkMiniXiangqiRoom: options.createDarkMiniXiangqiRoom,
    createCrossroadsChessRoom: options.createCrossroadsChessRoom,
    reserveLiveEngineSeat: options.reserveLiveEngineSeat,
    releaseLiveEngineReservation: options.releaseLiveEngineReservation,
    abandonRoom: options.abandonRoom,
    inMemoryGameSummary: options.inMemoryGameSummary,
    isDraining: options.drainController.isDraining,
    drainDeadlineMs: options.drainController.drainDeadlineMs,
    activeGameCount: options.drainController.activeGameCount,
  };
}

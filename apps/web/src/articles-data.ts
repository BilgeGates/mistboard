// Thin barrel for the articles content modules. The articles array, schema
// types, and snapshot artifacts were split out of this file into
// ./articles/{types,diagrams,content/*}; this barrel preserves the exact public
// export surface so no other file needs to change.

export * from './articles/types.js';
export { withXiangqiPieceSet } from './articles/diagrams.js';

import type { Article } from './articles/types.js';
import { SERVER_FOG_SNAPSHOT_JSON_TEXT } from './articles/diagrams.js';
import { banqiArticle } from './articles/content/banqi.js';
import { chessArticle } from './articles/content/chess.js';
import { crossroadsChessArticle } from './articles/content/crossroads-chess.js';
import { darkChessArticle } from './articles/content/dark-chess.js';
import { darkChessConceptsArticle } from './articles/content/dark-chess-concepts.js';
import { darkDraft960Article } from './articles/content/dark-draft960.js';
import { darkMiniXiangqiArticle } from './articles/content/dark-mini-xiangqi.js';
import { darkXiangqiArticle } from './articles/content/dark-xiangqi.js';
import { jieqiArticle } from './articles/content/jieqi.js';
import { kriegspielArticle } from './articles/content/kriegspiel.js';
import { miniXiangqiArticle } from './articles/content/mini-xiangqi.js';
import { mistyArticle } from './articles/content/misty.js';
import { serverEnforcedFogArticle } from './articles/content/server-enforced-fog.js';
import { shogi4Article } from './articles/content/shogi4.js';
import { xiangqiArticle } from './articles/content/xiangqi.js';
import articleSnapshotFog from './article-snapshot-fog.json' with { type: 'json' };

export const articles: Article[] = [
  mistyArticle,
  chessArticle,
  darkChessArticle,
  darkChessConceptsArticle,
  darkDraft960Article,
  xiangqiArticle,
  darkXiangqiArticle,
  miniXiangqiArticle,
  darkMiniXiangqiArticle,
  crossroadsChessArticle,
  serverEnforcedFogArticle,
  shogi4Article,
  kriegspielArticle,
  jieqiArticle,
  banqiArticle,
];

export function findArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

// Real WebSocket snapshot frame captured from a live PvP dark-chess room
// via apps/server/scripts/capture-snapshot.mjs and anonymized. Embedded as
// a verbatim artifact for the server-enforced-fog article. Re-run the
// capture script after wire-format changes.
export const SERVER_FOG_SNAPSHOT_ARTIFACT = articleSnapshotFog as unknown as Record<string, unknown>;
export const SERVER_FOG_SNAPSHOT_JSON = SERVER_FOG_SNAPSHOT_JSON_TEXT;

# Mistboard — Codebase Index

Fast orientation for agents. One line per file. Read this before opening any source file.
Edit task → find file → open only that file.

## packages/game/src/ — Pure game logic (no server/browser deps)

| File | Owns |
|------|------|
| `types.ts` | Shared types: `Color`, `Square`, `Board`, `Move`, `GameState`, `PlayerView`, `Variant` |
| `variants.ts` | All three variants (`draft960Variant`, `fogOfWarVariant`, `bidForWhiteVariant`); fog kernel: `fogVisibleSquares`, `fogMovesFrom`, `fogPawnMoves`, `fogSlideMoves`, `fogCastlingMoves`, `applyFogMove` |
| `events.ts` | `GameEvent` union type, `replayGameEvents` reducer, `GameProjection` |
| `notation.ts` | `algebraicMoveLabels` — algebraic/coordinate notation for move lists and replay |
| `clocks.ts` | `createClock`, `advanceClock`, `clockRemainingMs`, `expireClock` |
| `chess960.ts` | Chess960 start generation, `pickDraft960Offer` |
| `index.ts` | Barrel re-export — everything the game package exposes publicly |

**Change fog visibility or move rules** → `variants.ts`
**Change clock math** → `clocks.ts`
**Change event replay** → `events.ts`
**Change move notation** → `notation.ts`

## apps/server/src/ — WebSocket server + HTTP API

| File | Owns |
|------|------|
| `index.ts` (~1,660 lines) | WebSocket rooms, seat tokens, clocks, engine scheduling, server init. See section markers inside. |
| `http-api.ts` | HTTP routing: `handleApiRequest`, lobby, game data helpers, room creation. Exported: `parseVariantId`, `parseHiddenDraft960`, `parseRoomTimeControl`, `HttpApiContext` |
| `account-session.ts` | Account auth: `currentAccountUser`, `ensureUserForEmail`, `hashSecret`, session cookies, email login |
| `server-types.ts` | Shared server types: `Client`, `Room`, `SeatTokenState`, `SeatAssignment`, `LobbyTicket` |
| `persistence.ts` | All Postgres SQL: `loadRoom`, `appendEvent`, `recordGameStart`, `recordGameEnd`, `upsertRoomSeatToken`, `UserAccount`, `AccountSession`, `RoomSeatTokenRecord` |
| `payloads.ts` | `snapshotPayload` — builds WebSocket snapshot message; applies fog redaction and seat-scoped view logic |
| `server-policy.ts` | Access control: `canObserveLiveRoom`, `eventReplayResponse`, `visibleEventsForLiveSnapshot`, `modeForProjection`, `isAdminDebugToken`, `isAllowedWebSocketOrigin` |
| `account-identity.ts` | Email normalization, handle generation, display name handling |
| `engine-registry.ts` | Maps engine client IDs to implementations: `loadEngine`, `playableLiveEngines`, `engineVersionDisplayName` |
| `live-engine.ts` | `chooseLiveEngineMove` — interfaces room state with an engine implementation |
| `engine-runner.ts` | Worker/queue-side engine execution for async EvE games |
| `engine-experiments.ts` | Engine tournament experiment definitions and scheduling |
| `engine-tournament.ts` | Tournament bracket logic |
| `migrate.ts` | Schema migrations — run once on startup |
| `worker.ts` | Background worker entry point for async engine game execution |

**Change move validation or game flow** → `index.ts` §Game flow (~line 740)
**Change WebSocket message handling** → `index.ts` §WebSocket connection handling (~line 250)
**Change HTTP API routing** → `http-api.ts`
**Change account/session/email auth** → `account-session.ts`
**Change seat token auth** → `index.ts` §Seat management (~line 600)
**Change persistence queries** → `persistence.ts`
**Change clock logic** → `clocks.ts` (game pkg) + `index.ts` §Room event infrastructure (~line 1115)
**Change snapshot/fog payload** → `payloads.ts`
**Change access control** → `server-policy.ts`

## apps/web/src/ — Browser client (vanilla TypeScript, no framework)

| File | Owns |
|------|------|
| `main.ts` (150 lines) | Entry point — URL routing to page modules via dynamic import |
| `live.ts` (2,101 lines) | Entire live game client: WebSocket connect/reconnect, message handling, board rendering, clocks, sound, draft/bid UI, seat tracking, move submission |
| `replay.ts` (1,808 lines) | Replay viewer: board replay, move list, perspective switching, engine artifact panels, annotation tools |
| `landing.ts` (2,147 lines) | Landing, watch page, account, game review, profile |
| `learn.ts` (2,864 lines) | Learn/tutorial page with interactive board positions |
| `board-ui.ts` (87 lines) | `BoardUI` class — thin chessground wrapper for board initialization |
| `annotations.ts` (127 lines) | Annotation read/write for the research feedback workflow |
| `belief-panel.ts` (1,127 lines) | Engine belief/probability display panels for the replay lab |
| `theme.ts` (323 lines) | Theme settings (sound volume, board theme) — localStorage backed |
| `bakeoff.ts` (260 lines) | Engine lab bakeoff view |

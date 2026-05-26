# Mistboard — Codebase Index

Fast orientation for agents. One line per file. Read this before opening any source file.
Run `npm run agent:scan` after the required git checks for live dirty-state,
worktree, large-file, and targeted-test guidance.
Edit task → find file → open only that file.

> **Sprint 2 god-file work complete (2026-05-22 → 2026-05-23):** all major splits shipped — web side: `live-sound.ts`, `time-controls.ts`, `review.ts`, `contact.ts`, `account.ts`, `profile.ts`, `pages-static.ts`, `live-replay.ts`. Server side: `http-api.ts` decomposed into `routes/{lib,annotations,auth,account,engines,feedback,meta,rooms,lobby,games,users,leaderboard}.ts` (Tier-4 in audit). Biome format + lint:fix passes also landed.

## packages/game/src/ — Pure game logic (no server/browser deps)

| File | Owns |
|------|------|
| `types.ts` | Shared types: `Color`, `Square`, `Board`, `Move`, `GameState`, `PlayerView`, `Variant` |
| `variants.ts` | Variants (`draft960Variant`, `darkChessVariant`); fog kernel: `fogVisibleSquares`, `fogMovesFrom`, `fogPawnMoves`, `fogSlideMoves`, `fogCastlingMoves`, `applyFogMove` |
| `variants-xiangqi.ts` | FoW Xiangqi variant (DEV `/xiangqi-spike` only); cannon vision = field of fire |
| `events.ts` | `GameEvent` union type, `replayGameEvents` reducer, `GameProjection` |
| `notation.ts` | `algebraicMoveLabels` — algebraic/coordinate notation for move lists and replay |
| `clocks.ts` | `createClock`, `advanceClock`, `clockRemainingMs`, `expireClock` |
| `chess960.ts` | Chess960 start generation, `pickDraft960Offer` |
| `time-controls.ts` | `TIME_CONTROLS` list + `timeClassFromTimeControl()` + `findTimeControl()` + `isOfficialTimeControl()` — single source for time-control defs. All callers (rating-buckets, landing picker, http-api PvE allowlist, persistence SQL, loadtest scenarios, analytics) derive from this list |
| `index.ts` | Barrel re-export — everything the game package exposes publicly |

**Change fog visibility or move rules** → `variants.ts`
**Change clock math** → `clocks.ts`
**Change event replay** → `events.ts`
**Change move notation** → `notation.ts`
**Add/rename a time control** → `time-controls.ts`

## packages/board-render/src/ — Shared SVG board renderer

| File | Owns |
|------|------|
| `board-svg.ts` | Server- and build-safe SVG board renderer (for OG images + article triptychs) |
| `composition.ts` | Triptych + grid compositions |
| `layouts.ts` | Layout primitives for composed renders |
| `pieces.ts` | Piece SVG sprite refs |
| `positions.ts` | FEN → board position parsing |
| `tokens.ts` | Color/size tokens |
| `interactive/board.ts` | Browser-side interactive board |
| `interactive/live-boards.ts` | Pool of interactive boards keyed by id |
| `interactive/stepper.ts` | Triptych stepper UI (article triptychs) |
| `interactive/thumbnail.ts` | Thumbnail renderer |
| `index.ts` | Barrel re-export |

## apps/server/src/ — WebSocket server + HTTP API

| File | Owns |
|------|------|
| `main.ts` | Prod entry point. Calls `installShutdownHandlers()` then `startServer({port})`. Tiny — all logic lives in `index.ts`. |
| `index.ts` | Server library: exports `startServer`, `installShutdownHandlers`, `stopServer`. Module-load side-effect-free so the integration harness can boot a test instance on a random port. Has `// ── SECTION:` markers; SSR/page-meta and drain orchestration are candidates for extraction. |
| `rematch.ts` | Mutual-confirm rematch state machine + finalize. `offerRematch`, `cancelRematch`, `declineRematch`, `finalizeRematchIfReady`, `maybeReplayRematchRedirect`. |
| `room-manager.ts` | Core game loop: `playMove`, `appendEvent`, `broadcastSnapshot`, `scheduleClockTimeout`, `expireActiveClock`, `scheduleRandomEngineMove`, `playRandomEngineMoveIfReady`, seat token persistence, bid/draft resolution. Context: `RoomManagerContext`. |
| `http-api.ts` | Thin HTTP dispatcher (79 LOC). Walks `routes/*` modules in declared order; each `tryHandle()` returns true to claim the request or false to fall through. Re-exports `HttpApiContext`, `parseVariantId`, `parseHiddenDraft960`, `parseRoomTimeControl`, `isPveAllowedTimeControl`, `readJsonBody`, `writeJson`, `requireMethod`, `requirePersistence` from `routes/lib.ts` so external consumers (`index.ts`, loadtest) don't need to know things moved |
| `routes/lib.ts` | Shared HTTP utilities: `HttpApiContext` interface, `writeJson`, `requireMethod`, `requirePersistence`, `readJsonBody`, the parse helpers, `hashIp`, `isHttpAdminAuthorized`. Imported by every route module |
| `routes/auth.ts` | `/api/auth/{me,logout,email/start,email/confirm}` |
| `routes/account.ts` | `/api/account/profile` (PATCH) |
| `routes/users.ts` | `/api/users/:handle/profile` |
| `routes/rooms.ts` | POST `/api/rooms`, `/api/rooms/:id/abandon`, plus `parseRoomMode` / `parsePlayablePveEngineId` |
| `routes/lobby.ts` | `/api/lobby`, `/api/lobby/:ticketId`, plus `joinLobby` / `cancelLobbyTicket` / `pruneLobbyTickets` / `lobbyTicketResponse` / `lobbyOpenRequests` |
| `routes/games.ts` | All `/api/games/*` + `/api/eve-games/recent` (8 routes) + game-data helpers (`gameSummaryForApi`, `gameEventsForApi`, `gameReviewForApi`, `gameArtifactsForApi`, engine-color helpers) |
| `routes/leaderboard.ts` | `/api/leaderboard` |
| `routes/feedback.ts` | `/api/feedback` + honeypot + anon rate-limit + email-and-persist fan-out |
| `routes/annotations.ts` | `/api/annotations` (admin GET/POST/PUT, JSON-lines file backed) |
| `routes/meta.ts` | `/api/server-status`, `/api/live-stats` |
| `routes/engines.ts` | `/api/engines/playable` |
| `account-session.ts` | Account auth: `currentAccountUser`, `ensureUserForEmail`, `hashSecret`, session cookies, email login |
| `account-identity.ts` | Email normalization, handle generation, display name handling |
| `server-types.ts` | Shared server types: `Client`, `Room`, `SeatTokenState`, `SeatAssignment`, `LobbyTicket` |
| `server-policy.ts` | Access control: `canObserveLiveRoom`, `eventReplayResponse`, `visibleEventsForLiveSnapshot`, `modeForProjection`, `isAdminDebugToken`, `isAllowedWebSocketOrigin`, `isClientRoute`, `PARKED_CLIENT_ROUTES` |
| `persistence-db.ts` | Postgres pool lifecycle: `init`, `probeDb`, `close`, `isInitialized`, `getPool` |
| `persistence-seat-tokens.ts` | Room seat token persistence, including token load/upsert/touch/replace/verify helpers |
| `persistence.ts` | Public persistence facade. Import existing persistence APIs from here unless changing query ownership. |
| `persistence-game-lifecycle.ts` | Room event loading/append, running-game lifecycle, stale-room cleanup, debug artifact persistence |
| `persistence-games.ts` | Completed-game persistence, game summaries/lists, watch/unlock queries, participant attribution, game-end persistence |
| `persistence-accounts.ts` | Account/profile/session/email-login queries and leaderboard/account-role helpers |
| `persistence-feedback.ts` | Feedback persistence |
| `persistence-site-stats.ts` | Site statistics query |
| `payloads.ts` | `snapshotPayload` — builds WebSocket snapshot message; applies fog redaction and seat-scoped view logic |
| `test-builders.ts` | Shared server test builders for `GameProjection`, `PlayerView`, `SnapshotRoom`, `Room`, clients, and seat tokens |
| `rating-buckets.ts` | Variant × time-class → bucket-id mapping for per-bucket Elo |
| `elo.ts` | Elo update math |
| `migrate.ts` | Schema migrations — run once on startup |
| `python-pool.ts` | Persistent Python worker pool for live engines (size=4 in prod) |
| `engine-registry.ts` | Maps engine client IDs to implementations: `loadEngine`, `playableLiveEngines`, `engineVersionDisplayName` |
| `live-engine.ts` | `chooseLiveEngineMove` — interfaces room state with an engine implementation |
| `engine-time-policy.ts` | Engine think-time budgets per time control / tier |
| `engine-runner.ts` | Worker/queue-side engine execution for async EvE games |
| `engine-experiments.ts` | Engine tournament experiment definitions and scheduling |
| `engine-tournament.ts` | Tournament bracket logic |
| `engine-elo-report.ts` | Engine Elo report rendering |
| `engine-tournament-report.ts` | Engine tournament report rendering |
| `engine-queue-status.ts` | CLI: engine queue status |
| `engine-tournament-status.ts` | CLI: engine tournament status |
| `enqueue-engine-games.ts` | CLI: enqueue engine games |
| `enqueue-engine-smoke.ts` | CLI: enqueue engine smoke |
| `enqueue-engine-tournament.ts` | CLI: enqueue engine tournament |
| `import-corpus.ts` | CLI: import FoW game corpus |
| `worker.ts` | Background worker entry point for async engine game execution |
| `feedback-notify.ts` | Email notification on feedback submission |
| `game-export.ts` | PGN/JSON export for `/api/games/:id/export.*` (Phase D, 2026-05-22) |
| `og-image.ts` | OG image rendering (default + per-game) |
| `obs.ts` | Structured-JSON logging helpers |

## apps/server/integration/ — Two-client WebSocket integration tests

| File | Owns |
|------|------|
| `harness.ts` | `startTestServer({seatVacateGraceMs})`, `connectClient({url, room, seatToken})`, `TestClient` with `waitFor` / `expectMessage`, `waitUntil`, `sleep`, `uniqueRoomId` |
| `core-loop.test.ts` | 9 scenarios: resign+winner, rematch round-trip, redirect replay on reconnect, pregame grace (in/out), presence, seat-token reseat, one-sided offer, move broadcast |
| `drain.test.ts` | Drain endpoint + WS-broadcast tests |
| `loadtest-smoke.test.ts` | Builtin-engine load smoke |
| `persist-resign.test.ts` | Postgres-on resign-termination integration test |

Run with `MISTBOARD_ALLOW_IN_MEMORY_PERSISTENCE=true npm run test:integration --workspace @mistboard/server`. Persistence is intentionally disabled for the in-memory contract; `persist-resign` requires `TEST_DATABASE_URL`.

**Change move validation or game flow** → `room-manager.ts`
**Change WebSocket message handling** → `index.ts` §WebSocket connection handling
**Change HTTP API routing** → relevant `routes/*.ts` module (dispatcher in `http-api.ts` rarely needs touching unless adding a new route module)
**Add a new HTTP route** → either add to an existing `routes/*.ts` module or create a new one with `tryHandle()` + register it in `http-api.ts`'s `routes` array (order matters for overlapping patterns)
**Change account/session/email auth** → `account-session.ts`
**Change seat token auth** → `index.ts` §Seat management
**Change persistence pool lifecycle** → `persistence-db.ts`
**Change room seat token persistence** → `persistence-seat-tokens.ts`
**Change persistence queries** → focused `persistence-*.ts` module first, otherwise `persistence.ts`
**Change clock logic** → `clocks.ts` (game pkg) + `room-manager.ts` (`scheduleClockTimeout`, `expireActiveClock`)
**Change snapshot/fog payload** → `payloads.ts`
**Change access control** → `server-policy.ts`
**Add/rename a top-level client route** → `apps/web/src/main.ts` + `server-policy.ts` (`isClientRoute` parity test will fail otherwise)

## apps/web/src/ — Browser client (vanilla TypeScript, no framework)

| File | Owns |
|------|------|
| `main.ts` | Entry point — URL routing to page modules via dynamic import; mounts theme + nav + restart banner + analytics |
| `live.ts` | Live-game page bootstrap — wires `live-state`, `live-socket`, `live-render`, and `live-view` for `/room/:id` |
| `live-state.ts` | Live-game module state (`liveState`, seat-token storage, WS base URL resolver) |
| `live-socket.ts` | WebSocket connect / reconnect / send for live games |
| `live-render.ts` | Live-game render orchestration: board, room actions, draft picker. Reads board helpers from `live-board.ts`, capture rows from `live-captures.ts`, clock rendering from `live-clocks.ts`, game controls from `live-game-controls.ts`, replay/move-list rendering from `live-move-list.ts`, replay state via accessors from `live-replay.ts`, and derived views from `live-view.ts`. Layout shell is in `live-layout.ts`; sound subsystem is in `live-sound.ts`. |
| `live-board.ts` | Live-game board adapter helpers: fog highlight classes, result classes, legal destination maps, castling aliases, and square file helpers |
| `live-captures.ts` | Live-game capture strip rows and chessground-styled captured-piece DOM helpers |
| `live-clocks.ts` | Live-game clock UI: pregame time-control display, player clock rows, active-clock flash state, and 100ms timer refresh |
| `live-game-controls.ts` | Live-game abort/resign controls, disconnect countdown labels, and confirmation dialog UI |
| `live-layout.ts` | Live-game static DOM shell and `LiveRefs` query wiring for `/room/:id` |
| `live-move-list.ts` | Live-game replay controls and move-list rendering: masked/revealed move rows, active ply tracking, and auto-scroll state |
| `live-status.ts` | Live-game status copy and tone decisions: action banners, board status, room mode label, and seat label |
| `live-view.ts` | Derived live-game views: current replay projection, fog-history view selection, capture tally, and dev-view reconstruction |
| `live-sound.ts` | SoundController + `maybePlaySnapshotSound` + per-move sound policy. Owns the audio context, volume tracking, win/lose/capture/castle tone generation. Wired by live-render's render flow + live.ts's snapshot handler |
| `live-replay.ts` | Replay-of-live navigation. Owns `replayIndex` + `fogViewHistory` + 4 fog tracking vars. Exports state accessors (`getReplayIndex`, `getFogViewHistory`, `isLive`, `currentReplayIndex`, `fogLivePos`, `snapshotToPly`), DOM labels (`replayMetaLabel`, `replayControlDisabled`), and the navigation entry points (`handleReplayButtonClick`, `handleReplayKeyboard`, `handleMoveListClick`, `captureFogView`, `resetReplayState`). `initReplay({onStateChange})` injects the render-trigger callback so the dep is one-way (live-render → live-replay) |
| `landing.ts` | Mounts for landing / watch / game / contact. Lobby + create-room flows, recent-games render, landing widgets, setup dialog. Shell and game-display helpers have moved out, so route modules no longer import from landing. |
| `site-shell.ts` | Shared site chrome: `buildNav`, `buildFooter`, `buildLoadingState`, `buildNotice`, `fetchCurrentUser`, and `GITHUB_URL` |
| `game-display.ts` | Shared game display contracts and formatters: `FeaturedGame`, `GameParticipant`, `displayParticipantName`, participant lookup, source labels, and known engine display names |
| `public-assets.ts` | Public build asset filter used by `vite.config.ts` to keep local bakeoff and pixel-lab artifacts out of ordinary web builds |
| `account.ts` | `/account` + `/account/settings` mounts. Sign-in/registration form (email + magic code), signed-in account card, settings form (display name / handle / email), auth-tabs. Uses `site-shell.ts` for shared chrome/auth fetch |
| `profile.ts` | `/@/:handle` + `/leaderboard` mounts. `mountProfile`, `mountLeaderboard`, profile header/ratings/games builders, leaderboard panel + table. Uses `site-shell.ts` and `game-display.ts` for shared contracts |
| `pages-static.ts` | `/about` + `/source` + `/faq` + `/terms` + `/articles` (index + slug) + 404 mounts. Builders for about/source/faq/terms/notfound + shared text primitives (`aboutSubheading`/`aboutParagraph`/`aboutLink`/`aboutExternalLink`, `sourceBlock`/`textLine`/`linkLine`). Uses `site-shell.ts` for shared chrome |
| `contact.ts` | `buildContact` — `/contact` form builder (anon vs signed-in lanes, honeypot, submit/error states). Mounted by `landing.ts` (mountContact is 15 lines, uses buildNav/Footer) |
| `review.ts` | Game-review data plumbing for `/game/:id`: `loadGameForReview`, `fetchGameReview`, `fetchGameArtifacts`, `fetchTraceArtifacts`, belief/trace row converters, `enginePanelsForReview`. Owns the engine-artifact panel hydration |
| `replay.ts` | Replay viewer: `mountReplay` (~880-line closure — extraction candidate for a future session), board adapter, panels, annotation form |
| `belief-panel.ts` | Engine belief/probability display panels for the replay lab |
| `learn.ts` | `/learn` tutorial (Steps 1-3 shipped, 4-5 parked) |
| `articles.ts` | Articles page renderer |
| `articles-data.ts` | Article content (large; content not code) |
| `account-nav.ts` | Top-nav account menu + sign-in state |
| `restart-banner.ts` | Boot-fetch + WS-driven drain banner |
| `theme.ts` | Settings panel (board / fog / piece-set picker + volume slider, localStorage-backed) |
| `bakeoff.ts` | Engine lab bakeoff view (DEV) |
| `pixel-lab.ts` | `/pixel-lab` AI piece-art/fog lab (DEV) |
| `xiangqi-spike.ts` | `/xiangqi-spike` FoW Xiangqi sandbox (DEV) |
| `xiangqi-bot.ts` | DEV-only bot for the xiangqi spike |
| `xiangqi-pieces.ts` | Xiangqi piece SVG refs |
| `web-utils.ts` | `escapeHtml`, `isColor`, `formatClock`, `oppositeColor`, file/rank helpers |
| `captures.ts` | Captured-piece list derivation |
| `nav-items.ts` | Nav item definitions (shared between top-nav and footer) |
| `announcements.ts` | Card list for /announcements + landing widget |
| `annotations.ts` | Annotation read/write for the research feedback workflow |
| `analytics.ts` | PostHog wrapper + time-class inference (client-side) |
| `video.ts` | `/video` page (parked; removal in flight this session) |

## apps/server/migrations/ — Postgres schema migrations

21 files (`001_init.sql` through `021_feedback_ip_hash.sql`). Runner: `migrate.ts` — Postgres advisory-lock + `_migrations` table. File-level idempotent, but data-backfill migrations 004/006/008/011 lacked `ON CONFLICT` guards until this session.

**Change schema** → add a new `0NN_*.sql` (never modify a landed migration). Constraint rewrites: drop-then-readd in a new file (see `018_add_resignation_termination.sql`).

## scripts/ — repo-root tooling

| Group | Files |
|-------|-------|
| Build/start | `build.mjs`, `start.mjs`, `safe-deploy.mjs` |
| Agent/dev loop | `agent-scan.mjs`, `ci-checks.mjs`, `drift-check.mjs`, `gate-evidence.mjs`, `verify.mjs`, `worktree-new.mjs`, `worktree-prepare.mjs`, `mobile-loop.mjs`, `visual-check.mjs` |
| Engine artifacts | `archive-engine-artifact.mjs`, `engine-artifact-{audit,closeout}.mjs`, `capture-belief-artifacts.mjs`, `generate-fow-corpus.mjs` |
| Prod smoke | `wait-prod-revision.mjs`, `prod-smoke.mjs`, `prod-engine-smoke.mjs` |
| AI asset gen | `pixel-gen.mjs`, `video-gen.mjs`, `loop-video.mjs`, `slice-fog.py` |
| Other | `key-transparency.py` |

## Conventions

- **TypeScript everywhere.** No `.mjs` in source; ops scripts in `scripts/` can be `.mjs`.
- **Pure-game in `packages/game`.** No browser or server imports allowed.
- **Server owns canonical state.** Clients render `PlayerView`, never canonical truth.
- **Fog redaction in `payloads.ts`.** Never send hidden pieces or opponent moves to the wrong client.
- **One source for time controls** → `packages/game/src/time-controls.ts`.
- **`.env` files are off-limits** to Claude — touching them leaks via auto-include. Use Node `--env-file` or provider dashboards.
- **Lesson trailers** on commits that teach a transferable rule (see `~/projects/CLAUDE.md`).

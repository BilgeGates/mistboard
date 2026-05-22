# Server Restart: Pause & Resume

How Mistboard preserves in-flight games across server deploys and crashes.

## Goals

- **No force-terminated games on a planned redeploy.** If a deploy happens mid-game, the game pauses, the server restarts, and the game resumes when both players are reconnected.
- **No clock advantage from a restart.** Clocks freeze at pause and resume at the same values. Symmetric for both players.
- **No infinite paused-room limbo.** A paused room where nobody comes back is finalized after a bounded window.
- **Robust to crashes, not just clean shutdowns.** The system degrades from "clean pause+resume" to "best-effort recovery" without losing game data.

## Non-goals (for now)

- Multi-replica / horizontally scaled coordination. Single-server today; revisit when scale demands it.
- Live-migration of an active game between two simultaneously-running servers. The old server exits; the new server starts.

## Core insight

Game state in Mistboard is already an **event log persisted to Postgres**, replayed on startup. See `apps/server/src/persistence.ts` (`appendEvent`, `loadRoom`) and `packages/game/src/events.ts` (`replayGameEvents`, `applyGameEvent`).

Pause and resume are just two new event kinds appended to the same log. Replay of the events deterministically reconstructs the paused-or-resumed state. No parallel snapshot table, no separate persistence path — the same invariant that protects move history protects pause/resume.

```
[room-created, seat-assigned×2, draft-start-*, move-played×N,
 pause(at=T, clocks=…, reason='shutdown'),
 resume(at=T'),
 move-played×M, …]
```

A room whose final event is `pause` (no following `resume`) is **paused**. Anything else is the same as today.

## Event kinds

Two new variants on `GameEvent` (`packages/game/src/events.ts`):

```ts
| {
    type: 'pause';
    at: number;                   // wall-clock pause timestamp (ms)
    roomId: string;
    clock?: ClockState;           // frozen clock snapshot at pause moment
    reason: 'shutdown' | 'admin'; // why pause was triggered
  }
| {
    type: 'resume';
    at: number;                   // wall-clock resume timestamp (ms)
    roomId: string;
    clock?: ClockState;           // re-armed clock for status.turn
    reason: 'both-present' | 'grace-elapsed' | 'admin';
  }
```

**Replay semantics**

- `pause` while `status.type === 'playing'`: freeze `clock` (set `activeColor = null`, `runningSince = null`, compute the elapsed-since-`runningSince` and bake into `remainingMs[active]`). Set projection-level `paused = true`. Status stays `'playing'` with the same `turn`.
- `pause` in any other status (pregame, finished): no-op. (Don't pause a finished game; don't pause a pregame — pregame has no clocks ticking anyway.)
- `resume` while `paused === true`: re-arm the clock by setting `activeColor = status.turn`, `runningSince = event.at`. Clear `paused`.
- `resume` while `paused === false`: no-op (defensive).

These keep replay deterministic: the same event sequence always produces the same projection.

## Drain & deploy sequence

```
T-15:00  POST /admin/drain
         → server flips drain flag (in-memory + mirrored to Postgres for crash-recovery)
         → matchmaking, rematch, draft960 lobby creation, engine matches all blocked
         → broadcast { kind: 'server_restart_scheduled', restart_at, expected_back_at }
         → reconnects to existing rooms still work
         → active games continue normally

T-00:30  Final-pause sweep
         → for each room with non-terminal status:
             appendEvent(roomId, 'pause', { clock: freezeAt(now), reason: 'shutdown' })
             broadcast { kind: 'game_paused', expected_back_at }
         → drain flag persists (the post-restart server reads it on startup)

T-00:00  railway up
         → SIGTERM hits a server with all clocks frozen and pauses persisted
         → existing shutdown() (apps/server/src/index.ts:1347) closes sockets, waits for
           pending DB writes, exits in seconds — well under Railway's 30s grace
         → no in-progress write races; clock timers were already cleared at pause-sweep

T+~5:00  New container live
         → on boot: scan for rooms whose last event is 'pause' with no following 'resume'
         → hydrate them into memory as paused rooms; do not auto-resume
         → broadcast availability via WS as clients reconnect

T+~5:30  Per-room resume
         → as soon as both seated players have a live socket: append 'resume'
         → if only one player connects, start a 90s grace timer
         → after 90s: append 'resume' regardless. The standard abandon timer
           takes over for any still-absent player.

T+24h   Stale sweep
         → any room still paused with no client reconnect and pause_ts < now-24h:
           finalize as draw, termination 'server-restarted'.
```

## Clock semantics

The model:

| Phase | `clock.activeColor` | `clock.runningSince` | `remainingMs[active]` | `paused` |
|---|---|---|---|---|
| Playing, white's turn | `'white'` | timestamp X | initial − (now − X) at read time | `false` |
| **Pause appended at T** | `null` | `null` | frozen at the value at T | `true` |
| Server restarted, rehydrated | `null` | `null` | unchanged (same as pause) | `true` |
| **Resume appended at T'** | `status.turn` | `T'` | unchanged from pause snapshot | `false` |

The invariant: **wall-clock time elapsed between pause and resume does not affect remaining time for either player.**

This is symmetric and matches Lichess. The player who was to move at pause is to move at resume, with their pre-pause remaining time intact.

### Edge cases

- **Time control with no clock yet (pregame).** Pause is a no-op; nothing to freeze.
- **A player resigns from a paused game** (e.g., from another tab where they can still click resign). Allowed. Resignation is unilateral and doesn't depend on clocks. Game terminates with `reason: 'resignation'` as usual.
- **A move arrives at the server while paused.** Reject with an error event back to the client. Don't silently drop. UI should already be greyed out, but defensive server check is required.

## Resume policy

**Trigger:** as soon as every seat is "present," append `resume`. Otherwise, after 90 seconds since the new server came up, append `resume` regardless.

**Presence rules by seat type:**

- **Human seat:** present only when a non-displaced client occupies that seat with a `seatTokenHash` matching `room.seatTokens[color].tokenHash`. The token is the auth boundary — an attacker without the token cannot force-resume by connecting.
- **Engine seat** (`isServerEngineClient`): always present while the server is up. Engines are server-controlled — there's no reconnect to wait for. Without this, PvE games would always wait the full 90s grace before resuming, and EvE games through the live WS path would never resume on hydration.

**Implications by mode:**

| Mode | Resume trigger |
|---|---|
| PvP | Both human seats need a live socket with matching token |
| PvE | The human reconnects (engine is auto-present) |
| EvE (live WS path) | Any client connection (both engines auto-present); rare in production since EvE typically runs on the separate engine-worker container |

**Why both-or-90s:**
- If both come back fast, the game resumes immediately. Best UX.
- If only one comes back, resuming after 90s means the absent player still has their standard abandon-timer grace before forfeiting. Symmetric: the 90s clock applies before resume, then the abandon timer applies after resume. Total exposure for an absent player is bounded by `90s + abandon_grace`, which is the same total exposure they'd have had without the restart.
- The 90s window is intentionally short. Players who come back to a paused game expect to play within seconds of refresh, not minutes.

**Reconnection identification:** uses the existing room-seat-token machinery (`room_seat_tokens` table in `persistence.ts`). A client reconnects → presents seat token → server matches them to a seat in the hydrated paused room. Same flow as today's mid-game reconnect.

## Stale paused room sweep

A **stale paused room** is one where:
- The last event is `pause` (no following `resume`)
- At least 24 hours have passed since the pause timestamp
- No client has touched the room since the server's current uptime began

### Why 24 hours

| Window | Tradeoff |
|---|---|
| 1 hour | Punishes players who restart their laptop, eat dinner, take a meeting |
| 6 hours | Covers a workday gap but breaks "I'll finish it tonight" |
| **24 hours** | Matches intuition for an unfinished game; rare false negatives |
| 7 days | Effectively never expires; paused rooms accumulate indefinitely |

Configurable via `MISTBOARD_STALE_PAUSE_HOURS` env var. Tune from telemetry — if the `server-restarted` termination is firing too often, raise the window; if it never fires, the games row stays clean either way.

### Finalization rule

Stale paused rooms are finalized as:
- `result: 'draw'`
- `termination: 'server-restarted'` (already present in the `GameTermination` union; see `apps/server/src/persistence.ts`)

**Why draw, not forfeit:** you can't distinguish "didn't return" from "tab closed and never refreshed" between two players. Symmetric pause → symmetric resolution. The asymmetric case (one player came back, the other didn't) is handled by the existing abandon flow on the post-resume timer — not by this sweep.

**Rating impact:** none in casual play (no ratings today). Post-rated-flip: `server-restarted` is explicitly excluded from rating updates. Don't penalize a player for our restart.

### Where the sweep runs

A periodic job in the server (~every 15 min) that selects paused-and-untouched rooms older than the window and finalizes them. Idempotent — if the sweep races with a player reconnecting, whichever finalize completes first wins. The losing path is a no-op on a terminal game.

## Failure modes & recovery

| Scenario | Behavior |
|---|---|
| Clean shutdown (planned drain) | Pauses written, server exits, hydrate on startup. Happy path. |
| SIGKILL before pauses written | On startup, the **failsafe sweep** finds rooms whose last event isn't terminal and whose last event timestamp is recent. Treat them as paused. Same recovery code path. |
| Pause event written; server crashes before more events | Restart sees a clean paused room; resumes normally. Pause is the safe state. |
| Postgres unreachable on startup | Don't accept reconnects until paused-room hydration succeeds. Fail-closed. WS connections get a 503-ish error. |
| Paused room, both players never come back | Stale sweep finalizes at 24h. |
| Paused room, only one player comes back | After 90s grace, `resume` is appended. Abandon timer takes over for absent player. Standard forfeit flow. |
| Player tries to move while paused | Reject with an explicit error to the client. UI should already be in paused state but server is the source of truth. |
| Player resigns from a paused game | Allowed. Terminates with `reason: 'resignation'`. |
| Concurrent stale-sweep + reconnect | Whichever writes a terminal event first wins. The other becomes a no-op. |

## Drain mode UI

While the server is in drain (`{ kind: 'server_restart_scheduled' }` broadcast received):

- Persistent banner at top: *"Server restarting in **14:23**. Your game will pause briefly and resume after restart."* (Absolute timestamp; client ticks locally.)
- Matchmaking and "New game" actions disabled with the same explanatory copy.
- Active-game UI unchanged until the final-pause sweep at T-00:30.

On `{ kind: 'game_paused' }`:

- Board greys out with a "Paused — server restarting" overlay.
- Clock display freezes at the pause-snapshot value.
- Resign button remains available.
- Auto-reconnect on socket drop, with backoff (existing logic).

On `{ kind: 'game_resumed' }`:

- Overlay clears, clocks resume from the pause snapshot, gameplay continues.

Absolute timestamps over durations for every server→client time field. Robust to socket reconnects and tab backgrounding.

## Performance

Effectively zero overhead on the hot path. The matchmaking-time drain check is a single boolean read. The pause-sweep is N inserts (one per active room) executed once per deploy. Countdown broadcast is a handful of WS messages over the drain window.

## Build phases

Each phase is independently shippable.

| Phase | Scope | Status |
|---|---|---|
| **1. Event kinds + replay** | Add `pause` / `resume` to `GameEvent`, extend `applyGameEvent`, add `paused` flag to `GameProjection`. Replay tests. | Shipped |
| **2. Pause on shutdown + hydrate on startup** | `shutdown()` and `stopServer()` append `pause` for active rooms before closing sockets. Hydration happens implicitly through existing `getOrCreateRoom` → `loadRoom` → `replayGameEvents` path; `paused: true` projections reject moves and skip engine scheduling. | Shipped |
| **3. Drain endpoint + matchmaking guard + countdown** | Server-side: `POST /admin/drain` (token-gated, idempotent, rate-limited 10/min/IP), `POST /admin/drain/cancel`, separate `MISTBOARD_DRAIN_TOKEN` env var, matchmaking guards on `/api/rooms` and `/api/lobby` (both return 503 + `restartAt`), WS broadcast `server_restart_scheduled`/`server_restart_cancelled` to all connected clients. Configurable: `MISTBOARD_DRAIN_WINDOW_DEFAULT_MS` (15min), `MISTBOARD_DRAIN_WINDOW_MAX_MS` (1h). Client (Phase 3b, 2026-05-21): `apps/web/src/restart-banner.ts` — sticky banner above `.site-nav`, mounted by `main.ts`, ticks countdown locally from absolute `restartAt`, updated by both `/api/server-status` boot fetch and live WS events. `setRestartBanner(null)` on receive of `_cancelled` or when `restartAt` is in the past. 8 unit tests in `restart-banner.test.ts`. | Shipped |
| **4. Resume logic + paused-board overlay** | Both-present-or-90s resume trigger; client overlay; reconnect path. Server: `resumeRoom` + `resumeRoomIfReady` in `room-manager.ts`, `armPauseGraceTimer` in `index.ts`, wired into `handleConnection` and `getOrCreateRoom`. Client: `paused` field in snapshot payload, `board-paused` overlay div with greyscale board class, `renderPausedOverlay` toggles on `liveState.paused`. | Shipped |
| **5. Failsafe sweep + abandon-timer integration** | Lazy on-hydration SIGKILL recovery via `applyOrphanRecoveryIfNeeded` in `room-manager.ts`. When `loadRoom` returns events whose last entry is non-terminal and older than `MISTBOARD_ORPHAN_THRESHOLD_MS` (default 5 min), a synthetic `pause` is appended at `lastEvent.at + 1` and persisted. Phase 4 resume flow takes over from there. No abandon-timer changes needed — the existing clock + per-color timeouts naturally handle absent players after resume. | Shipped |
| **6. Stale-sweep job** | Periodic finalize of paused rooms older than `MISTBOARD_STALE_PAUSE_HOURS` (default 24h). Shipped 2026-05-21: `finalizeStalePausedRooms()` in `persistence.ts` selects running games whose latest event is `pause` with `payload.at < now - staleAfterMs`, updates to `status='completed'`, `result='draw'`, `termination='server-restarted'`, fills `ply_count` from move-played events. Idempotency anchor is `WHERE games.status = 'running'` on the UPDATE — races with reconnect→resume→`recordGameEnd` on the same predicate; first-writer wins. Wired via `runStalePausedSweep()` in `index.ts` (default poll every 15min, env `MISTBOARD_STALE_PAUSED_SWEEP_MS`). Every finalize emits a `level: 'warn'` per-room log line — these games should not exist in steady state (resume + abandon-timer normally handle one-side returns), so each occurrence is investigable. Postgres integration test covers 5 scenarios + idempotency. | Shipped |
| **7. `safe-deploy.mjs`** | Script: drain → poll for zero-active → print ready-to-deploy. Shipped 2026-05-21 at `scripts/safe-deploy.mjs`. Reads `MISTBOARD_DRAIN_TOKEN` from env (never echoes). Probes `/health`, baselines via `/api/server-status` (which now returns `{ restartAt, activeGames }`), POSTs `/admin/drain` with `windowMs`, polls every 30s until `activeGames === 0` or window elapses. **Does NOT auto-run `railway up`** — script ends one step before the irreversible action, prints the exact next command for the human. SIGINT handler calls `/admin/drain/cancel` so a Ctrl-C doesn't leave the server blocking matchmaking. Idempotent reuse if drain is already active. Exit codes: 0 ready, 1 config error, 2 server unreachable, 3 drain endpoint failed, 4 window elapsed with games still active (proceed with pause/resume safety net), 130 SIGINT. | Shipped |

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `MISTBOARD_DRAIN_WINDOW_DEFAULT_MS` | 900_000 (15min) | Default drain countdown duration when request omits `windowMs` |
| `MISTBOARD_DRAIN_WINDOW_MAX_MS` | 3_600_000 (1h) | Hard cap on drain window — oversized requests get clamped |
| `MISTBOARD_DRAIN_TOKEN` | unset | Required in production for `/admin/drain` calls (separate from `MISTBOARD_ADMIN_DEBUG_TOKEN`) |
| `MISTBOARD_RESUME_GRACE_MS` | 90_000 | How long to wait for both players before resuming anyway |
| `MISTBOARD_ORPHAN_THRESHOLD_MS` | 300_000 | Minimum age of last event before a non-paused playing room gets synth-paused on hydration (SIGKILL recovery) |
| `MISTBOARD_STALE_PAUSE_HOURS` | 24 | Window before a paused room with no reconnect is finalized |
| `MISTBOARD_STALE_PAUSED_SWEEP_MS` | 900_000 (15min) | How often the stale-paused sweep runs |
| `MISTBOARD_EMERGENCY_DEPLOY` | unset | If set, skip drain entirely. For security/prod-fix urgency. |

## Security & hardening

Mistboard is open-source, so the design must be robust under Kerckhoffs's principle — security comes from secrets (tokens) and from server-canonical state, never from hiding endpoint paths or code paths.

**Game-state integrity properties (already enforced by Phases 1-2):**

- Event writes are server-internal only. `appendEvent` in `apps/server/src/persistence.ts` is never reachable from a client message or HTTP route. An attacker cannot forge `pause` or `resume` events.
- Move-rejection on paused rooms reads `room.projection.paused` from server memory, not from any client claim.
- Resume timing is symmetric: both players' clocks were frozen at the same wall-clock moment. There is no time-advantage exploit from triggering resume early or late.

**Invariant to preserve going forward:**

- Never expose a public endpoint or WS message type that takes a raw `GameEvent` payload from a client. Several events carry optional `clock` fields whose values would forge clock state if accepted from clients. The current `playMove` path computes clocks server-side; keep all future input paths the same.

**Phase 3 admin endpoint hardening (required before that phase ships):**

1. **Idempotent drain.** Re-hitting `POST /admin/drain` while already in drain returns the existing deadline; it does not extend it. Prevents both accidental retries and malicious deadline-shifting if the token leaks.
2. **Separate token.** Use a dedicated `MISTBOARD_DRAIN_TOKEN` env var, not the existing `MISTBOARD_ADMIN_DEBUG_TOKEN`. Smaller blast radius if either secret leaks.
3. **Per-IP rate limit on `/admin/drain`.** Reuse the `recordMessageTimestamp` pattern from `server-policy.ts`. Tight cap (e.g., 10 req/min/IP) — the endpoint is hit by deploy scripts at low frequency.
4. **No token in logs or bundles.** Log only `kind: 'drain_invoked'` without request headers (current JSON log format already does this). Add a CI check that no string matching the token env-var name appears in `apps/web/dist/`.
5. **Cancel endpoint.** `POST /admin/drain/cancel` with the same auth, for human-error recovery.

**Phase 6 stale-sweep race protection (shipped):**

The design originally called for a `WHERE NOT EXISTS (terminal event for this room)` precondition on the finalize INSERT. In practice, the equivalent guard is at the games-row level: `WHERE games.status = 'running'` on the UPDATE. A concurrent reconnect→resume→`recordGameEnd` races on the same predicate and first-writer wins. The events stream doesn't have a single "terminal event" type (game ends are projection-derived from `move-played` / `clock-expired` / `seat-resigned`), so the games-row anchor is the natural fit. The same first-writer pattern mirrors the termination-check guard added after the 2026-05-14 resign incident.

**Residual ghost-game window:** if a player reconnects after sweep finalizes but before any server restart evicts the (now-stale) hydration path, they could play moves in-memory that never persist (`recordGameEnd` no-ops against the already-completed row). Acceptable for v1 since the sweep only runs at ≥24h pause age — by then in-memory state is long gone. Defensive lifecycle check in `getOrCreateRoom` would close it completely; deferred until users exist.

**Open-source-specific notes:**

- Endpoint paths, header names, and the 24-hour stale window are public information. This is intentional — no exploit is available from knowing them, and visibility lets the FoW community audit fairness properties (clock symmetry, server-canonical truth) without trusting a vendor.
- Secrets (`DATABASE_URL`, admin/drain tokens, session keys) live only in Railway env. Global rule in CLAUDE.md applies.

## References

- Event log: `apps/server/src/persistence.ts` (`appendEvent`, `loadRoom`)
- Event types & replay: `packages/game/src/events.ts`
- Clock primitives: `packages/game/src/clocks.ts`
- Current shutdown: `apps/server/src/index.ts:1347` (`shutdown()`)
- Game termination types: `apps/server/src/persistence.ts` (`GameTermination`)
- Reconnect / seat tokens: `apps/server/src/persistence.ts` (`loadRoomSeatTokens`, `upsertRoomSeatToken`)

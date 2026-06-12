# Status

_Last updated: 2026-06-11_

**State:** active
**Launched:** https://mistboard.com

## Thesis

Mistboard is an open-source, trustworthy platform foundation for
hidden-information games, starting with dark chess. The intended loop is:
challenge a serious first-party dark-chess engine through a public, auditable
information boundary, learn why the game is compelling, then climb a serious
ranked ladder against other players.

## What's Active

Working toward **M1 — Pre-distribution gates** (see [ROADMAP.md](ROADMAP.md#m1--pre-distribution-gates)).

Recent shipped work:
- Pause/resume protocol for safe deploys (drain banner, hydration, stale-paused sweep)
- `/learn` interactive tutorial — first three Fog of War steps
- Settings panel with board / fog / piece-set tile pickers
- Engine v0.9.5 with phantom-check guard and recapture exemption
- Per-bucket leaderboard infra (dormant until rated flip)
- WS integration harness + Postgres-backed integration test for `recordGameEnd`
- Game-spec taxonomy for current and future hidden-information variants
- Hidden Dark Xiangqi live-room/postgame/review spike behind explicit flags
- Dark Mini Xiangqi public alpha: PvP/PvE/lobby entry, rules, postgame/replay,
  and public PvE watch channel
- Public platform activity stats and watch/replay polish
- Homepage hero showcase: PvP-first with an engine-vs-engine fallback
- Unlisted admin engine tracker: `/engines` version roster + `/engine/:id` per-engine profile (PvE-first record, sourced from `game_participants`)
- Rated-mode plumbing remains off by default and account-gated
- Variant-tenant live-room platform: a generic server room runtime
  (rooms, persistence, hydration, ws host, lobby/create dispatch) plus a
  shared web socket client and room chrome, with variants registered
  through a single registry entry per side. Dark Mini Xiangqi, Dark
  Xiangqi, and Crossroads Chess all run on it.
- Dark chess packaged on the same tenant contract with a replay-parity
  test suite; the chess/DMX web shell now shares the platform's single
  connection state machine (reconnect staging, latency reporting, restart
  banners now uniform across all variants)
- Deploy safety: the drain gate counts in-progress games across every
  variant, and server-restart countdown banners reach all live rooms

Still open against M1:
- Record mobile gameplay end-to-end evidence for iPhone Safari + Android Chrome
- Record empty-lobby engine fallback verification in production
- Record PostHog funnel verification from real traffic
- Record article mobile pass evidence (TOC, stepper, board composition)
- Confirm the current playable engine clears the M1 beginner bar
- Turn the DMX/MX alpha into a measured content and regional-access track,
  without pulling rated or tournament obligations forward

Moved out of M1:
- Draft960 lobby and Draft960 rated work are M4. The Draft960 article exists,
  but the launch surface stays standard Fog of War to avoid splitting the pool.
- Dark Xiangqi is a hidden dev spike, not an M1 public launch surface.
- Per-game OG Phase 2 (loser-view + truth boards) is M3. Cut from M1 by
  decision (2026-05-30): rich per-game share cards only pay off at share
  volume (M3 hard launch), and there'll be real games to render by then. M1
  keeps the Phase 1 stub; the M1 OG bar is just "OG scraper sanity."

Release confidence work now active:
- Local production-like release smoke: build, local Postgres, migrations, server
  boot, PvP WebSocket smoke, and builtin-engine PvE smoke.
- Public artifact identity through `/api/server-status` build metadata.
- Public/private documentation cleanup: public docs should stay
  contributor-safe; exact provider runbooks belong in ignored private notes.

## What's Next

M1 gates → M2 soft launch (200 casual standard 3+2 games) → M3 Elo calibration + standard rated flip + hard launch → M4 Draft960 rated flip → M5+ public engine protocol and benchmark track. DMX/MX runs as a parallel public-alpha distribution experiment: content first, regional readiness second, rated later.

## Risk

Scope creep on variant-lab, DMX regionalization, or engine work before the
active gates have evidence.

## Blockers

None.

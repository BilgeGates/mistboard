# Status

_Last updated: 2026-06-01_

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
- Public platform activity stats and watch/replay polish
- Homepage hero showcase: PvP-first with an engine-vs-engine fallback
- Unlisted admin engine tracker: `/engines` version roster + `/engine/:id` per-engine profile (PvE-first record, sourced from `game_participants`)
- Rated-mode plumbing remains off by default and account-gated

Still open against M1:
- Record mobile gameplay end-to-end evidence for iPhone Safari + Android Chrome
- Record empty-lobby engine fallback verification in production
- Record PostHog funnel verification from real traffic
- Record article mobile pass evidence (TOC, stepper, board composition)
- Confirm the current playable engine clears the M1 beginner bar

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

M1 gates → M2 soft launch (200 casual standard 3+2 games) → M3 Elo calibration + standard rated flip + hard launch → M4 Draft960 rated flip → M5+ public engine protocol and benchmark track.

## Risk

Scope creep on variant-lab or engine work before M1 gates clear.

## Blockers

None.

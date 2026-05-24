# Status

_Last updated: 2026-05-24_

**State:** active
**Launched:** https://mistboard.com

## Thesis

Mistboard is an open-source, trustworthy platform foundation for
hidden-information games, starting with dark chess. The intended loop is: play
the strongest open-source dark-chess engine, learn why the game is compelling,
then climb a serious ranked ladder against other players.

## What's Active

Working toward **M1 — Pre-distribution gates** (see [ROADMAP.md](ROADMAP.md#m1--pre-distribution-gates)).

Recent shipped work:
- Pause/resume protocol for safe deploys (drain banner, hydration, stale-paused sweep)
- `/learn` interactive tutorial — first three Fog of War steps
- Settings panel with board / fog / piece-set tile pickers
- Engine v0.9.5 with phantom-check guard and recapture exemption
- Per-bucket leaderboard infra (dormant until rated flip)
- WS integration harness + Postgres-backed integration test for `recordGameEnd`

Still open against M1:
- Mobile gameplay end-to-end on iPhone Safari + Android Chrome
- Per-game OG Phase 2 (loser-view + truth boards rendered)
- Draft960 lobby surfaced and Draft960 article wired from landing
- Engine strength sufficient for "not embarrassing" against beginners
- PostHog funnel verified live with real traffic
- Article mobile pass (TOC, stepper, board composition)

## What's Next

M1 gates → M2 soft launch (200 casual standard 3+2 games) → M3 Elo calibration + standard rated flip + hard launch → M4 Draft960 rated flip → M5+ engine track.

## Risk

Scope creep on variant-lab or engine work before M1 gates clear.

## Blockers

None.

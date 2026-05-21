# Roadmap

_Last updated: 2026-05-14_

## Done

- [x] **M0 — Core loop + Sprint 2 distribution prep.** PvP Fog of War playable end-to-end from a link. Resign, rematch, presence, reconnect, casual leaderboard infra (hidden), bucket-collapsed lobby, engine fallback, per-game OG Phase 1 stub, articles scaffolding, WS integration test harness, CI safeguards.

## In Progress

- [ ] **M1 — Pre-distribution gates.** Definition of done before any outreach. Checklist below.

## Planned

- [ ] **M2 — Soft launch + Elo calibration.** Discord, friend network, small subreddits. Target: 200 casual standard 3+2 games persisted. Run offline Elo simulation against the `games` table; tune K-factor; scan for anomalous endings.
- [ ] **M3 — Standard rated flip + hard launch.** Unhide leaderboard, turn on rated standard 3+2. Then r/chess, HN, streamer DMs.
- [ ] **M4 — Draft960 rated flip.** Once Draft960 casual queue has accumulated ~200 games, repeat the calibration cycle for Draft960's own rating pool.
- [ ] **M5+ — Engine track (post-distribution).** FUCI spec → Tier-1 engine → public engine leaderboard → open-source engine release + Article #3.

## Deferred / Parked

- Engine article (Article #3) — held for the open-source engine release moment.
- FUCI / engine submission — Stage E1+ post-distribution.
- Half-open TCP smoke and browser-level E2E (Playwright) — out of scope for v1.
- SSR exploration — server-rendered nav/pages to eliminate auth-state flash and unlock SEO for /articles + /@/handle. Current mitigation is the `mb_signed_in` localStorage hint in `account-nav.ts`. Likely trigger: wanting articles/profiles to rank in search.

---

## M1 — Pre-distribution gates

Outreach is one-shot for HN reputation and streamer credibility. Every item is pass/fail. Nothing here is "we'll fix it after the wave."

**Staged distribution model:**
1. M1 gates pass → M2 soft launch begins
2. M2 accumulates 200 casual standard games → M3 calibrate + flip standard rated
3. M3 hard launch (HN, r/chess, streamers)
4. M4 Draft960 rated flip once its own ~200-game volume hits

### Tier A — Reliability

- [ ] Mobile gameplay end-to-end on iPhone Safari + Android Chrome (cold load → join → play → finish)
- [ ] Empty-lobby engine fallback verified in prod (30s queue → engine offer → playable game)
- [ ] Persistence smoke for resign: real Postgres, verify `games` row + `game_participants` rows written correctly. Today's WS harness runs in-memory, so the `recordGameEnd` parameter-index bug class is invisible to CI.
- [ ] Manual sleep/reconnect test per role (half-open TCP isn't covered by the harness)

### Tier B — Share surface

- [ ] Per-game OG Phase 2 shipped (loser-view + truth boards rendered, not the Phase 1 stub)
- [ ] OG scraper sanity: Discord, iMessage, Twitter, Slack all render the right card
- [ ] FoW rules article published and linked from landing
- [ ] Draft960 article published and linked from landing
- [ ] Article mobile pass (TOC sidebar, stepper, board composition all readable on phone)

### Tier C — Observability

- [ ] PostHog funnel verified live with real traffic: arrive → start → finish events firing with bucket dims
- [ ] Server error surface checked daily during the wave (Railway logs or wherever)
- [ ] SQL query ready to answer "N players, M games, K finished" against `games` + `game_participants`

### Tier D — First-touch UX

- [ ] <5 seconds to "this is Fog of War chess" on landing (sanity-check with a non-chess friend)
- [ ] ≤3 clicks from cold load to in-game
- [ ] Anonymity model legible: a new visitor doesn't wonder whether sign-up is required

### Tier E — Product depth

- [ ] Draft960 lobby real (not "coming soon" stub). Casual-only at soft-launch; rated flip sequenced for M4.
- [ ] Engine strength bar: "not embarrassing." Stronger than current fallback so beginners aren't bored, weaker than club player. Not Tier-1 — that's M5+.
- [ ] (M3 gate, not M1) Rated leaderboard flipped on after M2 calibration completes.

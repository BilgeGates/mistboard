# Roadmap

_Last updated: 2026-05-23_

## Done

- [x] **M0 — Core loop + Sprint 2 distribution prep.** PvP Fog of War playable end-to-end from a link. Resign, rematch, presence, reconnect, casual leaderboard infra (hidden), bucket-collapsed lobby, engine fallback, per-game OG Phase 1 stub, articles scaffolding, WS integration test harness, CI safeguards.

## In Progress

- [ ] **M1 — Pre-distribution gates.** Definition of done before any outreach. Checklist below.

## Planned

- [ ] **M2 — Soft launch + Elo calibration.** Discord, friend network, small subreddits. Target: 200 casual standard 3+2 games persisted. Run offline Elo simulation against the `games` table; tune K-factor; scan for anomalous endings.
- [ ] **M3 — Standard rated flip + hard launch.** Unhide leaderboard, turn on rated standard 3+2. Then r/chess, HN, streamer DMs.
- [ ] **M4 — Draft960 enable + rated flip.** Draft960 is deliberately cut from the M1–M3 launch surface (standard-only, to avoid splitting the matchmaking pool and to keep first-touch legible). M4 enables it: flip `VITE_DRAFT960_ENABLED=true` to expose the format selector (casual-only first), accumulate ~200 Draft960 casual games, then repeat the calibration cycle for Draft960's own rating pool. Today's default build shows a static "Dark chess" variant label with no format dropdown.
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

**Legend:** `[x]` done/verified · `[~]` code shipped, needs a runtime/manual check before it counts · `[ ]` open. Reconciled against the tree 2026-05-23.

### Tier A — Reliability

- [ ] Mobile gameplay end-to-end on iPhone Safari + Android Chrome (cold load → join → play → finish). _Nav + landing + pair-board mobile pass shipped (3b7a53d); the **live game screen has never been tested on mobile** — that's the open part._
- [~] Empty-lobby engine fallback (30s queue → engine offer → playable game). _Code shipped (Path A: single-click PvE 3+2 at 15s). Still needs the "verified in prod" pass._
- [x] Persistence smoke for resign: real Postgres, verify `games` row + `game_participants` rows written correctly. **Done** — CI (`ci.yml`) runs an isolated `postgres:16-alpine` service with `TEST_DATABASE_URL` set, and `apps/server/integration/persist-resign.test.ts` asserts the `games` row (termination=`resignation`, plyCount, status, mode) + two `game_participants` rows on every push. The `recordGameEnd` parameter-index bug class is covered.
- [ ] Manual sleep/reconnect test per role (half-open TCP isn't covered by the harness). _Manual; not yet run._

### Tier B — Share surface

- [ ] Per-game OG Phase 2 shipped (loser-view + truth boards rendered, not the Phase 1 stub). _Open question since 2026-05-18: keep the Phase 1 stub, redesign, or drop from M1. This is a decision, not a build — settle it._
- [ ] OG scraper sanity: Discord, iMessage, Twitter, Slack all render the right card. _Deferred; manual, not yet run._
- [x] FoW rules article published and linked from landing. _`dark-chess-rules` in `articles-data.ts`; surfaced via landing thumbnails + `/articles`._
- [x] Draft960 article published and linked from landing. _`draft960` in `articles-data.ts`; same surface._
- [ ] Article mobile pass (TOC sidebar, stepper, board composition all readable on phone). _Deferred pending article content/polish._

### Tier C — Observability

- [~] PostHog funnel events with bucket dims firing: arrive → start → finish. _Instrumented with `time_class` dims (`landing.ts`, `live-render.ts`). Live verification against real traffic still pending._
- [ ] Server error surface checked daily during the wave (Railway logs or wherever). _Ongoing wave activity; not a pre-launch checkbox._
- [ ] SQL query ready to answer "N players, M games, K finished" against `games` + `game_participants`. _Open: `/api/live-stats` gives a live `{playing, online}` snapshot, but there's no saved cumulative-stats query/script. Cheap to add when needed._

### Tier D — First-touch UX

- [x] <5 seconds to "this is Fog of War chess" on landing. _Cleared in the 2026-05-18 landing reshape: tagline paired directly above single-POV hero board._
- [x] ≤3 clicks from cold load to in-game. _Cleared: each play action is 2 clicks (button + confirm) via `openLandingSetupDialog`._
- [x] Anonymity model legible. _Cleared: Register demoted to text link, "No account needed." microcopy under the play CTAs._

### Tier E — Product depth

- Draft960 lobby — **moved to M4.** Cut from the launch surface by decision (2026-05-23): standard-only avoids pool-splitting at low volume and protects first-touch clarity. Code path exists behind `VITE_DRAFT960_ENABLED` (off by default); no longer an M1 gate.
- [ ] Engine strength bar: **M1-bar**, not Brian-bar. Stronger than current fallback so beginners aren't bored, weaker than club player. Days of work, not months. **Do not conflate with the Obscuro replication track** (post-distribution, M5+) — that's the bar a strong dark-chess player isn't embarrassed by, and it's a months-of-research problem, not weeks. Shipping M1-bar engine for the empty-lobby flow is the gate; Obscuro runs on its own clock.
- [ ] (M3 gate, not M1) Rated leaderboard flipped on after M2 calibration completes.

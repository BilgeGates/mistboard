# Roadmap

_Last updated: 2026-05-27_

## Product Pillars

Mistboard has two public product pillars:

- **Human ladder:** server-enforced dark chess, calibrated rated games, and a
  serious ranked ladder.
- **Engine ecosystem:** a public engine protocol, public baseline engines,
  reproducible benchmarks, and a first-party dark-chess engine that competes
  through the same auditable information boundary as every other engine.

The landing-page promise should stay simple: play dark chess online. The second
layer explains why Mistboard is different: server-enforced hidden information,
ranked integrity, and a serious engine track.

## Done

- [x] **M0 — Core loop + Sprint 2 distribution prep.** Server-enforced PvP dark chess playable end-to-end with low-friction room sharing. Resign, rematch, presence, reconnect, casual leaderboard infra (hidden), bucket-collapsed lobby, engine fallback, per-game OG Phase 1 stub, articles scaffolding, WS integration test harness, CI safeguards.

## In Progress

- [ ] **M1 — Pre-distribution gates.** Definition of done before any outreach. Checklist below.

## Planned

- [ ] **M2 — Soft launch + Elo calibration.** Discord, friend network, small subreddits. Target: 200 casual standard 3+2 games persisted. Run offline Elo simulation against the `games` table; tune K-factor; scan for anomalous endings. Keep the playable engine visible as the no-opponent fallback and learning opponent.
- [ ] **Login/account hardening track.** See [Login Track](login-track.md). This is not an M1 gameplay gate, but L4 fair-play acceptance is a prerequisite for the M3 standard rated flip, and any engine-play account gate must preserve or intentionally replace the M1 empty-lobby fallback.
- [ ] **M3 — Standard rated flip + hard launch.** Unhide leaderboard, turn on rated standard 3+2. Then r/chess, HN, streamer DMs.
- [ ] **M4 — Draft960 enable + rated flip.** Draft960 is deliberately cut from the M1–M3 launch surface (standard-only, to avoid splitting the matchmaking pool and to keep first-touch legible). M4 enables it: flip `VITE_DRAFT960_ENABLED=true` to expose the format selector (casual-only first), accumulate ~200 Draft960 casual games, then repeat the calibration cycle for Draft960's own rating pool. Today's default build shows a static "Dark chess" variant label with no format dropdown.
- [ ] **M5+ — Engine track.** Push from playable engine to public
  protocol and benchmark ecosystem: redacted engine payloads, public baseline
  engines, reproducible games, FUCI-style spec, external first-party engine
  adapter, public engine leaderboard, and Article #3. Includes the parked
  **Engine Identity & Discovery** subtrack: stable public engine
  identities/slugs, engine participation metadata in persisted games,
  Mistboard TV engine channels, engine profile pages linked from replay
  headers, and public recent-game/version/benchmark records. Engine profiles
  are public records for engines and games, not a social network surface;
  follows, comments, chat, and moderation remain separately gate-cleared. For
  future Dark Xiangqi engine work, revisit the current TypeScript
  `elephantops`-backed rules wrapper before putting it in an engine hot path:
  the live-room layer is acceptable for play, but engine search should review
  kernel performance, allocation patterns, and the GPL dependency boundary.

## Deferred / Parked

- Engine article (Article #3) — held for the public protocol and benchmark
  launch moment.
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

Manual gates should not be closed from memory. When a gate is verified, record
the evidence in the item text: date, target environment, device/browser when
relevant, and the room/game URL or smoke command. If a gate is intentionally cut
from M1, say that explicitly instead of leaving it as stale open work.

### Tier A — Reliability

- [ ] Mobile gameplay end-to-end on iPhone Safari + Android Chrome (cold load → join → play → finish). _Do not close until the actual device/browser pass is recorded here._
- [~] Empty-lobby engine fallback (30s queue → engine offer → playable game). _Code shipped (Path A: single-click PvE 3+2 at 15s). Still needs the "verified in prod" record._
- [x] Persistence smoke for resign: real Postgres, verify `games` row + `game_participants` rows written correctly. **Done** — CI (`ci.yml`) runs an isolated `postgres:16-alpine` service with `TEST_DATABASE_URL` set, and `apps/server/integration/persist-resign.test.ts` asserts the `games` row (termination=`resignation`, plyCount, status, mode) + two `game_participants` rows on every push. The `recordGameEnd` parameter-index bug class is covered.
- [ ] Manual sleep/reconnect test per role (half-open TCP isn't covered by the harness). _Manual; not yet run._

### Tier B — Share surface

- [ ] Per-game OG Phase 2 shipped (loser-view + truth boards rendered, not the Phase 1 stub). _Open question since 2026-05-18: keep the Phase 1 stub, redesign, or drop from M1. This is a decision, not a build — settle it._
- [ ] OG scraper sanity: Discord, iMessage, Twitter, Slack all render the right card. _Deferred; manual, not yet run._
- [x] Dark chess rules article published and linked from landing. _`dark-chess-rules` in `articles-data.ts`; surfaced via landing thumbnails + `/articles`._
- [x] Draft960 article published and linked from landing. _`draft960` in `articles-data.ts`; same surface._
- [ ] Article mobile pass (TOC sidebar, stepper, board composition all readable on phone). _Deferred pending article content/polish._

### Tier C — Observability

- [~] PostHog funnel events with bucket dims firing: arrive → start → finish. _Instrumented with `time_class` dims (`landing.ts`, `live-render.ts`). Live verification against real traffic still pending._
- [ ] Server error surface checked daily during the wave (Railway logs or wherever). _Ongoing wave activity; not a pre-launch checkbox._
- [ ] SQL query ready to answer "N players, M games, K finished" against `games` + `game_participants`. _Open: `/api/live-stats` gives a live `{playing, online}` snapshot, but there's no saved cumulative-stats query/script. Cheap to add when needed._

### Tier D — First-touch UX

- [x] <5 seconds to "this is dark chess" on landing. _Current first-screen copy leads with "Dark chess" and one-sentence server-enforced hidden information._
- [x] ≤3 clicks from cold load to in-game. _Cleared: each play action is 2 clicks (button + confirm) via `openLandingSetupDialog`._
- [x] Anonymity model legible. _Cleared: Register demoted to text link, "No account needed." microcopy under the play CTAs._

### Tier E — Product depth

- Draft960 lobby — **moved to M4.** Cut from the launch surface by decision (2026-05-23): standard-only avoids pool-splitting at low volume and protects first-touch clarity. Code path exists behind `VITE_DRAFT960_ENABLED` (off by default); no longer an M1 gate.
- [ ] Engine strength bar: **M1-bar**, not Brian-bar. Stronger than current fallback so beginners aren't bored, weaker than club player. Days of work, not months. **Do not conflate with the Obscuro replication track** (post-distribution, M5+) — that's the bar a strong dark-chess player isn't embarrassed by, and it's a months-of-research problem, not weeks. Shipping M1-bar engine for the empty-lobby flow is the gate; Obscuro runs on its own clock.
- [ ] (M3 gate, not M1) Rated leaderboard flipped on after M2 calibration completes.

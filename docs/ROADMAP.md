# Roadmap

_Last updated: 2026-06-09_

## Product Pillars

Mistboard has two public product pillars:

- **Human ladder:** server-enforced dark chess, calibrated rated games, and a
  serious ranked ladder.
- **Engine ecosystem:** a public engine protocol, public baseline engines,
  reproducible benchmarks, a first-party dark-chess engine that competes
  through the same auditable information boundary as every other engine, and
  **engine-derived analysis** (game review, training) that a perfect-information
  engine structurally cannot offer — the differentiator and the monetization
  wedge. Longer strategy notes stay in private planning documents.

The landing-page promise should keep the umbrella legible without hiding the
first playable game: hidden-information games, starting with dark chess. The
second layer explains why Mistboard is different: server-enforced hidden
information, ranked integrity, and a serious engine track.

## Done

- [x] **M0 — Core loop + Sprint 2 distribution prep.** Server-enforced PvP dark chess playable end-to-end with low-friction room sharing. Resign, rematch, presence, reconnect, casual leaderboard infra (hidden), bucket-collapsed lobby, engine fallback, per-game OG Phase 1 stub, articles scaffolding, WS integration test harness, CI safeguards.

## In Progress

- [ ] **M1 — Pre-distribution gates.** Definition of done before any outreach. Checklist below.
- [ ] **DMX/MX public-alpha distribution experiment.** Dark Mini Xiangqi is live
  for casual PvP/PvE/lobby play. The active next step is content, localization,
  and Asia-readiness evidence, not rated ladder or tournament scope.

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
  headers, and public recent-game/version/benchmark records. An unlisted,
  admin-only version of this subtrack (engine version roster at `/engines` +
  per-engine `/engine/:id` profile, sourced from `game_participants`) already
  shipped as internal scaffolding; the public M5+ surface remains gated. Engine
  profiles are public records for engines and games, not a social network surface;
  follows, comments, chat, and moderation remain separately gate-cleared. For
  future Dark Xiangqi engine work, revisit the current TypeScript
  `elephantops`-backed rules wrapper before putting it in an engine hot path:
  the live-room layer is acceptable for play, but engine search should review
  kernel performance, allocation patterns, and the GPL dependency boundary.
- [ ] **M6 — Engine analysis (game review).** Post-game review that surfaces what
  the engine *believed*: the information-revealing moves, the blunders relative to
  a belief-aware eval, "here's what the engine thought your opponent had." This is
  the concrete form of the differentiation thesis — a surface a perfect-information
  engine (Fairy-Stockfish, what pychess/chess.com run) categorically cannot build,
  and the paid monetization wedge. **Gated on the engine reaching real strength**
  (Obscuro replication track, post-M5); do not conflate with the M1-bar empty-lobby
  engine. Free PvP stays free; analysis is the wedge. Longer differentiation
  and monetization notes stay in private planning documents.
- [ ] **Variant pipeline (sequenced 2026-06-10; liquidity-amended same day).**
  Three demand experiments, staggered, none taking the flagship's homepage
  slot before M1-M3. **Liquidity posture: player counts are expected to be
  low; PvE and (later) correspondence are the liquidity strategy, not PvP
  matchmaking. A working PvE bot is a launch gate for every variant in this
  queue.**
  1. **DMX public alpha** (running) — tests "dark ports of niche traditional
     games," PvE-led. The telemetry read is a plumbing + repeat-use check
     (funnel completes, anyone returns), NOT a demand verdict — DMX has no
     existing community to draw from; the real demand tests are Crossroads
     (designed variants) and jieqi (existing underserved community).
  2. **Crossroads Chess public test (variant #3)** — tests "invented designer
     variants." Build is done; remaining is launch-ladder only: lobby entry,
     casual-only at launch (no rated migration/calibration), watch visibility
     policy, mobile pass. FSF PvE bot already live. Staggered after DMX's
     first telemetry read.
  3. **Variant-tenant extraction (Layer 3)** — in the post-launch quiet
     window, BEFORE any new variant stack. The rule-of-three trigger fired
     2026-06-10 (four live stacks exist: dark chess, DMX, Dark Xiangqi,
     Crossroads). Extract the `VariantTenant` interface from the four real
     stacks behind hidden-info regression tests; target: new variant ≈ 5
     files, zero shared-infrastructure edits.
  4. **Correspondence on the generic room** — the second liquidity
     multiplier: days-per-move drops the co-presence requirement, thickening
     EVERY pool instead of adding thin ones. Built once on the tenant
     contract (a `clockPolicy` variation + scheduler + notifications), so
     all variants and all future tenants get async play free. Settle the
     open forks before building: account-required (lean yes — notifications
     need an address), notification channel (email first), forfeit-under-fog
     semantics. Hidden-info games suit async unusually well (belief
     reasoning rewards thinking time; Kriegspiel was played by mail for a
     century).
  5. **New tenants, in order:** Kriegspiel (cheapest content, stresses the
     visibility axis; cost correction 2026-06-11: NOT zero new primitives —
     the try loop means the seat can never be sent its legal-move set, and
     attempt→reject→retry with the clock running is a new wire/UX primitive
     the tenant contract must allow) → jieqi (demand bet; design the
     server-authoritative randomness primitive: shuffle seed in canonical
     state, reveal events, replay determinism, redaction of unrevealed
     identities AND of the captured dark-piece pool, which is per-seat
     private) → banqi and dark Crossroads ride the tenant + randomness
     work. Each launches with a PvE bot AND correspondence from day one.
     Ruleset policy (Brian, 2026-06-11): be true to each game's standard
     rules and follow the biggest capturable community — Kriegspiel = ICC
     wild-16 conventions, jieqi = Guangdong/Tencent rules, banqi = Taiwanese
     rules. Canonicalized in the draft rules articles (/rules/kriegspiel,
     /rules/jieqi, /rules/banqi).
  6. **Engine scope:** Misty stays on dark chess (Obscuro replication A5-A7).
     Kriegspiel launches with a weak sampled-belief bot (Misty-strength
     Kriegspiel is a research project, not a launch gate). Rule
     canonicalization resolved the engine families 2026-06-11: banqi is
     stochastic perfect-info (flips public, face-down pieces uncapturable)
     → MCTS-over-chance bot; jieqi under the ratified capturer-only
     capture-reveal rule HAS private information (asymmetric captured-pool
     knowledge) → needs at least a pool-tracking belief bot, not plain
     MCTS-over-chance. Neither needs Misty.
  New families beyond this queue are not launch-surface commitments by
  default; they need the same privacy, UX, and distribution evidence.

## Deferred / Parked

- Engine article (Article #3) — held for the public protocol and benchmark
  launch moment.
- FUCI / engine submission — Stage E1+ post-distribution.
- Half-open TCP smoke and browser-level E2E (Playwright) — out of scope for v1.
- SSR exploration — server-rendered nav/pages to eliminate auth-state flash and unlock SEO for /articles + /@/handle. Current mitigation is the `mb_signed_in` localStorage hint in `account-nav.ts`. Likely trigger: wanting articles/profiles to rank in search.
- Dark Xiangqi public launch — hidden/dev-only while the standard dark-chess
  launch gates remain open.
- Variant generalization (live-room tenant) — **promoted 2026-06-10** into
  the Planned variant pipeline (step 3): the rule-of-three trigger fired with
  four live stacks. History and the layer model live in the variant
  generalization track doc; an earlier registry-first attempt was premature.
- Hidden-identity / hidden-info game candidates (researched 2026-06-10) —
  the chosen trio (Kriegspiel → jieqi → banqi) is **sequenced in the Planned
  variant pipeline** (step 4); per-game research record below. All three
  verified underserved on the web. Rejected in the same review: Phantom Go
  (Go's dead-stone/scoring agreement assumes a shared board and has no
  hidden-info protocol; full Go rules for speculative demand) and liar's
  dice / word-deduction / Penultima (off-brand). Do not re-pitch without new
  evidence.
  - **Kriegspiel** (1899; see only your own pieces, umpire announcements) —
    cheapest build (a visibility-function variant of existing dark chess +
    umpire messages from the event log). Only live venue is ICC "wild 16"
    (paid, decayed) plus hobby sites. Strong positioning synergy as the
    historic ancestor of dark chess.
  - **Banqi (暗棋)** — half xiangqi board (4×8), all pieces shuffled
    face-down; flip or move each turn, capture by rank hierarchy, win by
    elimination. Casual, chance-heavy, big in Taiwan/HK; the AI literature's
    "Chinese Dark Chess" (Computer Olympiad engine tracks). Strongest "dark
    chess" name overlap. Served almost entirely by ad-supported mobile apps.
  - **Jieqi (揭棋)** — full 9×10 xiangqi rules; non-general pieces shuffled
    face-down on standard points, first move as the starting square's piece
    type, then revealed. Win by mating the general. Deeper game, popular in
    Guangdong (Vietnamese cờ úp is the cousin). Better architectural fit
    (xiangqi rules + general-capture). Rule canonicalization needed (regional
    and per-app variation). Both add hidden *identity* + server-authoritative
    randomness to the platform's information axes; both align with zh i18n.
  - **Luzhanqi** (Chinese military chess, Stratego cousin) — weakest case:
    zh audience is on mobile apps, western itch is served by the official
    Stratego app (Stratego itself is IP-locked). Largest engine-research
    synergy (imperfect-info family). Park unless the others prove out.

---

## M1 — Pre-distribution gates

Outreach is one-shot for HN reputation and streamer credibility. Every item is pass/fail. Nothing here is "we'll fix it after the wave."

**Staged distribution model:**
1. M1 gates pass → M2 soft launch begins
2. M2 accumulates 200 casual standard games → M3 calibrate + flip standard rated
3. M3 hard launch (HN, r/chess, streamers)
4. M4 Draft960 rated flip once its own ~200-game volume hits

**Legend:** `[x]` done/verified · `[~]` code shipped, needs a runtime/manual check before it counts · `[ ]` open. Reconciled against the tree 2026-06-01.

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

- Per-game OG Phase 2 (loser-view + truth boards) — **moved to M3.** Cut from M1 by decision (2026-05-30): rich per-game share cards only pay off at share volume (M3 hard launch), and there'll be real games to render by then. M1 keeps the Phase 1 stub. The truth-board reveal is strong FoW-specific share bait — revisit it as an M3 distribution asset, not a launch gate.
- [ ] OG scraper sanity: Discord, iMessage, Twitter, Slack all render the right card (Phase 1 stub is fine). _Manual, not yet run. This is the actual M1 OG bar._
- [x] Dark chess rules article published and linked from landing. _`dark-chess-rules` in `articles-data.ts`; surfaced via landing thumbnails + `/articles`._
- [x] Draft960 article published and linked from landing. _`draft960` in `articles-data.ts`; same surface._
- [ ] Article mobile pass (TOC sidebar, stepper, board composition all readable on phone). _Deferred pending article content/polish._

### Tier C — Observability

- [~] PostHog funnel events with bucket dims firing: arrive → start → finish. _Instrumented with `time_class` dims (`landing.ts`, `live-render.ts`). Live verification against real traffic still pending._
- [ ] Server error surface checked daily during the wave (Railway logs or wherever). _Ongoing wave activity; not a pre-launch checkbox._
- [ ] SQL query ready to answer "N players, M games, K finished" against `games` + `game_participants`. _Open: `/api/live-stats` gives a live `{playing, online}` snapshot, but there's no saved cumulative-stats query/script. Cheap to add when needed._

### Tier D — First-touch UX

- [x] <5 seconds to "this is hidden-information games, starting with dark chess" on landing. _Current first-screen copy leads with "Hidden-information games" and names server-enforced dark chess as the first playable game._
- [x] ≤3 clicks from cold load to in-game. _Cleared: each play action is 2 clicks (button + confirm) via `openLandingSetupDialog`._
- [x] Anonymity model legible. _Cleared: Register demoted to text link, "No account needed." microcopy under the play CTAs._

### Tier E — Product depth

- Draft960 lobby — **moved to M4.** Cut from the launch surface by decision (2026-05-23): standard-only avoids pool-splitting at low volume and protects first-touch clarity. Code path exists behind `VITE_DRAFT960_ENABLED` (off by default); no longer an M1 gate.
- [ ] Engine strength bar: **M1-bar**, not Brian-bar. Stronger than current fallback so beginners aren't bored, weaker than club player. Days of work, not months. **Do not conflate with the Obscuro replication track** (post-distribution, M5+) — that's the bar a strong dark-chess player isn't embarrassed by, and it's a months-of-research problem, not weeks. Shipping M1-bar engine for the empty-lobby flow is the gate; Obscuro runs on its own clock.
- [ ] (M3 gate, not M1) Rated leaderboard flipped on after M2 calibration completes.

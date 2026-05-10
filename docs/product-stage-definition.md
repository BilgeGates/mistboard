# Product Stage Definition

This document defines Mistboard product stages by user-visible capability and
decision leverage. It exists to prevent every general chess-platform gap from
becoming equally urgent.

Decision rule:

> Advance the stage only when the core user promise for that stage is true,
> verifiable, and understandable without operator coaching.

## Stage 0: Public Preview

Current posture: public watch/replay surface with live-play foundations.

User-visible promise:

- visitors can understand that Mistboard is Fog of War chess
- visitors can watch or open public finished games
- visitors can see perspective replay and truth reveal
- testers can find the Play surface, but live play is still hardening

Required surfaces:

- landing page
- watch page
- public finished-game pages
- about/learn explanation
- GitHub and public project docs

Not required:

- robust public live play
- accounts
- ratings
- matchmaking
- tournaments
- profiles

Exit criteria:

- public pages explain Fog of War and Mistboard's server-enforced hidden-information posture
- public replays work reliably for finished games
- Play entry points are not misleading about alpha readiness

## Stage 1: Private Alpha

User-visible promise:

- invited testers can create or open a Fog room link
- two players can join as White and Black
- hidden information is protected during live play
- ordinary reconnects recover the correct seat
- games can finish
- finished games can be reviewed from White, Black, and full-truth perspectives

Required surfaces:

- friend challenge rooms
- PvE baseline engine rooms
- private PvP live rooms
- replay/review handoff
- private-alpha QA smoke path
- known-limitation language where needed

Blocking decisions:

- live PvP spectator policy
- seat authority model
- duplicate-tab behavior
- replay visibility policy
- minimum manual smoke gate

Exit criteria:

- Priority 0 safety gate passes
- Priority 1 usefulness gate passes for replay, basic play UX, and rules regression coverage
- private-alpha testers can play without operator coaching

## Stage 2: Public Alpha

User-visible promise:

- a public visitor can try a Fog game or friend challenge with clear expectations
- live rooms are reliable enough for broader public testing
- finished games are shareable and understandable
- the project is transparent about rules, limitations, and hidden-information safety

Required surfaces:

- stable Play page
- clear create/share/join flow
- public rules and fairness documentation
- stable finished-game URLs
- basic signed-in or guest persistence path if needed for recovery and artifacts
- public issue/report path for gameplay or security concerns

Still deferred:

- ratings
- public matchmaking
- tournaments
- chat/social features
- broad profile/social graph

Exit criteria:

- live room reliability is acceptable without private coordination
- common failure states have clear UI
- public docs explain rules, payload policy, and known limitations

## Stage 3: Research / Engine Alpha

User-visible promise:

- engine authors and researchers can understand, reproduce, and compare Fog
  engine work
- Mistboard publishes benchmark games and methods with enough metadata to audit
- engine-vs-engine work is visible as a product surface, not only backend jobs

Required surfaces:

- engine registry or engine identity pages
- versioned engine metadata
- benchmark reports
- EvE game lists and review pages
- corpora/manifests
- annotations or review queues
- reproducibility notes

Blocking decisions:

- engine identity model
- engine author identity model
- benchmark metadata requirements
- isolation and allowed-observation policy
- public artifact format

Exit criteria:

- benchmark claims are reproducible or auditable
- engine games expose engine versions, configs, seeds, and time controls
- review/annotation workflow has a public-safe artifact path

## Stage 4: Early Platform

User-visible promise:

- Mistboard supports repeated use, identity, contribution, and public artifacts
  beyond one-off private-alpha links

Candidate surfaces:

- signed-in player profiles
- engine author profiles
- engine version/profile pages
- contributor/research profiles
- public game collections
- visibility-history review
- Fog-specific learning exercises
- Draft960-as-Fog-pregame

Still not automatic:

- ratings
- public matchmaking
- tournaments
- teams/forums/chat
- broad social graph

Exit criteria:

- profile and identity primitives serve real Fog, engine, or research workflows
- new platform features do not weaken the link-based play loop
- moderation/fairness obligations are understood before adding public scale

## Decision-Leverage Order

When planning beyond current builder work, answer these in order:

1. Product stage definition: what user-visible stage are we advancing?
2. Identity/profile model: whose activity or artifact must persist publicly?
3. Fairness/transparency contract: what must be inspectable or reproducible?
4. Research/engine product model: what external builders need next?
5. Replay/review model: what makes a Fog game understandable after it ends?
6. Backlog graduation: what moves active only after the above are clear?

## Stage Guardrails

- Do not let general chess-platform parity imply broad platform parity.
- Do not add public social/rating/matchmaking obligations before live Fog play is stable.
- Do not treat engine research as private-only infrastructure; it is a core Mistboard differentiator.
- Do not publish benchmark claims without enough metadata to evaluate them.
- Do not compromise hidden-information correctness for UX convenience.

# Mistboard Project Scope

Mistboard is an open-source site for Fog of War chess.

The public project scope is narrow:

> Make Fog of War chess playable, reviewable, and understandable from a link.

This document is intentionally collaborator-facing. Internal operating plans are kept outside the public repository.

## Hard Deferrals

Do not build in v1:

- ratings
- public matchmaking
- chat
- moderation tooling
- OAuth
- billing
- broad general chess-platform features
- standalone non-Fog variants as primary product surfaces

## Useful Public Docs

- `README.md` — overview, local development, and deployment shape.
- `docs/ROADMAP.md` — current milestones and M1 pre-distribution gates.
- `docs/community-and-publishing.md` — articles, research publishing, SEO, and deferred forum/community scope.
- `CONTRIBUTING.md` — contribution process.
- `SECURITY.md` — hidden-information security boundary and reports.
- `docs/fog-of-war/rulesets.md` — Fog of War rules notes.
- `docs/identity-and-profiles.md` — identity, authority, ownership, and future profile model.
- `docs/rules.md` — current rule behavior.
- `docs/milestones.md` — historical implementation milestones.
- `docs/product-stage-definition.md` — product stages and decision-leverage order.
- `docs/chess-platform-reference.md` — mature chess-platform reference and Mistboard/Fog translation.
- `docs/research-engine-product-model.md` — engine, benchmark, corpus, and research product surfaces.
- `docs/replay-review-product-model.md` — Fog replay/review semantics and product boundaries.
- `docs/tournament-track.md` — staged path from engine events to later PvP tournaments.
- `docs/documentation-policy.md` — public/private documentation policy.

## Decision Rule

When evaluating new work:

> Does this help two people play, finish, review, or understand Fog of War from a link?

If not, defer it unless it clearly supports implementation, correctness, documentation, or contributor readiness.

# Bichess Project Scope

Bichess is an open-source site for Fog of War chess.

The public project scope is narrow:

> Make Fog of War chess playable, reviewable, and understandable from a link.

This document is intentionally collaborator-facing. Internal operating plans are kept outside the public repository.

## Project Principles

- **Fog first.** Other variants are only useful if they strengthen the Fog of War experience.
- **Server-authoritative hidden information.** A fog overlay over full client state is not acceptable.
- **Link-based v1.** Anonymous rooms and shareable links come before accounts, ratings, matchmaking, or tournaments.
- **Replay and reveal matter.** The game should be understandable after it ends.
- **Contributor-safe public docs.** Public documentation should explain the project, not expose internal operating plans.

## Hard Deferrals

Do not build in v1:

- ratings
- public matchmaking
- chat
- moderation tooling
- OAuth
- billing
- broad lichess-style platform features
- standalone non-Fog variants as primary product surfaces

## Useful Public Docs

- `README.md` — overview, local development, and deployment shape.
- `CONTRIBUTING.md` — contribution process.
- `SECURITY.md` — hidden-information security boundary and reports.
- `docs/fog-of-war/rulesets.md` — Fog of War rules notes.
- `docs/identity-and-profiles.md` — identity, authority, ownership, and future profile model.
- `docs/rules.md` — current rule behavior.
- `docs/milestones.md` — public implementation milestones.
- `docs/product-stage-definition.md` — product stages and decision-leverage order.
- `docs/product-reference-lichess.md` — mature chess-platform reference and Bichess/Fog translation.
- `docs/documentation-policy.md` — public/private documentation policy.

## Decision Rule

When evaluating new work:

> Does this help two people play, finish, review, or understand Fog of War from a link?

If not, defer it unless it clearly supports implementation, correctness, documentation, or contributor readiness.

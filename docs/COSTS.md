# Costs

_Last updated: 2026-05-12 · status: bill of materials, numbers pending first review_

## Monthly run rate

| Category | Provider | Account / project | Monthly | Notes |
|---|---|---|---:|---|
| Hosting — web + game server | Vercel | mistboard | $— | Next.js + Node server functions |
| Database | Postgres (Neon / Vercel Postgres / TBD) | mistboard | $— | Games, ratings |
| Domain | TBD | mistboard.com (annualized) | $— | |
| **Total** | | | **$—** | |

## Per-unit economics

- Cost per active player largely driven by function invocations (per move) + DB writes.
- No LLM cost surface — pure game engine.

## Recent history

| Month | Hosting | DB | Total | Notes |
|---|---:|---:|---:|---|
| 2026-05 | $— | $— | $— | Private alpha posture |

## Notes

- Kill gate is engagement (<5 unique non-Brian players completing a full game within 4 weeks), not cost.
- Move volume is the cost lever; postgame reveal logic shouldn't add meaningful read load.

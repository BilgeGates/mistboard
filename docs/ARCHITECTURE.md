# Architecture

_Last updated: 2026-05-12_

## One-line shape

Full-stack hidden-information chess platform — Next.js web client + Node.js server-authoritative game engine + Postgres, deployed to Vercel at mistboard.com.

## Components

- **Web client** — Next.js (App Router)
- **Game server** — Node.js, server-authoritative game state
- **Database** — Postgres (game history, ratings)
- **Tournament / ranking** — in-app rating system

## Data flow

1. Client connects via Next.js; server enforces hidden-info view per player.
2. Moves submitted to server; state validated and persisted.
3. Postgres holds completed games + rating history.
4. Postgame reveal renders full board state from server-stored truth.

## External dependencies

- Vercel (hosting)
- Postgres provider (Neon / Supabase / Vercel Postgres)
- Domain: mistboard.com

## Notable choices

- Server-authoritative is non-negotiable — hidden-info correctness depends on it.
- FOW-only + Draft960 pregame; no variant-lab expansion until private-alpha kill gate clears.

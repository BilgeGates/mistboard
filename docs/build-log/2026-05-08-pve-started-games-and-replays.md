# 2026-05-08 - PvE started games and replay surfacing

## Summary

PvE games now get a durable `games` row when the room starts, not only when the
game ends. Public-facing PvE completions also appear in the recent public game
feed when their visibility allows it.

## What Changed

- Added `recordGameStart` for durable running game rows.
- Server room creation now records the start of persisted PvP/PvE rooms.
- Recent public game listing now includes:
  - public PvP games;
  - non-private PvE games;
  - EvE games.
- Added DB-backed coverage for started game persistence and recent public game
  filtering.

## Why It Matters

The replay and review surfaces need a canonical game row before completion.
Persisting game start makes active or recently completed PvE sessions easier to
find, inspect, and later connect to review workflows without inventing a
separate replay store.

## Validation

Covered by Postgres-backed persistence tests:

- `recordGameStart creates a durable running game row`
- `listRecentPublicGames returns public games, public-facing PvE games, and EvE games only`

## Caveats

- This is a persistence/replay surfacing step, not the full public game browser.
- Private PvE games remain excluded from the public recent-game feed.

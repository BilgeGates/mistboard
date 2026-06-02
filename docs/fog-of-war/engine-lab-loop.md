# Engine Lab Loop

> **Moved.** The engine's local learning loop — bake-off runners, belief
> snapshots, annotation queues, replay gates, and the named failure classes —
> lives in the private **`mistboard-engine`** sibling repo, not here. This
> public repo holds only the engine *boundary* and the engine-vs-engine
> orchestration around it. The walkthrough that used to live here referenced
> Python tooling (`bake_off.py`, `annotation_replay.py`, `review_queue.py`,
> `belief_hardfact_check.py`) and private capture/inventory paths that are no
> longer part of this repository.

## What stays public here

The one durable, contributor-facing invariant the lab loop enforces:

> A Fog of War engine consumes only the same legal `PlayerView` available to the
> side it plays, and any belief state it maintains must never contradict the
> hard facts in that observation stream.

Belief snapshots that show an impossible own piece, miss a visible opponent
piece, or ignore an own-capture observation are blocking defects, not normal
engine-quality misses.

## Where the public engine surfaces are

- **Protocol contract:** [`docs/engine-protocol.md`](../engine-protocol.md) —
  the redacted `EngineTurnRequest` / `EngineTurnResponse` boundary every engine
  (first-party or third-party) speaks through.
- **Engine-vs-engine orchestration:** [`engine-experiments.md`](engine-experiments.md)
  — the EvE jobs, queues, tournaments, and Elo reporting that DO live in this
  repo (`apps/server/src/engine-*`, `npm run engine:*`).
- **Public engine records:** the engine tracker (`/engines` roster,
  `/engine/:id` profile) sourced from persisted `game_participants`.

The detailed engine internals and their development loop are documented inside
the `mistboard-engine` repo.

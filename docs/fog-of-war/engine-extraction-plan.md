# Engine Extraction Plan

> **Status (2026-05-25):** executed. The engine lives in the private
> `mistboard-engine` sibling repo. The protocol contract is
> `packages/game/src/engine-protocol.ts`, verified by
> `apps/server/src/engine-protocol/build.test.ts`. This document is retained
> as the original public/private boundary design; provider wiring belongs in
> private operator notes.

This plan documents the public/private boundary for Mistboard's engine work.
The goal is to keep Mistboard trustworthy as an open-source hidden-information
games platform while letting the first-party dark-chess engine compound as a
private first-party implementation.

## Decision

Mistboard's public repo owns the platform, rules, visibility model, replay
model, engine protocol, baseline engines, and benchmark methods.

Mistboard's first-party engine may be developed in a private sibling repo. It
must compete through the same public information boundary as every other engine.

## Public Repo Responsibilities

- `packages/game`: authoritative rules, visibility, legal moves, `PlayerView`,
  and replay helpers.
- `apps/server`: room lifecycle, clocks, persistence, public engine adapter,
  worker queue, fallback behavior, and engine payload redaction.
- `apps/server/src/engines/builtin`: simple public baseline engines for local
  development, smoke tests, and protocol examples.
- `docs/fog-of-war`: public engine protocol, redaction guarantees, benchmark
  methods, and contributor-facing research references.

The public repo may expose enough benchmark data and engine metadata to let
contributors reproduce platform behavior. It should not expose private model
weights, training pipelines, tuning data, or first-party search implementation.

## Private Engine Repo Responsibilities

The private engine repo should be a sibling checkout, not a subdirectory,
submodule, subtree, or vendored package inside this repo:

```text
~/projects/mistboard
~/projects/mistboard-engine
```

It owns:

- first-party engine source;
- model weights and generated training artifacts;
- self-play, tuning, bakeoff, and evaluation pipelines;
- private diagnostics, annotation loops, and research notes;
- production engine packaging.

The public server must not import private engine source directly. It should
communicate with the engine through a documented process or service protocol.

## Target Protocol Boundary

The server should send an engine only information that is legal for the side to
know:

- protocol version;
- room/game id;
- engine id;
- color to move;
- ply;
- deterministic seed;
- clock fields;
- current `PlayerView`-equivalent board, visible squares, legal moves, status,
  and last move;
- redacted observation transcript or latest observation delta.

The server must not send:

- canonical `GameState`;
- raw full `GameEvent[]`;
- hidden opponent pieces;
- hidden opponent move origin/destination;
- truth-board replay data;
- private admin/debug fields.

For live performance, the preferred engine runtime is stateful per game. The
server sends an initial redacted transcript, then only observation deltas. If an
engine worker restarts, the server can replay the redacted transcript to rebuild
engine state. This keeps the trust boundary strict without making move selection
depend on expensive full-history replay on every turn.

## Extraction Phases

### Phase 1: Reposition Public Docs

Replace "strongest open-source engine" language with the durable split:
open-source platform, public engine protocol, public baselines, and private
first-party engine.

Public copy should say that the first-party engine plays through the same
auditable information boundary as every other engine.

### Phase 2: Add Public Protocol Types

Create protocol request/response types around `PlayerView` and redacted
observations. The TypeScript engine context should stop passing canonical
`GameState` and raw full `GameEvent[]` to external engines.

Builtin baseline engines may remain in-process, but anything representing a
serious first-party engine should use the protocol adapter.

### Phase 3: Add Redaction Regression Tests

Add tests that prove engine payloads never contain hidden truth:

- no hidden opponent pieces in the request;
- no raw hidden opponent move origin/destination;
- no canonical board or full event history;
- legal moves are present and server-validated;
- restart replay uses the redacted observation transcript only.

These tests are the public trust anchor for private-engine integration.

### Phase 4: Replace Specific Tier-1 Registrations

Remove public registry entries that name private engine versions, pins, config
hashes, or research labels. Replace them with a generic external first-party
engine adapter, for example `first-party-engine` or an environment-configured
engine command.

The public registry should know how to launch or contact a protocol-compliant
engine. It should not know how the private engine thinks.

### Phase 5: Move The Python Lab

Move `research/python-fow-lab` to the private sibling repo once the public
adapter can call a protocol-compliant engine without importing lab code.

Leave behind only public-safe examples, baseline engines, fixtures, and protocol
documentation. If benchmark fixtures are needed, they should be reviewed for
hidden truth and committed as intentional public artifacts.

### Phase 6: Decide On History

Removing files from `main` stops future exposure. It does not remove old copies
from forks, local clones, package caches, or indexed history.

Only rewrite public git history if the repo still has low external dependence
and the coordination cost is acceptable. Treat history rewrite as a separate
repository-management decision, not part of the default extraction.

### Phase 7: Open Engine Ecosystem

After the first-party adapter is stable, expose the same protocol to third-party
engines. The long-term public surface is an engine ecosystem:

- public protocol;
- baseline examples;
- reproducible benchmark harness;
- engine-vs-engine queue;
- public leaderboard;
- first-party engine as the benchmark opponent.

## Non-Goals

- Do not weaken the server-authoritative game model.
- Do not make the private engine a trusted exception to `PlayerView` redaction.
- Do not require contributors to have private repo access to run Mistboard.
- Do not document private deployment topology, credentials, or operational
  checklists in the public repo.

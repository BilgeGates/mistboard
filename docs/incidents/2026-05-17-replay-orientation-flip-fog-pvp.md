# Board orientation flips to white during live fog PvP replay navigation

**Date:** 2026-05-17
**Status:** resolved
**Severity:** sev3 (wrong board display during replay navigation; game itself unaffected)

---

## What happened

During a live fog-of-war PvP game, pressing the left-arrow key to navigate backward through
replay history caused the board to display from white's orientation (white at bottom) even when
the player was seated as black. The event counter in the replay bar updated correctly — the
position counter showed the right event number — but the board's visual flip persisted for
every historical position navigated to.

---

## Investigation

### Entry point: orientation assignment in `render()`

Board orientation is a module-scope `let orientation: Color = 'white'` in `live-render.ts`.
It is updated on every call to `render()`:

```typescript
const nextOrientation = view?.perspective ?? (liveState.seat === 'black' ? 'black' : 'white');
orientation = nextOrientation;
```

`orientation` is then passed into the Chessground config. Chessground toggles orientation when
`config.orientation !== state.orientation`, so an incorrect value here produces a board flip.

The fallback (`liveState.seat === 'black' ? 'black' : 'white'`) is correct when `view` is null.
But `view` is almost never null during an active game, so the primary source is `view?.perspective`.

### `view` source for fog PvP replay

`view` comes from `currentView()`. During live fog PvP in replay mode (replayIndex !== null):

```typescript
if (!isLive() && replayIndex !== null && isFogLivePvp()) {
  return fogViewHistory.get(replayIndex) ?? liveState.state;
}
```

`fogViewHistory` is a `Map<number, PlayerView>` keyed by `liveState.events.length` at capture
time. It is populated by `captureFogView()`, called at the top of every `render()`:

```typescript
function captureFogView(): void {
  if (!isFogLivePvp() || !liveState.state) return;
  if (liveState.events.length <= lastCapturedEventCount) return;
  fogViewHistory.set(liveState.events.length, liveState.state);
  lastCapturedEventCount = liveState.events.length;
}
```

So `fogViewHistory.get(K)` = whatever `liveState.state` was when events.length was `K`.

### Why fog history skips white's moves

In fog PvP, the server sends fog-filtered events to each player:

```typescript
// payloads.ts — eventsVisibleByMode
return room.events.filter((event) => event.type !== 'move-played' || event.color === client.seat);
```

Black's `liveState.events` only contains black's own move events (plus non-move events like
`room-created`). When white moves, the server sends a snapshot with `state` updated to reflect
the new position but `events` unchanged (same length). Because `events.length` does not increase,
`captureFogView` skips that render:

```
liveState.events.length <= lastCapturedEventCount → return early
```

Result: `fogViewHistory` accumulates one entry per player move + room events. History entries
only capture "just after my own move" positions, which is the correct fog replay semantics.

### The `perspective` field in captured views

Each `fogViewHistory` entry is a `PlayerView` received from the server. The server computes it
via `getClientView(room, client)`:

```typescript
const perspective = client.seat === 'black' ? 'black' : 'white';
const view = variant.getPlayerView(room.projection.state, perspective);
```

For a black player with `client.seat = 'black'`, the resulting view always has `perspective: 'black'`.
The board should therefore never flip. This is where the server-side code is correct.

### Identified attack surfaces

The investigation traced every code path that could produce `view.perspective === 'white'` for
a black player. Static analysis found no direct logical bug in the normal connection flow.
However, two structural gaps were identified:

**Gap 1 — `isFogLivePvp()` did not exclude spectators:**

```typescript
function isFogLivePvp(): boolean {
  return liveState.roomMode === 'pvp'
    && liveState.state?.variant === 'fog-of-war'
    && liveState.state?.status.type !== 'finished';
  // ← no check on liveState.seat
}
```

Spectators watching a live fog PvP game satisfy this predicate. For spectators, the server
sends a public fog view via `publicFogView()`:

```typescript
// perspective = client.seat === 'black' ? 'black' : 'white'
// client.seat = 'spectator' → perspective = 'white'
return {
  ...,
  board: {},
  visibleSquares: [],
  perspective,   // ← 'white'
};
```

If a player briefly lost their seat during a session — seat token expiry, reconnect race, or
navigating away and back — and reconnected as a spectator before re-claiming their seat,
`captureFogView()` would run during that window (since `isFogLivePvp()` was still true) and
write spectator views with `perspective: 'white'` into `fogViewHistory`. Those entries
persist in the map for the remainder of the session.

**Gap 2 — orientation was derived from `view.perspective` rather than the player's seat:**

Because orientation was taken from the view (`view?.perspective`), any incorrectly-perspectived
view in the fog history — regardless of source — would flip the board.

For actual players the correct source is `liveState.seat`, which the server controls via the
authenticated `hello`/`snapshot` seat field. Using the seat directly short-circuits any
view-level perspective error.

### Hypothesis for observed symptom

A player connected, played some moves (fog history populated with `perspective: 'black'`),
experienced a seat disruption (reconnect without page reload, seat token not sent, or
rate-limit close), briefly appeared as spectator, during which one or more `captureFogView`
calls wrote `perspective: 'white'` entries at new event-length keys. On reconnect as player,
subsequent moves added correct entries, but the corrupted keys remained in the map.

When the player navigated backward via arrow keys, `replayHistoryIndexes()` returned all
`fogViewHistory.keys()` (including the corrupted ones). On reaching a corrupted key,
`fogViewHistory.get(replayIndex).perspective === 'white'`, causing orientation to flip and
persist for all subsequent navigation steps (because each subsequent key also had `'white'`
if captured during the spectator window, or the board was already flipped so the mismatch
kept triggering toggles on keys that were otherwise `'black'`).

### Why the event counter was correct

`replayMetaLabel()` shows `currentReplayIndex() = replayIndex`, which is set by
`applyReplayControl()` from `replayHistoryIndexes()`. This is independent of the view's
`perspective` field. The counter correctly reported the key, even when the view at that key
had a wrong perspective.

---

## Fix

Two changes in `apps/web/src/live-render.ts`.

### Fix 1 — Anchor orientation to player seat, not view perspective

**Before:**
```typescript
const nextOrientation = view?.perspective ?? (liveState.seat === 'black' ? 'black' : 'white');
```

**After:**
```typescript
// For seated players, lock orientation to their own seat regardless of what
// the view's perspective field says — fog history views can carry a stale or
// mismatched perspective if the server state was captured before the seat was
// confirmed. Spectators fall back to the view's perspective.
const nextOrientation = isColor(liveState.seat) ? liveState.seat : (view?.perspective ?? 'white');
```

For `liveState.seat ∈ { 'white', 'black' }` (i.e., `isColor()` returns true), orientation is
always `liveState.seat`. This value is controlled by the server's authenticated seat assignment
and cannot be corrupted by view-level perspective mismatches. Spectators retain the old
behaviour (orientation from view perspective, which the server sets to 'white' for the
public fog view).

### Fix 2 — Exclude spectators from the fog PvP path

**Before:**
```typescript
function isFogLivePvp(): boolean {
  return liveState.roomMode === 'pvp'
    && liveState.state?.variant === 'fog-of-war'
    && liveState.state?.status.type !== 'finished';
}
```

**After:**
```typescript
function isFogLivePvp(): boolean {
  return liveState.roomMode === 'pvp'
    && isColor(liveState.seat)
    && liveState.state?.variant === 'fog-of-war'
    && liveState.state?.status.type !== 'finished';
}
```

`isColor(liveState.seat)` returns true only for `'white'` and `'black'`, not `'spectator'`.
Adding this check prevents `captureFogView()`, `replayHistoryIndexes()`, and the fog path in
`currentView()` from activating when the client is briefly in spectator state. This closes the
contamination window: no spectator views (perspective: 'white') are ever written into
`fogViewHistory` for a player session.

---

## Side-effects and correctness review

**Spectator replay of fog PvP (active game):** Spectators of a live fog PvP game receive
only non-move events (`room-created`, etc.) from the server — moves are fog-filtered. With
`isFogLivePvp() = false` for spectators, `replayHistoryIndexes()` uses the event-based path,
which produces a history of [1] (just room-created). This is correct: spectators cannot see
individual move history during a live fog game, and the replay controls will be nearly
disabled. The board shows the public fog view (empty board, 'white' orientation) which is
unchanged from before.

**Fog PvE (human vs engine):** `liveState.roomMode === 'pve'`, so `isFogLivePvp()` was
and remains false. No change.

**Non-fog PvP (bid-for-white, standard):** Variant is not `fog-of-war`, so `isFogLivePvp()`
was and remains false. No change.

**Postgame fog review:** `liveState.state.status.type === 'finished'`, so `isFogLivePvp()` was
and remains false after the game ends. No change.

**Fix 1 for spectators watching a finished game (replay page):** Spectators view the replay
page at `/game/{id}`, which is served by `replay.ts`, not `live.ts`. Fix 1 only touches
`live-render.ts`. Not affected.

---

## What was not found

The investigation did not find a code path in the normal session lifecycle that would produce
`fogViewHistory` contamination absent a seat disruption. The gap is structural (spectators not
excluded), not a logic error in the happy path. Fix 1 makes orientation immune to any such
contamination regardless of cause; Fix 2 closes the specific structural gap.

---

## Files changed

- `apps/web/src/live-render.ts` — two edits as described above

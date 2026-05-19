# Landing hero flashes the three-board triptych before collapsing to single POV

**Date:** 2026-05-18
**Status:** resolved
**Severity:** sev3 (cosmetic; landing-page-only; no functional impact)

---

## What happened

On a cold load of the homepage, the replay region rendered the full three-board
triptych (white view | truth | black view) for one frame before snapping to the
single-POV hero layout the landing was redesigned to show. The flash was
consistent — visible on every fresh navigation to `/`, not a race that
sometimes lost.

The hero had been intentionally narrowed to one player's POV in the 2026-05-18
landing reshape ([[landing_reshape_2026_05_18]]) via the `panes` resolver
option on `mountReplay`. The flash is the resolver firing one tick too late.

---

## Investigation

### Mount sequence in `replay.ts → mountReplay`

```ts
const whitePane = createPane(...);
const truthPane = createPane('Truth', 'truth');
const blackPane = createPane(...);
layout.append(whitePane.el, truthPane.el, blackPane.el);
root.append(layout);   // ← layout is now in the DOM, with no single-pov class

// ... lots of synchronous DOM building ...

await loadGame(initialSampleId);  // ← async: fetches the events file
//   inside loadGame: events = await loaderForId(sampleId)
//   then: applyMetadata()  ← THIS is where the single-pov layout class is added
```

The pane-selecting class (`replay-layout-single-white` /
`replay-layout-single-black`) is applied inside `applyMetadata()`, but
`applyMetadata()` is only called from `loadGame()` *after* `await loaderForId(sampleId)`.
That `await` is a yield point — the browser gets a chance to paint between
`root.append(layout)` (all three panes visible) and the resolver's class
landing on `layout`.

### Why this looked like a triptych

The default CSS for `.replay-layout` (no single-* modifier) shows all three
panes side-by-side. So during the gap between mount and the first
`applyMetadata()`, the layout *is* the original review triptych. The single-POV
narrowing is purely a CSS toggle — the other two panes still exist in the DOM,
they're just hidden by `.replay-layout-single-* > .replay-pane-{other}` rules.

### Why other replay routes don't show this

The bakeoff, articles, and watch routes don't pass a `panes` resolver — they
*want* the full triptych. Only the landing hero opts into single-POV, so only
the landing hero needs the class set before first paint. The bug had been
latent on the landing path since the reshape shipped.

---

## Fix

`apps/web/src/replay.ts`, immediately after `layout.append(...)`:

```ts
// Apply the pane choice synchronously so the triptych doesn't flash before
// loadGame() finishes its async fetch and calls applyMetadata().
if (panesResolver) {
  const initialMeta = metadataByRoomId?.[initialSampleId];
  const initialChoice = panesResolver(initialSampleId, initialMeta);
  layout.classList.add(
    initialChoice === 'white'
      ? 'replay-layout-single-white'
      : initialChoice === 'black'
        ? 'replay-layout-single-black'
        : 'replay-layout-all',
  );
}
root.append(layout);
```

The resolver is synchronous and depends only on `sampleId` (+ optional meta,
which the caller passes in `metadataByRoomId` at mount time). Both are
available before the `await loaderForId(...)` happens, so we can pick the
correct class immediately. `applyMetadata()` still re-applies it once events
load, which is idempotent.

---

## Side-effects and correctness review

- **Routes without a `panes` resolver** (bakeoff, articles, watch): skipped
  entirely (`if (panesResolver)`). No behavior change.
- **Routes with the resolver** (landing only): pick the same class earlier in
  the timeline. `applyMetadata()` will pick the same class again on a stable
  meta map, so no flicker on metadata-load.
- **Loop transitions** between landing hero games: when a new game loads,
  `loadGame()` runs and `applyMetadata()` re-applies the class for the new
  sample. No regression.

---

## Files changed

- `apps/web/src/replay.ts` — synchronous initial application of the panes
  resolver immediately after layout construction.

# A render that picks its final shape post-await will paint its default shape first

**Date:** 2026-05-18
**Related incident:** `incidents/2026-05-18-landing-hero-triptych-flash.md`

## The shape

If a component:

1. Appends its full DOM to the page synchronously, and
2. Awaits something (a fetch, an import, anything that yields to the event loop), and
3. *Then* applies a class that hides parts of that DOM (or otherwise narrows what's visible),

…the browser is allowed to paint between steps 1 and 3. The user sees the pre-narrowed shape for one frame before the narrowing class lands.

This is the same root cause as the [[feedback_reserve_layout_space]] rule, mirrored: that rule is "reserve the *footprint* of an async-rendered element so its arrival doesn't jolt the layout." This rule is its dual — "reserve the *shape-narrowing class* of a synchronously-mounted element so its arrival doesn't *un*-jolt visible content."

In both cases the failure mode is: an async boundary sits between two pieces of state that need to be consistent at first paint. The browser gets to paint the inconsistent intermediate.

## What it looks like in practice

The triptych flash on `/` was the textbook version:

- `mountReplay` builds white-pane + truth-pane + black-pane and appends them.
- The "show only one pane" CSS class lives on the parent layout. It's added inside `applyMetadata()`.
- `applyMetadata()` is only called after `await loaderForId(sampleId)` in `loadGame()`.
- For the duration of that fetch, the layout is in the DOM with default styling — i.e., the full three-board triptych.
- On a fresh load the fetch takes long enough for one paint to slip through.

The fix is to apply the narrowing class synchronously at mount, before the await — using whatever inputs are available at that point (the initial sample id, the metadata map the caller passed in, etc.). The post-await call still runs and overwrites, but that's idempotent.

## The general rule

When you have an async mount path that ends in "and then we apply a class that changes how the already-mounted DOM is shown" — flip the order. Apply (your best guess at) that class synchronously, *then* await. The post-await pass reconciles it.

For replay-like components specifically: the resolver/picker functions are usually pure functions of immediately-available inputs (the sample id, the caller-provided metadata map). There's no reason to wait for the network round-trip to call them.

## What to watch for

- Any `mountX` function that takes a resolver/picker as an option and applies its result post-await. Audit each one for whether the inputs are available pre-await.
- Any component that has both a "default" rendering and a "narrowed" rendering controlled by a parent-level class. The default will leak through if the class isn't on at first paint.
- DOM that exists in the tree but is hidden by parent CSS is a candidate for this bug — the parent CSS won't apply until its class is set, but the children paint regardless.

## What to *not* do

Don't fix this by hiding the entire layout until the resolver runs. That trades a triptych flash for a blank flash. The fix is to pre-apply the narrowing class, not to delay the mount.

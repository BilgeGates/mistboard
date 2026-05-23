# Background server timers must `.unref()` or unit tests can't drain the loop

**Date:** 2026-05-23

## The shape

`apps/server` ran `test:unit` in **61 seconds**. The tests themselves finished in **215ms**. The remaining ~60s was the node:test runner waiting for the event loop to drain after the last test resolved.

Cause: `room-manager.ts:scheduleClockTimeout` arms a `setTimeout` for the active color's full remaining clock time. The test fixtures use `createClock(1000, 60_000, 0)` — 60s of clock budget — so every `playMove` test that flipped the active color left a 60s timer dangling. The runner waited it out before exiting.

The "exactly 60s on every run" smell was the giveaway. Default node:test timeout is `Infinity`, and the engine fallback paths use 3-30s budgets, none of which match. The only thing in the codebase set to literally 60_000ms was the test-fixture clock.

## Data points

| Surface | Before | After |
|---|---|---|
| `npm run test:unit` (server) | 61.3s | 1.2s |
| `npm test` (server, tsc + node --test dist) | 61.5s | 2.0s |
| `room-manager.test.ts` alone | 60.6s | 0.6s |

132 pass / 2 skip, identical before and after.

## The fix

Two `.unref()` calls in `room-manager.ts` — one on `clockTimer`, one on `engineTimer`:

```ts
room.clockTimer = setTimeout(() => { /* ... */ }, delay + 25);
room.clockTimer.unref();

room.engineTimer = setTimeout(() => { /* ... */ }, 0);
room.engineTimer.unref();
```

This is a production correctness improvement that happens to also fix tests. In prod the loop is held open by the WebSocket server and the Postgres pool; auxiliary "fire later if the game's still going" timers should not be the thing keeping the process alive. In tests, with no servers running, `.unref()` lets the loop drain immediately after assertions finish.

## The general rule

A long-lived server has real handles that keep the event loop alive (listening sockets, DB pools, the HTTP server). Anything *else* that arms a timer — speculative "fire later" callbacks scheduled from request handlers — should `.unref()` unless that timer firing is the only thing the process exists to do.

Symptoms to recognize:

- **A test file's wall time greatly exceeds the sum of its per-test durations.** node:test reports per-test ms and a total `duration_ms`; if total ≫ sum, something is keeping the loop alive after the last assertion.
- **The hang is a suspiciously round number** (60s, 30s, etc.) — that's almost always a `setTimeout` armed for exactly that long, not a runner timeout (which is usually `Infinity`).
- **`--test-force-exit` makes it disappear.** That confirms the diagnosis but is not the fix — it masks the leak.

## What to *not* do

- Don't reach for `--test-force-exit` first. It hides this class of bug for every future contributor instead of fixing it.
- Don't add `afterEach` cleanup in tests to clear the timers. The production code is the thing that's wrong (long-lived servers shouldn't be held open by speculative timers); the test pain is the signal.
- Don't conflate "I have a leak" with "I need a longer test timeout." The tests pass — they pass instantly. The runner just won't exit.

## What to watch for

- Any `setTimeout` in server code where the delay is a function of user input (`clockRemainingMs`, request budgets, retry backoffs). These are the candidates for `.unref()`.
- Any handler that arms a timer and stores the handle for later `clearTimeout`. If the cancel path can be skipped (game ends in an unusual way, request aborts, server shuts down mid-arm), the timer outlives its purpose.
- Conversely, do *not* `.unref()` the timers that are the reason the process exists (e.g., the periodic observability `setInterval` in `obs.ts` that's load-bearing for a worker-only process). Use judgment per-timer; the rule is "speculative auxiliary," not "all timers."

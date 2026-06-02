# An edge 502 means the platform couldn't reach your app; an app 503 means it could

**Date:** 2026-06-01
**Trigger:** [Railway us-west2 edge blip](../incidents/2026-06-01-railway-edge-502-blip.md)

## The rule

When a monitor says DOWN, the **status code plus the timing shape** tells you where the failure is before you read any code:

- **`502` with a fixed, round timeout (e.g. ~15,000 ms):** the platform's edge proxy accepted the request but couldn't get a response from your container, and gave up at its upstream timeout. The app was never reached — this is a routing/reachability problem (platform host, edge, container scheduling), not your code.
- **`503` (fast):** your app *was* reached and is reporting itself unhealthy — for mistboard, that's the DB-coupled `/health` returning a real "Postgres unreachable." This one is yours to act on (or at least to confirm against the DB).
- **`404 "Application not found"`:** the edge has no route to the app at all — a harder platform failure (see [2026-05-19](../incidents/2026-05-19-railway-platform-outage.md)).

Don't lump all 5xx together. `502`-at-a-fixed-ceiling and `503`-fast point at opposite halves of the stack.

## Simultaneity is a free root-cause shortcut

Two independent services — different repos, different runtimes, one behind Cloudflare and one not — failed at the **same timestamps with byte-identical signatures** (`502 @ 15001ms`, four probes each). That is not a coincidence either app can produce; it can only come from something they share. Here the shared layer was the Railway **region (us-west2)**.

So before diagnosing per-service: ask *what else is down right now?* If a second, unrelated service is failing in lockstep, stop looking at application code and look at the shared dependency (region, edge, DNS, a common upstream). One cross-check collapses the search space immediately.

## How to apply

- On a DOWN alert, pull the platform HTTP logs and read the **code + latency** of the failing requests, not just "it's 5xx."
  - `502` pinned at a round number → edge/upstream reachability. Don't read app code; check the platform.
  - Fast `503` → the app is reporting unhealthy; trust it and check the dependency it's complaining about.
- Check whether **other services in the same region/account are failing at the same instant.** Lockstep failures = shared infra; isolated failure = that service.
- A localized regional blip will usually **not** appear on the platform status page (those only post widespread incidents). Absence of a posted incident is not evidence the platform was fine.
- If it self-recovered in a couple of minutes and the signature was an edge `502`, the correct response is often **nothing** — don't redeploy or restart a single-replica service to "fix" a platform blip that's already over.

## Anti-rule

Don't treat a high p99 (here 15,001 ms) as "the app got slow." A response time that lands exactly on a round timeout is the *infrastructure giving up*, not your code taking that long — the app served its real requests in single-digit milliseconds the whole time.

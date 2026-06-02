# Railway us-west2 edge blip — mistboard.com and windowintochina.com 502 for ~90s

**Date:** 2026-06-01
**Status:** resolved (upstream, self-recovered)
**Severity:** sev2 (brief user-visible outage — both sites returned 502 for ~90s, auto-recovered; low traffic so minimal real-user impact)

## What happened

UptimeRobot flagged **both** `mistboard.com/health` and `windowintochina.com/health` as DOWN. The two are independent services in different repos with different runtimes (mistboard is a Node WS server behind Cloudflare → Railway; windowintochina is Next.js on Railway's edge directly), so a simultaneous failure was the first clue that the cause was shared infrastructure, not either app.

Railway HTTP logs showed an identical failure signature on both, at the same timestamps:

```
mistboard               windowintochina
07:40:01 HEAD /health 502 15001ms   07:40:01 HEAD /health 502 15001ms
07:40:32 HEAD /health 502 15001ms   07:40:31 HEAD /health 502 15000ms
07:41:03 HEAD /health 502 15001ms   07:40:59 HEAD /health 502 15001ms
07:41:34 HEAD /health 502 15002ms   07:41:30 HEAD /health 502 15004ms
```

Four consecutive `HEAD /health` probes (UptimeRobot defaults to HEAD) returned `502` after a fixed **~15,001 ms** wait. By 07:45 UTC both were back to `GET /health 200` in 3–11 ms and have been healthy since. The whole window was ~90 seconds.

## Root cause

A transient Railway **us-west2** platform/edge event made both single-replica web containers' upstreams briefly unreachable. Railway's edge waited out its upstream timeout (~15 s) and returned `502` to every request during the window, then routing recovered on its own. The fixed 15 s ceiling and the byte-identical timing across two unrelated services are the fingerprints of an edge-to-upstream reachability failure, not app code.

Nothing in either app misbehaved:
- **mistboard:** clean logs, p50 3 ms, 0% error rate outside the blip. Its DB-coupled `/health` (which returns 503 on Postgres trouble — see [stale-pool incident](2026-05-15-stale-pool-connections-smoke-500.md)) never fired; this was a `502` from the *edge*, not a `503` from the app.
- **windowintochina:** memory peaked at 0.31 GB (no OOM), CPU idle, `/health` is a cheap disk-cached read (3–11 ms). The "4.8% error rate" over the sampled window was almost entirely bot-scanner 404s (`/wp-admin/install.php`, `/.env`, `/txets.php`); the only real 5xx were the four blip 502s.

Railway's status page showed no incident — it only posts events with "significant, widespread user impact," and an isolated host/edge blip in one region doesn't qualify (us-west2 sits at ~99.69% over 90 days, i.e. hours of unposted localized downtime).

## Detection

External uptime monitor (UptimeRobot), HEAD `/health` probes on both monitors. Confirmed via Railway HTTP logs (`get_logs log_type=http`), response-time percentiles (windowintochina p99 = 15001 ms, the blip; mistboard p99 = 56 ms), error-rate sampling, and `service_metrics` (no OOM/CPU pressure). Railway status page checked — no posted incident.

## Impact

- Both sites returned `502` for ~90 s. Low traffic at 07:40 UTC, so minimal real-user impact; no active-game disruption observed for mistboard.
- No data loss — no app code or DB writes were involved; the app was never reached.

## Response

None required — self-recovered. Deliberately did **not** redeploy, restart, or change config (same posture as [2026-05-19](2026-05-19-railway-platform-outage.md): platform-side blips resolve faster than human intervention and intervention risks making it worse).

Decisions taken after triage:
- **Replicas stay at 1.** Both web services are single-replica, which is why a single-host event has no redundancy to ride through. Accepted the trade for two early-stage portfolio projects rather than paying for a second replica.
- **`/health` left DB-coupled** — it is deliberate and load-bearing (see 2026-05-15 / 2026-05-19); decoupling it to pure liveness would regress both prior incidents and would not have changed this one.
- **Monitor noise:** the ideal lever (an UptimeRobot down-confirmation threshold of ~3 min, which would absorb sub-2-min blips while still catching real outages) is **paid-only**; declined the upgrade. Posture is to mentally filter "down + recovers within minutes = Railway blip." If the noise ever becomes intolerable, BetterStack's **free** tier has the confirmation window UptimeRobot charges for — a free migration.

## Learnings

See [edge 502 vs app 503, and simultaneity as a shared-infra signal](../learnings/2026-06-01-edge-502-vs-app-503-and-simultaneity.md). Builds on [check the platform status page before debugging app code](../learnings/2026-05-19-check-platform-status-before-debugging-app-code.md).

# Railway platform outage — mistboard.com down for ~minutes

**Date:** 2026-05-19
**Status:** resolved (upstream)
**Severity:** sev1 (user-visible outage — site fully unreachable for a window during the incident)

## What happened

External uptime monitor (BetterStack / similar) alerted at 12:48 UTC: `mistboard.com/health` returning HTTP 503 from the Ashburn, USA probe.

Triage from the local repo:

1. `curl https://mistboard.com/health` → `503 {"ok":false, databaseRequired:true, persistence:"enabled", persistenceErrors:{count1m:0, lastAt:null}}`. Persistence was initialized but `probeDb()` (`SELECT 1`) was failing — so server up, DB unreachable.
2. `curl https://mistboard.com/api/live-stats` → `200 {"playing":0,"online":0}` (no DB hit).
3. `curl https://mistboard.com/api/games/recent?limit=1` → `500 {"error":"internal_error"}` (DB-backed). Confirmed it was the DB connection, not the health probe being overly strict.
4. `railway status` from local CLI → `HTTP 503 Service Unavailable` on Railway's own OAuth refresh endpoint. Railway control plane degraded too.
5. Railway status page (`status.railway.com`) → active incident, status "Identified": *"Access to our upstream cloud provider has been restored and we are working on a fix."*

A few minutes into triage, the failure mode changed:
`curl https://mistboard.com/` → `404 {"status":"error","code":404,"message":"Application not found","request_id":"..."}` — Railway's edge could no longer route to the app at all. Full outage, not just DB-degraded.

### Root cause

Railway platform incident affecting their upstream cloud provider. Cascaded into:
- Postgres unreachable from the `web` container → DB-backed routes 5xx, `/health` correctly reports 503.
- Eventually the app container itself became unreachable from Railway's edge → 404s from the platform router.

Nothing in our code or config changed. The most recent commit (`2d12707 web: hero tagline reshape`) is static markup with no infra surface.

## Detection

External uptime monitor at 12:48 UTC. Email alert reached the owner within ~minute.

The `/health` 503 worked exactly as designed (post-[[../learnings/2026-05-15-stale-pool-connections-smoke-500.md|pool keepAlive fix]]): probeDb failed, ok flipped false, monitor caught it immediately. Without that fix, the monitor would have continued returning 200 against a degraded instance.

## Impact

- Site fully unreachable for a window during Railway's incident.
- No data loss — Postgres was unreachable, not corrupted. Writes that would have happened during the window were rejected at the connection layer, not silently dropped.
- No active games observed in `/api/live-stats` (`playing: 0`) at incident start, so user-facing gameplay disruption was minimal.

## Fix

None on our side. Wait for Railway to resolve upstream.

Deliberately did **not**:
- Redeploy (won't help while Railway's upstream is degraded; risks in-flight state).
- Restart the `web` service from the Railway dashboard (same reason — restart only useful if the issue persists 30+ min after Railway marks the incident resolved).
- Change pool config (already has `keepAlive + idleTimeoutMillis` from the prior incident; this is a different class of failure).

## Learnings

See `docs/learnings/2026-05-19-check-platform-status-before-debugging-app-code.md`.

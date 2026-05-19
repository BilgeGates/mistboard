# When prod is down, check the platform status page before debugging app code

**Date:** 2026-05-19
**Trigger:** [Railway platform outage](../incidents/2026-05-19-railway-platform-outage.md)

## The rule

When a production alert fires, the first ~30 seconds of triage should rule out the platform, not the application. Two cheap checks:

1. **Hit the platform's status page** (`status.railway.com`, `status.vercel.com`, etc.).
2. **Run a platform CLI command** that exercises the control plane (`railway status`, `vercel whoami`). If the control plane is 5xxing too, the issue is almost certainly platform-side.

Either check is faster than reading code or grepping logs, and both eliminate the largest non-application failure category.

## Why this matters more than it seems

Application bugs are the default mental model — most outages we've experienced were our fault (resign termination, stale pool sockets, npm audit). That bias means the first instinct is *"what did we change?"*. When the answer is "nothing relevant," the next instinct is to dig deeper into code rather than widen the search.

In a Railway-hosted setup the platform is on the critical path for: DNS, edge routing, container scheduling, Postgres reachability, and OAuth on the control plane itself. Any one of those failing presents as a *symptom* indistinguishable from an app bug — `503` from the edge, `500` from a DB-backed route, `404` if the container can't be reached. Reading the failure mode alone can't disambiguate.

## How to apply

- On any prod outage alert, before reading any code:
  1. Curl `/health` and one DB-backed and one non-DB endpoint. The split tells you whether the server is up at all and whether DB is the issue.
  2. Hit the platform status page.
  3. Try a platform CLI command. If it 5xxs, the platform is degraded — stop debugging app code.
- If the platform is the root cause: **wait**. Don't redeploy, don't restart, don't twiddle pool configs. Each of those risks making it worse (in-flight state loss, fresh containers hitting the same upstream issue, config drift to investigate later).
- The `/health` endpoint behaving correctly (returning 503 honestly) is itself a signal worth noticing. It means the [[2026-05-15-stale-pool-connections-smoke-500|prior pool/health fix]] is doing its job — the monitor caught a real problem in seconds.

## Anti-rule

Don't skip this check just because the symptom *looks* like a known app bug. The 503 from this incident looked nearly identical to the stale-pool symptom — same `/health` shape, same DB-backed 500s. Pattern-matching to the prior incident would have led to staring at `persistence.ts` for 20 minutes before noticing the status page.

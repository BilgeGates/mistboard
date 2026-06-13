# Incidents

Index of incident records — production failures, outages, data loss, broken pipelines. Each row links to a dated file. Latest first.

An "incident" is anything user-visible or pipeline-blocking that required unplanned response. Pair every resolved incident with a learning entry in `learnings/` if a transferable lesson emerged.

| Date | Title | Status | Severity |
|---|---|---|---|
| 2026-06-13 | [CI red on main from esbuild npm audit — all deploys blocked](2026-06-13-esbuild-audit-blocked-all-deploys.md) | resolved | sev3 |
| 2026-06-01 | [Railway us-west2 edge blip — mistboard + windowintochina 502 ~90s](2026-06-01-railway-edge-502-blip.md) | resolved | sev2 |
| 2026-05-19 | [Railway platform outage — mistboard.com down](2026-05-19-railway-platform-outage.md) | resolved | sev1 |
| 2026-05-18 | [Landing hero flashes triptych before single-POV](2026-05-18-landing-hero-triptych-flash.md) | resolved | sev3 |
| 2026-05-18 | [CI red on main from ws npm audit vulnerability](2026-05-18-ci-npm-audit-ws-vuln.md) | resolved | sev3 |
| 2026-05-15 | [Intermittent prod-smoke 500s from stale pool connections](2026-05-15-stale-pool-connections-smoke-500.md) | resolved | sev3 |
| 2026-05-14 | [Silent recordGameEnd failure on every PvP resign](2026-05-14-resignation-termination-missing.md) | resolved | sev2 |
<!-- | YYYY-MM-DD | [Short title](YYYY-MM-DD-short-title.md) | open | sev2 | -->

<!-- Status: open, mitigated, resolved, closed. Severity: sev1 (user-visible outage), sev2 (degraded), sev3 (internal only). -->

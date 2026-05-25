# Gate Evidence

This directory stores short, public-safe records for manual launch gates.

Create entries with:

```bash
npm run gate:evidence -- --gate mobile-gameplay --result pass
```

Entries should state what was checked, where it was checked, and the command or
manual path used when relevant. Do not include cookies, tokens, seat tokens,
provider secrets, private runbook paths, or `.env` details.

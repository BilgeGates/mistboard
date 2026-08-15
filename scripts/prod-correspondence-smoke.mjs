// Correspondence surface deploy gate (#33): the correspondence HTTP routes must
// EXIST and must GATE correctly for an unauthenticated caller. This is not
// functional coverage; it proves the route registrations and their auth/flag
// gates survived the deploy.
//
// Expected codes are pinned from the route code:
//   - apps/server/src/routes/correspondence-games.ts: account-only, unauthenticated
//     GET -> 401 {"error":"not_signed_in"}; non-GET -> 405.
//   - apps/server/src/routes/correspondence-seeks.ts: every verb is account-only
//     EXCEPT reading the public board, which serves anonymous callers a 200 (see
//     allowsAnonymousAccess). Unauthenticated writes and the per-user lists ->
//     401 {"error":"not_signed_in"}. When the correspondence feature flag is OFF
//     the seeks routes return 404 {"error":"correspondence_disabled"}, so a 404
//     here is a real deploy-config regression (flag lost), not a pass.
//
// The public-board check also asserts no row comes back owned: isMine is a
// viewer-relative field, and an anonymous caller owns nothing, so a true here
// would mean the route leaked one caller's ownership to everybody.
//
// Read-only by design: the only POST bodies are empty and rejected by the auth
// gate before any parsing or writes.

import { resolveBaseUrl } from './lib/base-url.mjs';
import { fetchJson } from './lib/http.mjs';
import { parseSmokeArgs } from './lib/smoke-args.mjs';
import { reportResult } from './lib/smoke-report.mjs';

const DEFAULT_TIMEOUT_MS = 10_000;

const options = parseSmokeArgs(process.argv.slice(2), {
  usage: 'node scripts/prod-correspondence-smoke.mjs [options]',
  description: `Asserts the correspondence routes exist and gate correctly for an
unauthenticated caller (deploy-gate coverage, not functional coverage).`,
  flags: {
    '--base': {
      key: 'baseUrl',
      placeholder: '<url>',
      help: 'Base URL to smoke, default https://mistboard.com',
    },
    '--timeout-ms': {
      key: 'timeoutMs',
      placeholder: '<ms>',
      kind: 'positive-int',
      help: `Timeout per network step, default ${DEFAULT_TIMEOUT_MS}`,
    },
  },
});
const baseUrl = resolveBaseUrl(options.baseUrl);
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

const CHECKS = [
  { method: 'GET', path: '/api/correspondence/games', status: 401, error: 'not_signed_in' },
  {
    method: 'GET',
    path: '/api/correspondence/seeks',
    status: 200,
    expect: (body) =>
      Array.isArray(body?.seeks) && body.seeks.every((seek) => seek?.isMine === false),
    describe: 'a seeks array with no row owned by an anonymous caller',
  },
  {
    method: 'GET',
    path: '/api/correspondence/seeks/incoming',
    status: 401,
    error: 'not_signed_in',
  },
  { method: 'POST', path: '/api/correspondence/seeks', status: 401, error: 'not_signed_in' },
  // Method gate: the games route is GET-only.
  { method: 'POST', path: '/api/correspondence/games', status: 405, error: 'method_not_allowed' },
];

const results = [];
for (const check of CHECKS) {
  const { status, body } = await fetchJson(new URL(check.path, baseUrl), {
    timeoutMs,
    init: {
      method: check.method,
      ...(check.method === 'POST'
        ? { headers: { 'content-type': 'application/json' }, body: '{}' }
        : {}),
    },
  });
  // A gate check pins the error code; a public-read check pins the shape of what
  // came back instead (there is no error to match on a 200).
  const bodyOk = check.expect ? check.expect(body) : body?.error === check.error;
  if (status !== check.status || !bodyOk) {
    const wanted = check.expect ? check.describe : `{"error":"${check.error}"}`;
    throw new Error(
      `${check.method} ${check.path}: expected ${check.status} ${wanted}, got ${status} ${JSON.stringify(body)}`,
    );
  }
  results.push({ method: check.method, path: check.path, status });
}

reportResult({ ok: true, baseUrl: baseUrl.href, checks: results });

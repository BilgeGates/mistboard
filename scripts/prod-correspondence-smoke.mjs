// Correspondence surface deploy gate (#33): the correspondence HTTP routes must
// EXIST and must GATE correctly for an unauthenticated caller. This is not
// functional coverage; it proves the route registrations and their auth/flag
// gates survived the deploy.
//
// Expected codes are pinned from the route code:
//   - apps/server/src/routes/correspondence-games.ts: account-only, unauthenticated
//     GET -> 401 {"error":"not_signed_in"}; non-GET -> 405.
//   - apps/server/src/routes/correspondence-seeks.ts: every verb is account-only;
//     unauthenticated GET/POST -> 401 {"error":"not_signed_in"}. When the
//     correspondence feature flag is OFF the seeks routes return 404
//     {"error":"correspondence_disabled"}, so a 404 here is a real deploy-config
//     regression (flag lost), not a pass.
//
// Read-only by design: the only POST bodies are empty and rejected by the auth
// gate before any parsing or writes.

const DEFAULT_BASE_URL = 'https://mistboard.com';
const DEFAULT_TIMEOUT_MS = 10_000;

const options = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(
  options.baseUrl ?? process.env.MISTBOARD_BASE_URL ?? DEFAULT_BASE_URL,
);
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

const CHECKS = [
  { method: 'GET', path: '/api/correspondence/games', status: 401, error: 'not_signed_in' },
  { method: 'GET', path: '/api/correspondence/seeks', status: 401, error: 'not_signed_in' },
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
  if (status !== check.status || body?.error !== check.error) {
    throw new Error(
      `${check.method} ${check.path}: expected ${check.status} {"error":"${check.error}"}, got ${status} ${JSON.stringify(body)}`,
    );
  }
  results.push({ method: check.method, path: check.path, status });
}

console.log(JSON.stringify({ ok: true, baseUrl: baseUrl.href, checks: results }));

async function fetchJson(url, { timeoutMs, init = {} }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`${url.pathname} returned non-JSON response: ${text.slice(0, 120)}`);
      }
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(args) {
  const result = { baseUrl: null, timeoutMs: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--base') {
      result.baseUrl = requiredValue(args, ++index, '--base');
    } else if (arg === '--timeout-ms') {
      result.timeoutMs = parsePositiveInteger(
        requiredValue(args, ++index, '--timeout-ms'),
        '--timeout-ms',
      );
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return result;
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function printHelp() {
  console.log(`Usage: node scripts/prod-correspondence-smoke.mjs [options]

Asserts the correspondence routes exist and gate correctly for an
unauthenticated caller (deploy-gate coverage, not functional coverage).

Options:
  --base <url>       Base URL to smoke, default ${DEFAULT_BASE_URL}
  --timeout-ms <ms>  Timeout per network step, default ${DEFAULT_TIMEOUT_MS}
`);
}

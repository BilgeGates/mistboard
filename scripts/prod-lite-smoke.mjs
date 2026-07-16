const DEFAULT_BASE_URL = 'https://mistboard.com';
const DEFAULT_TIMEOUT_MS = 10_000;

const options = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(
  options.baseUrl ?? process.env.MISTBOARD_BASE_URL ?? DEFAULT_BASE_URL,
);
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

const health = await fetchJson(new URL('/health', baseUrl), { timeoutMs });
if (health.status !== 200 || health.body?.ok !== true) {
  throw new Error(`/health failed: ${health.status} ${JSON.stringify(health.body)}`);
}

const index = await fetchText(new URL('/', baseUrl), { timeoutMs });
if (index.status !== 200) throw new Error(`/ failed: ${index.status}`);
if (!index.body.includes('Mistboard')) {
  throw new Error('homepage did not include Mistboard brand text');
}

const serverStatus = await fetchJson(new URL('/api/server-status', baseUrl), { timeoutMs });
if (serverStatus.status !== 200) {
  throw new Error(`/api/server-status failed: ${serverStatus.status}`);
}
if (!serverStatus.body || typeof serverStatus.body !== 'object') {
  throw new Error('/api/server-status returned invalid JSON');
}
if (!('restartAt' in serverStatus.body) || !('activeGames' in serverStatus.body)) {
  throw new Error('/api/server-status missing restartAt or activeGames');
}

const engines = await fetchJson(new URL('/api/engines/playable', baseUrl), { timeoutMs });
if (engines.status !== 200) {
  throw new Error(`/api/engines/playable failed: ${engines.status}`);
}
if (!Array.isArray(engines.body?.engines) || engines.body.engines.length === 0) {
  throw new Error('/api/engines/playable returned no engines');
}

// /watch is a registered SPA client route (unknown paths 404), so a 200 with
// the app shell proves the route registration survived the deploy. The shell
// markers are the SPA mount node and the brand title from apps/web/index.html.
const watch = await fetchText(new URL('/watch', baseUrl), { timeoutMs });
if (watch.status !== 200) throw new Error(`/watch failed: ${watch.status}`);
if (!watch.body.includes('id="app"') || !watch.body.includes('Mistboard')) {
  throw new Error('/watch did not serve the app shell (missing id="app" or Mistboard marker)');
}

// One Chinese-localized page: /zh-hans/rules/xiangqi is published (slug
// "xiangqi" is in TRANSLATED_ARTICLE_SLUGS, apps/web/src/article-i18n.ts) and
// prerendered, so the document itself must carry the translated title string
// (the zh-Hans value of the "Xiangqi Rules" catalog key).
const zhRules = await fetchText(new URL('/zh-hans/rules/xiangqi', baseUrl), { timeoutMs });
if (zhRules.status !== 200) throw new Error(`/zh-hans/rules/xiangqi failed: ${zhRules.status}`);
if (!zhRules.body.includes('象棋规则')) {
  throw new Error('/zh-hans/rules/xiangqi missing translated title marker 象棋规则');
}

console.log(
  JSON.stringify({
    ok: true,
    baseUrl: baseUrl.href,
    health: health.body,
    serverStatus: serverStatus.body,
    playableEngines: engines.body.engines.map((engine) => engine.id),
    watchShell: true,
    zhHansRulesXiangqi: true,
  }),
);

async function fetchJson(url, { timeoutMs, init = {} }) {
  const response = await fetchWithTimeout(url, timeoutMs, init);
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
}

async function fetchText(url, { timeoutMs, init = {} }) {
  const response = await fetchWithTimeout(url, timeoutMs, init);
  return { status: response.status, body: await response.text() };
}

async function fetchWithTimeout(url, timeoutMs, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(args) {
  const result = {
    baseUrl: null,
    timeoutMs: null,
  };

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
  console.log(`Usage: npm run prod:smoke:lite -- [options]

Options:
  --base <url>       Base URL to smoke, default ${DEFAULT_BASE_URL}
  --timeout-ms <ms>  Timeout per network step, default ${DEFAULT_TIMEOUT_MS}
`);
}

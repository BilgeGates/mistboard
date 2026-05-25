#!/usr/bin/env node
// Poll production until /api/server-status reports the expected build revision.

const DEFAULT_BASE_URL = 'https://mistboard.com';
const DEFAULT_TIMEOUT_MS = 900_000;
const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}
if (!options.expectedRevision) {
  throw new Error('--expect-revision is required');
}

const baseUrl = normalizeBaseUrl(
  options.baseUrl ?? process.env.MISTBOARD_BASE_URL ?? DEFAULT_BASE_URL,
);
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
const deadline = Date.now() + timeoutMs;

let attempt = 0;
let lastRevision = 'missing';
let lastHealth = 'unknown';

while (Date.now() <= deadline) {
  attempt += 1;
  try {
    const health = await fetchJson(new URL('/health', baseUrl), requestTimeoutMs);
    lastHealth = health.status === 200 ? JSON.stringify(health.body) : `status ${health.status}`;
    const serverStatus = await fetchJson(new URL('/api/server-status', baseUrl), requestTimeoutMs);
    const actualRevision = serverStatus.body?.build?.revision;
    lastRevision = typeof actualRevision === 'string' ? actualRevision : 'missing';
    if (
      health.status === 200 &&
      health.body?.ok === true &&
      typeof actualRevision === 'string' &&
      revisionMatches(actualRevision, options.expectedRevision)
    ) {
      console.log(`revision ready on attempt ${attempt}: ${actualRevision} at ${baseUrl.href}`);
      process.exit(0);
    }
    console.log(
      `attempt ${attempt}: waiting for ${options.expectedRevision}; current=${lastRevision}; health=${lastHealth}`,
    );
  } catch (error) {
    console.log(`attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (Date.now() + intervalMs > deadline) break;
  await sleep(intervalMs);
}

throw new Error(
  `timed out waiting for ${options.expectedRevision}; last revision=${lastRevision}; last health=${lastHealth}`,
);

function parseArgs(args) {
  const parsed = {
    baseUrl: null,
    expectedRevision: null,
    help: false,
    intervalMs: null,
    requestTimeoutMs: null,
    timeoutMs: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--base') {
      parsed.baseUrl = requiredValue(args, ++index, arg);
    } else if (arg === '--expect-revision') {
      parsed.expectedRevision = requiredValue(args, ++index, arg);
    } else if (arg === '--timeout-ms') {
      parsed.timeoutMs = parsePositiveInteger(requiredValue(args, ++index, arg), arg);
    } else if (arg === '--interval-ms') {
      parsed.intervalMs = parsePositiveInteger(requiredValue(args, ++index, arg), arg);
    } else if (arg === '--request-timeout-ms') {
      parsed.requestTimeoutMs = parsePositiveInteger(requiredValue(args, ++index, arg), arg);
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return parsed;
}

async function fetchJson(url, timeoutMs) {
  const response = await fetchWithTimeout(url, timeoutMs);
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

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function revisionMatches(actual, expected) {
  return actual === expected || actual.startsWith(expected) || expected.startsWith(actual);
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  console.log(`Usage:
  npm run prod:wait-revision -- --expect-revision <sha>

Options:
  --base <url>                 Base URL to poll, default ${DEFAULT_BASE_URL}
  --expect-revision <sha>      Required revision from /api/server-status
  --timeout-ms <ms>            Total wait window, default ${DEFAULT_TIMEOUT_MS}
  --interval-ms <ms>           Delay between attempts, default ${DEFAULT_INTERVAL_MS}
  --request-timeout-ms <ms>    Timeout per request, default ${DEFAULT_REQUEST_TIMEOUT_MS}`);
}

#!/usr/bin/env node
// Poll production until /health and /api/server-status are stable on a revision.

import { appendFileSync } from 'node:fs';

const DEFAULT_BASE_URL = 'https://mistboard.com';
// 35 min: Railway builder-QUEUE latency alone reached ~15.5 min on 2026-07-16
// (#239) while the actual build stayed in its 2-4 min norm. This wait only
// sees public endpoints, so a queued deploy is indistinguishable from a stuck
// one; the window must absorb worst-case queue + build.
const DEFAULT_TIMEOUT_MS = 2_100_000;
const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_STABLE_ATTEMPTS = 2;
const DEFAULT_CI_BRANCH = 'main';
const DEFAULT_CI_WORKFLOW = 'ci.yml';
const GITHUB_API_VERSION = '2022-11-28';
const GITHUB_CI_POLL_MS = 30_000;

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
const stableAttempts = options.stableAttempts ?? DEFAULT_STABLE_ATTEMPTS;
const deadline = Date.now() + timeoutMs;
const waitStartedAt = Date.now();
const ciTracker = createCiTracker({
  branch: options.ciBranch ?? process.env.GITHUB_REF_NAME ?? DEFAULT_CI_BRANCH,
  expectedRevision: options.expectedRevision,
  repo: options.githubRepo ?? process.env.GITHUB_REPOSITORY ?? null,
  token: process.env.GITHUB_TOKEN ?? null,
  workflow: options.ciWorkflow ?? DEFAULT_CI_WORKFLOW,
});

let attempt = 0;
let readyAttempts = 0;
let lastRevision = 'missing';
let lastHealth = 'unknown';
let firstExpectedRevisionAt = null;
let waitEndedAt = null;
let waitStatus = 'failed';

try {
  while (Date.now() <= deadline) {
    attempt += 1;
    const ciStatus = await ciTracker.refresh();
    if (ciStatus.state === 'failed') {
      throw new Error(formatCiFailure(ciStatus));
    }

    try {
      const health = await fetchJson(new URL('/health', baseUrl), requestTimeoutMs);
      lastHealth = health.status === 200 ? JSON.stringify(health.body) : `status ${health.status}`;
      const serverStatus = await fetchJson(
        new URL('/api/server-status', baseUrl),
        requestTimeoutMs,
      );
      const actualRevision = serverStatus.body?.build?.revision;
      lastRevision = typeof actualRevision === 'string' ? actualRevision : 'missing';
      const matchedRevision =
        typeof actualRevision === 'string' &&
        revisionMatches(actualRevision, options.expectedRevision);
      if (matchedRevision && firstExpectedRevisionAt === null) {
        firstExpectedRevisionAt = Date.now();
      }
      const ready = health.status === 200 && health.body?.ok === true && matchedRevision;
      if (ready) {
        readyAttempts += 1;
        if (readyAttempts >= stableAttempts) {
          waitStatus = 'ok';
          waitEndedAt = Date.now();
          const finalCiStatus = await ciTracker.refresh({ force: true });
          writeRevisionWaitSummary({
            attempt,
            baseUrl,
            ciStatus: finalCiStatus,
            firstExpectedRevisionAt,
            lastHealth,
            lastRevision,
            readyAttempts,
            status: waitStatus,
            waitEndedAt,
            waitStartedAt,
          });
          console.log(
            `revision ready after ${readyAttempts} stable attempts: ${actualRevision} at ${baseUrl.href}`,
          );
        }
        if (waitStatus !== 'ok') {
          console.log(
            `attempt ${attempt}: phase=${waitPhase(ciStatus, firstExpectedRevisionAt)}; matched ${actualRevision}; waiting for stability ${readyAttempts}/${stableAttempts}`,
          );
        }
      } else {
        readyAttempts = 0;
        console.log(
          `attempt ${attempt}: phase=${waitPhase(ciStatus, firstExpectedRevisionAt)}; waiting for ${options.expectedRevision}; current=${lastRevision}; health=${lastHealth}`,
        );
      }
    } catch (error) {
      readyAttempts = 0;
      console.log(`attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (waitStatus === 'ok') break;
    if (Date.now() + intervalMs > deadline) break;
    await sleep(intervalMs);
  }

  if (waitStatus !== 'ok') {
    const phase = waitPhase(ciTracker.current(), firstExpectedRevisionAt);
    const queueHint =
      phase === 'railway_build_or_deploy_wait'
        ? ` The deploy may still be QUEUED or BUILDING on Railway (builder-queue latency has reached ~15 min, #239); this script cannot see Railway state, so a timeout here does NOT mean the deploy failed. Check the dashboard or \`railway status\`, then resume with: npm run prod:wait-revision -- --expect-revision ${options.expectedRevision}`
        : '';
    throw new Error(
      `timed out waiting for ${options.expectedRevision} (phase=${phase}); last revision=${lastRevision}; last health=${lastHealth}.${queueHint}`,
    );
  }
} finally {
  if (waitStatus !== 'ok') {
    waitEndedAt = Date.now();
    const finalCiStatus = await ciTracker.refresh({ force: true });
    writeRevisionWaitSummary({
      attempt,
      baseUrl,
      ciStatus: finalCiStatus,
      firstExpectedRevisionAt,
      lastHealth,
      lastRevision,
      readyAttempts,
      status: waitStatus,
      waitEndedAt,
      waitStartedAt,
    });
  }
}

function parseArgs(args) {
  const parsed = {
    baseUrl: null,
    ciBranch: null,
    ciWorkflow: null,
    expectedRevision: null,
    githubRepo: null,
    help: false,
    intervalMs: null,
    requestTimeoutMs: null,
    stableAttempts: null,
    summary: null,
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
    } else if (arg === '--stable-attempts') {
      parsed.stableAttempts = parsePositiveInteger(requiredValue(args, ++index, arg), arg);
    } else if (arg === '--summary') {
      parsed.summary = requiredValue(args, ++index, arg);
    } else if (arg === '--github-repo') {
      parsed.githubRepo = requiredValue(args, ++index, arg);
    } else if (arg === '--ci-workflow') {
      parsed.ciWorkflow = requiredValue(args, ++index, arg);
    } else if (arg === '--ci-branch') {
      parsed.ciBranch = requiredValue(args, ++index, arg);
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

function createCiTracker({ branch, expectedRevision, repo, token, workflow }) {
  let lastPollAt = 0;
  let status = ciUnavailableStatus({ repo, token, workflow });
  let completedObservedAt = status.state === 'success' ? Date.now() : null;

  return {
    current() {
      return { ...status, completedObservedAt };
    },
    async refresh({ force = false } = {}) {
      if (status.state === 'untracked') return { ...status, completedObservedAt };
      if (status.state === 'success' || status.state === 'failed') {
        return { ...status, completedObservedAt };
      }

      const now = Date.now();
      if (!force && lastPollAt > 0 && now - lastPollAt < GITHUB_CI_POLL_MS) {
        return { ...status, completedObservedAt };
      }
      lastPollAt = now;

      status = await fetchCiStatus({
        branch,
        expectedRevision,
        repo,
        token,
        workflow,
      });
      if (status.state === 'success' && completedObservedAt === null) {
        completedObservedAt = Date.now();
      }
      return { ...status, completedObservedAt };
    },
  };
}

function ciUnavailableStatus({ repo, token, workflow }) {
  if (!repo) {
    return {
      reason: 'GITHUB_REPOSITORY was not set',
      state: 'untracked',
      workflow,
    };
  }
  if (!token) {
    return {
      reason: 'GITHUB_TOKEN was not set',
      repo,
      state: 'untracked',
      workflow,
    };
  }
  if (!workflow) {
    return {
      reason: 'CI workflow was not set',
      repo,
      state: 'untracked',
      workflow,
    };
  }
  return {
    branch: null,
    repo,
    state: 'pending',
    status: 'not_checked',
    workflow,
  };
}

async function fetchCiStatus({ branch, expectedRevision, repo, token, workflow }) {
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(repo).replaceAll('%2F', '/')}/actions/workflows/${encodeURIComponent(workflow)}/runs`,
  );
  url.searchParams.set('branch', branch);
  url.searchParams.set('event', 'push');
  url.searchParams.set('per_page', '20');

  try {
    const response = await fetchWithTimeout(url, DEFAULT_REQUEST_TIMEOUT_MS, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'mistboard-prod-revision-wait',
        'x-github-api-version': GITHUB_API_VERSION,
      },
    });
    if (!response.ok) {
      return {
        branch,
        reason: `GitHub Actions lookup failed with status ${response.status}`,
        repo,
        state: 'unknown',
        workflow,
      };
    }

    const body = await response.json();
    const runs = Array.isArray(body.workflow_runs) ? body.workflow_runs : [];
    const run = runs.find(
      (candidate) =>
        typeof candidate.head_sha === 'string' &&
        revisionMatches(candidate.head_sha, expectedRevision),
    );
    if (!run) {
      return {
        branch,
        reason: `no ${workflow} push run found for ${shortRevision(expectedRevision)}`,
        repo,
        state: 'unknown',
        workflow,
      };
    }

    return ciStatusFromRun({ branch, repo, run, workflow });
  } catch (error) {
    return {
      branch,
      reason: error instanceof Error ? error.message : String(error),
      repo,
      state: 'unknown',
      workflow,
    };
  }
}

function ciStatusFromRun({ branch, repo, run, workflow }) {
  const status = typeof run.status === 'string' ? run.status : 'unknown';
  const conclusion = typeof run.conclusion === 'string' ? run.conclusion : null;
  const startedAtMs = parseDateMs(run.run_started_at ?? run.created_at);
  const completedAtMs = status === 'completed' ? parseDateMs(run.updated_at) : null;
  const durationMs =
    startedAtMs !== null && completedAtMs !== null
      ? Math.max(0, completedAtMs - startedAtMs)
      : null;
  const shared = {
    branch,
    completedAtMs,
    conclusion,
    durationMs,
    htmlUrl: typeof run.html_url === 'string' ? run.html_url : null,
    repo,
    runId: typeof run.id === 'number' ? run.id : null,
    startedAtMs,
    status,
    workflow,
  };

  if (status === 'completed' && conclusion === 'success') {
    return { ...shared, state: 'success' };
  }
  if (status === 'completed') {
    return { ...shared, state: 'failed' };
  }
  return { ...shared, state: 'pending' };
}

async function fetchWithTimeout(url, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function revisionMatches(actual, expected) {
  return actual === expected || actual.startsWith(expected) || expected.startsWith(actual);
}

function waitPhase(ciStatus, firstExpectedRevisionAt) {
  if (ciStatus.state === 'pending') return `ci_wait:${ciStatus.status}`;
  if (firstExpectedRevisionAt === null) return 'railway_build_or_deploy_wait';
  return 'revision_propagation_wait';
}

function formatCiFailure(ciStatus) {
  const detail = ciStatus.conclusion ? ` with ${ciStatus.conclusion}` : '';
  const url = ciStatus.htmlUrl ? `: ${ciStatus.htmlUrl}` : '';
  return `${ciStatus.workflow} completed${detail} for ${shortRevision(options.expectedRevision)}${url}`;
}

function writeRevisionWaitSummary({
  attempt,
  baseUrl,
  ciStatus,
  firstExpectedRevisionAt,
  lastHealth,
  lastRevision,
  readyAttempts,
  status,
  waitEndedAt,
  waitStartedAt,
}) {
  const summaryPath = options.summary ?? process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  appendFileSync(
    summaryPath,
    [
      '### Railway Revision Wait Detail',
      '',
      `- Status: **${status}**`,
      `- Base URL: \`${baseUrl.href}\``,
      `- Expected revision: \`${shortRevision(options.expectedRevision)}\``,
      `- Last seen revision: \`${shortRevision(lastRevision)}\``,
      `- Last health: \`${lastHealth}\``,
      `- Attempts: ${attempt}`,
      `- Stable ready attempts: ${readyAttempts}/${stableAttempts}`,
      '',
      '| Phase | Duration | Detail |',
      '| --- | ---: | --- |',
      `| CI run | ${formatNullableDuration(ciStatus.durationMs)} | ${escapeSummaryCell(ciDetail(ciStatus))} |`,
      `| Waited for CI in this run | ${formatNullableDuration(waitedForCiMs({ ciStatus, waitEndedAt, waitStartedAt }))} | ${escapeSummaryCell(waitedForCiDetail(ciStatus))} |`,
      `| Railway build/deploy wait | ${formatNullableDuration(railwayBuildWaitMs({ ciStatus, firstExpectedRevisionAt, waitStartedAt }))} | ${escapeSummaryCell(railwayBuildDetail(ciStatus, firstExpectedRevisionAt))} |`,
      `| Revision propagation/stability | ${formatNullableDuration(propagationWaitMs({ firstExpectedRevisionAt, waitEndedAt }))} | ${firstExpectedRevisionAt === null ? 'expected revision was not observed' : 'first expected revision seen -> stable ready'} |`,
      `| Total revision wait | ${formatDuration(waitEndedAt - waitStartedAt)} | wait script wall time |`,
      '',
    ].join('\n'),
  );
}

function ciDetail(ciStatus) {
  if (ciStatus.state === 'untracked') return `not tracked (${ciStatus.reason})`;
  if (ciStatus.state === 'unknown') return `unknown (${ciStatus.reason})`;
  if (ciStatus.state === 'pending') return `${ciStatus.workflow} ${ciStatus.status}`;
  if (ciStatus.state === 'success') return `${ciStatus.workflow} succeeded`;
  if (ciStatus.state === 'failed') {
    return `${ciStatus.workflow} completed with ${ciStatus.conclusion ?? 'non-success'}`;
  }
  return ciStatus.state;
}

function waitedForCiMs({ ciStatus, waitEndedAt, waitStartedAt }) {
  if (ciStatus.state === 'untracked' || ciStatus.state === 'unknown') return null;
  if (ciStatus.state === 'pending') return waitEndedAt - waitStartedAt;
  if (ciStatus.completedAtMs === null) return null;
  return Math.max(0, Math.min(ciStatus.completedAtMs, waitEndedAt) - waitStartedAt);
}

function waitedForCiDetail(ciStatus) {
  if (ciStatus.state === 'untracked' || ciStatus.state === 'unknown') {
    return 'CI status unavailable';
  }
  if (ciStatus.state === 'pending') return 'CI had not completed before the revision wait ended';
  if (ciStatus.completedAtMs === null) return 'CI completion time unavailable';
  return 'wait start -> CI completion';
}

function railwayBuildWaitMs({ ciStatus, firstExpectedRevisionAt, waitStartedAt }) {
  if (firstExpectedRevisionAt === null) return null;
  const startAt =
    ciStatus.state === 'success' && ciStatus.completedAtMs !== null
      ? Math.max(waitStartedAt, ciStatus.completedAtMs)
      : waitStartedAt;
  return Math.max(0, firstExpectedRevisionAt - startAt);
}

function railwayBuildDetail(ciStatus, firstExpectedRevisionAt) {
  if (firstExpectedRevisionAt === null) return 'expected revision was not observed';
  if (ciStatus.state === 'success' && ciStatus.completedAtMs !== null) {
    return 'CI success -> first expected production revision';
  }
  return 'wait start -> first expected production revision; CI status unavailable';
}

function propagationWaitMs({ firstExpectedRevisionAt, waitEndedAt }) {
  if (firstExpectedRevisionAt === null) return null;
  return Math.max(0, waitEndedAt - firstExpectedRevisionAt);
}

function formatNullableDuration(ms) {
  return typeof ms === 'number' ? formatDuration(ms) : 'not available';
}

function formatDuration(ms) {
  if (ms < 1_000) return `${ms}ms`;
  const seconds = ms / 1_000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function parseDateMs(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function shortRevision(value) {
  if (typeof value !== 'string') return 'missing';
  return value.length > 12 ? value.slice(0, 12) : value;
}

function escapeSummaryCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
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
  --request-timeout-ms <ms>    Timeout per request, default ${DEFAULT_REQUEST_TIMEOUT_MS}
  --stable-attempts <count>    Consecutive ready checks required, default ${DEFAULT_STABLE_ATTEMPTS}
  --summary <path>             Write markdown summary. Defaults to GITHUB_STEP_SUMMARY.
  --github-repo <owner/repo>   Repository for CI timing lookup. Defaults to GITHUB_REPOSITORY.
  --ci-workflow <file>         GitHub Actions workflow file, default ${DEFAULT_CI_WORKFLOW}.
  --ci-branch <branch>         Branch for CI timing lookup, default ${DEFAULT_CI_BRANCH}.`);
}

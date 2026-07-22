import type { IncomingMessage, ServerResponse } from 'node:http';
import { getBuildInfo } from '../build-info.js';
import {
  type MistboardReadoutTrigger,
  renderMistboardReadoutMarkdown,
  scheduledReadoutTrigger,
} from '../mistboard-readout.js';
import {
  authorizeGithubReadoutBearer,
  type MistboardReadoutTokenVerifier,
  verifyGithubReadoutToken,
} from '../mistboard-readout-oidc.js';
import * as persistence from '../persistence.js';
import {
  generateMistboardReadout,
  latestMistboardReadout,
} from '../persistence-mistboard-readout.js';
import { type HttpApiContext, readJsonBody, writeJson } from './lib.js';

type ReadoutRouteDependencies = {
  verifyToken: MistboardReadoutTokenVerifier;
  generate: typeof generateMistboardReadout;
  latest: typeof latestMistboardReadout;
  now: () => Date;
};

const defaultDependencies: ReadoutRouteDependencies = {
  verifyToken: verifyGithubReadoutToken,
  generate: generateMistboardReadout,
  latest: latestMistboardReadout,
  now: () => new Date(),
};

export async function readoutGenerateForApi(
  ctx: HttpApiContext,
  body: Record<string, unknown>,
  deps: ReadoutRouteDependencies = defaultDependencies,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const now = deps.now();
  const trigger = parseTrigger(body.trigger, now);
  if (!trigger) return { status: 400, payload: { error: 'invalid_trigger' } };
  if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') {
    return { status: 400, payload: { error: 'invalid_dry_run' } };
  }
  const result = await deps.generate({
    trigger,
    now,
    dryRun: body.dryRun === true,
    runtime: {
      revision: getBuildInfo().revision,
      activeGames: ctx.activeGameCount?.() ?? 0,
      databaseRequired: ctx.databaseRequired,
      persistence: persistence.isInitialized() ? 'enabled' : 'disabled',
      persistenceErrors: ctx.persistenceHealth?.() ?? { count1m: 0, lastAt: null },
    },
  });
  return {
    status: 200,
    payload: {
      report: result.report,
      markdown: renderMistboardReadoutMarkdown(result.report),
      reused: result.reused,
    },
  };
}

export async function tryHandle(
  ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  if (pathname !== '/api/admin/readouts/generate' && pathname !== '/api/admin/readouts/latest') {
    return false;
  }

  const method = pathname.endsWith('/generate') ? 'POST' : 'GET';
  if ((request.method ?? 'GET') !== method) {
    writeJson(
      response,
      405,
      { error: 'method_not_allowed' },
      { allow: method, 'cache-control': 'no-store' },
    );
    return true;
  }
  if (
    !(await authorizeGithubReadoutBearer(
      request.headers.authorization,
      defaultDependencies.verifyToken,
    ))
  ) {
    writeJson(response, 401, { error: 'unauthorized' }, { 'cache-control': 'no-store' });
    return true;
  }
  if (!persistence.isInitialized()) {
    writeJson(response, 503, { error: 'persistence_disabled' }, { 'cache-control': 'no-store' });
    return true;
  }

  if (pathname.endsWith('/latest')) {
    const report = await defaultDependencies.latest();
    writeJson(
      response,
      report ? 200 : 404,
      report
        ? { report, markdown: renderMistboardReadoutMarkdown(report) }
        : { error: 'not_found' },
      { 'cache-control': 'no-store' },
    );
    return true;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    writeJson(response, 400, { error: 'invalid_request_body' }, { 'cache-control': 'no-store' });
    return true;
  }
  try {
    const result = await readoutGenerateForApi(ctx, body);
    writeJson(response, result.status, result.payload, { 'cache-control': 'no-store' });
  } catch {
    writeJson(
      response,
      500,
      { error: 'readout_generation_failed' },
      { 'cache-control': 'no-store' },
    );
  }
  return true;
}

function parseTrigger(value: unknown, now: Date): MistboardReadoutTrigger | null {
  if (value === undefined || value === 'auto') return scheduledReadoutTrigger(now);
  if (value === 'daily' || value === 'weekly' || value === 'manual') return value;
  return null;
}

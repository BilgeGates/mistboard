// Serve a xiangqi broadcast fixture pack as a local fake source.

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  readXiangqiBroadcastFixturePack,
  resolveXiangqiBroadcastInputPath,
} from './import-xiangqi-broadcast.js';
import {
  type XiangqiBroadcastSourceMode,
  type XiangqiBroadcastSourceResponse,
  xiangqiBroadcastSourceResponse,
} from './xiangqi-broadcast-sim.js';
import {
  convertWxfDhtmlXqPageToSnapshot,
  type WxfDhtmlXqSnapshot,
} from './xiangqi-broadcast-wxf-dhtmlxq.js';

type Args = {
  dir?: string;
  wxfHtml?: string;
  wxfTourSlug?: string;
  wxfTourName?: string;
  wxfRoundId?: string;
  wxfRoundName?: string;
  wxfSourceUrl?: string;
  tape: string;
  mode: XiangqiBroadcastSourceMode;
  port: number;
  timeoutDelayMs: number;
};

const MODES: readonly XiangqiBroadcastSourceMode[] = [
  'clean',
  'stale',
  'malformed',
  'error',
  'timeout',
];

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf-8')) as unknown;
}

function parseCliArgs(argv: string[]): Args {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: 'string' },
      tape: { type: 'string', default: 'tape.json' },
      mode: { type: 'string', default: 'clean' },
      port: { type: 'string', default: '3127' },
      'timeout-delay-ms': { type: 'string', default: '30000' },
      'wxf-html': { type: 'string' },
      'wxf-tour-slug': { type: 'string' },
      'wxf-tour-name': { type: 'string' },
      'wxf-round-id': { type: 'string' },
      'wxf-round-name': { type: 'string' },
      'wxf-source-url': { type: 'string' },
    },
  });
  if (!values.dir && !values['wxf-html']) {
    console.error(
      'usage: serve-xiangqi-broadcast-source (--dir <fixture-pack> | --wxf-html <html-file>) [--tape tape.json] [--mode clean|stale|malformed|error|timeout] [--port 3127] [--timeout-delay-ms 30000]',
    );
    process.exit(1);
  }
  if (values.dir && values['wxf-html']) {
    console.error('choose only one source: --dir or --wxf-html');
    process.exit(1);
  }
  if (!MODES.includes(values.mode as XiangqiBroadcastSourceMode)) {
    console.error(`--mode must be one of ${MODES.join(', ')}`);
    process.exit(1);
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port <= 0) {
    console.error('--port must be a positive integer');
    process.exit(1);
  }
  const timeoutDelayMs = Number(values['timeout-delay-ms']);
  if (!Number.isInteger(timeoutDelayMs) || timeoutDelayMs <= 0) {
    console.error('--timeout-delay-ms must be a positive integer');
    process.exit(1);
  }
  return {
    ...(values.dir ? { dir: values.dir } : {}),
    ...(values['wxf-html'] ? { wxfHtml: values['wxf-html'] } : {}),
    ...(values['wxf-tour-slug'] ? { wxfTourSlug: values['wxf-tour-slug'] } : {}),
    ...(values['wxf-tour-name'] ? { wxfTourName: values['wxf-tour-name'] } : {}),
    ...(values['wxf-round-id'] ? { wxfRoundId: values['wxf-round-id'] } : {}),
    ...(values['wxf-round-name'] ? { wxfRoundName: values['wxf-round-name'] } : {}),
    ...(values['wxf-source-url'] ? { wxfSourceUrl: values['wxf-source-url'] } : {}),
    tape: values.tape,
    mode: values.mode as XiangqiBroadcastSourceMode,
    port,
    timeoutDelayMs,
  };
}

function staticSnapshotSourceResponse(
  snapshot: WxfDhtmlXqSnapshot,
  mode: XiangqiBroadcastSourceMode,
): XiangqiBroadcastSourceResponse {
  if (mode === 'error') return { status: 500, body: { error: 'fixture_source_error' } };
  if (mode === 'malformed')
    return { status: 200, body: { malformed: true, boards: { bad: true } } };
  return {
    status: 200,
    body: {
      tour: snapshot.tour,
      rounds: snapshot.rounds,
      boards: snapshot.boards,
    },
  };
}

async function readSourceResponse(args: Args): Promise<{
  kind: 'fixture-pack' | 'wxf-dhtmlxq';
  sourceAt: (atMs: number) => XiangqiBroadcastSourceResponse;
}> {
  if (args.wxfHtml) {
    const htmlPath = resolveXiangqiBroadcastInputPath(args.wxfHtml);
    const converted = convertWxfDhtmlXqPageToSnapshot(await readFile(htmlPath, 'utf-8'), {
      tourSlug: args.wxfTourSlug,
      tourName: args.wxfTourName,
      roundId: args.wxfRoundId,
      roundName: args.wxfRoundName,
      sourceUrl: args.wxfSourceUrl,
    });
    if (!converted.ok) {
      console.error(
        `failed to convert WXF DhtmlXQ source: ${converted.issues
          .map((issue) => `${issue.kind}${issue.sourceBoardId ? `:${issue.sourceBoardId}` : ''}`)
          .join(', ')}`,
      );
      process.exit(1);
    }
    if (converted.issues.length > 0) {
      console.error(
        `converted WXF DhtmlXQ source with skipped frames: ${converted.issues
          .map((issue) => `${issue.kind}${issue.sourceBoardId ? `:${issue.sourceBoardId}` : ''}`)
          .join(', ')}`,
      );
    }
    return {
      kind: 'wxf-dhtmlxq',
      sourceAt: () => staticSnapshotSourceResponse(converted.snapshot, args.mode),
    };
  }

  if (!args.dir) throw new Error('fixture directory is required');
  const pack = await readXiangqiBroadcastFixturePack(args.dir);
  const tape = await readJsonFile(join(resolveXiangqiBroadcastInputPath(args.dir), args.tape));
  return {
    kind: 'fixture-pack',
    sourceAt: (atMs) => xiangqiBroadcastSourceResponse(pack, tape, atMs, args.mode),
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const source = await readSourceResponse(args);
  const startedAt = Date.now();

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const writeSourceResponse = () => {
      const atMs = Number(url.searchParams.get('atMs') ?? Date.now() - startedAt);
      const snapshot = source.sourceAt(Number.isFinite(atMs) ? atMs : 0);
      response.setHeader('content-type', 'application/json');

      if (url.pathname === '/health') {
        response
          .writeHead(200)
          .end(JSON.stringify({ ok: true, mode: args.mode, source: source.kind }));
        return;
      }
      if (snapshot.status !== 200) {
        response.writeHead(snapshot.status).end(JSON.stringify(snapshot.body));
        return;
      }
      if ('malformed' in snapshot.body) {
        response.writeHead(200).end(JSON.stringify(snapshot.body));
        return;
      }
      if (url.pathname === '/tour.json') {
        response.writeHead(200).end(JSON.stringify(snapshot.body.tour));
        return;
      }
      if (url.pathname === '/rounds.json') {
        response.writeHead(200).end(JSON.stringify(snapshot.body.rounds));
        return;
      }
      if (url.pathname === '/boards.json') {
        response.writeHead(200).end(JSON.stringify(snapshot.body.boards));
        return;
      }
      if (url.pathname === '/source.json') {
        response.writeHead(200).end(JSON.stringify(snapshot.body));
        return;
      }
      response.writeHead(404).end(JSON.stringify({ error: 'not_found' }));
    };

    if (args.mode === 'timeout' && url.pathname !== '/health') {
      setTimeout(writeSourceResponse, args.timeoutDelayMs).unref();
      return;
    }

    writeSourceResponse();
  });

  await new Promise<void>((resolve) => server.listen(args.port, resolve));
  console.log(`xiangqi broadcast fixture source listening on http://localhost:${args.port}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

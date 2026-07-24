import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { tryHandle } from './routes/studies.js';

type ResponseCapture = { body: string; headers: Record<string, string>; status: number | null };

test('Staff picks curation rejects a non-admin before reading persistence', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const response = captureResponse();
    const request = {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as IncomingMessage;

    const handled = await tryHandle({}, request, response, '/api/admin/studies/study1/featured');

    assert.equal(handled, true);
    assert.equal(response.status, 403);
    assert.deepEqual(JSON.parse(response.body), { error: 'admin_required' });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    headers: {} as Record<string, string>,
    status: null as number | null,
    writeHead(status: number, headers?: Record<string, string>) {
      capture.status = status;
      capture.headers = headers ?? {};
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  return capture as unknown as ServerResponse & ResponseCapture;
}

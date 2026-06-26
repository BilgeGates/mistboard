import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import { accountSessionCookie, hashSecret } from './account-session.js';
import { createAccountSession, createUser, findUserByEmail } from './persistence.js';
import { definePersistenceTests } from './persistence-test-support.js';
import { tryHandle } from './routes/account.js';

type ResponseCapture = { body: string; headers: Record<string, string>; status: number | null };

definePersistenceTests('account routes', () => {
  test('account preferences route updates a signed-in locale', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const sessionToken = 'locale-route-token';
    await createUser({
      id: 'user_locale_route',
      email: 'locale-route@example.com',
      emailVerifiedAt: now,
      handle: 'locale-route',
      displayName: 'Locale Route',
      now,
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await createAccountSession({
      id: 'locale-route-session',
      userId: 'user_locale_route',
      tokenHash: hashSecret(sessionToken),
      expiresAt,
    });

    const response = captureResponse();
    const handled = await tryHandle(
      {},
      jsonRequest(
        { locale: 'ja' },
        accountSessionCookie('locale-route-session', sessionToken, expiresAt).split(';')[0],
      ),
      response,
      '/api/account/preferences',
    );

    assert.equal(handled, true);
    assert.equal(response.status, 200);
    assert.equal((JSON.parse(response.body) as { user: { locale: string } }).user.locale, 'ja');
    assert.equal((await findUserByEmail('locale-route@example.com'))?.locale, 'ja');
  });

  test('account preferences route rejects unknown locales', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const sessionToken = 'invalid-locale-route-token';
    await createUser({
      id: 'user_invalid_locale_route',
      email: 'invalid-locale@example.com',
      emailVerifiedAt: now,
      handle: 'invalid-locale',
      displayName: 'Invalid Locale',
      now,
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await createAccountSession({
      id: 'invalid-locale-route-session',
      userId: 'user_invalid_locale_route',
      tokenHash: hashSecret(sessionToken),
      expiresAt,
    });

    const response = captureResponse();
    const handled = await tryHandle(
      {},
      jsonRequest(
        { locale: 'fr' },
        accountSessionCookie('invalid-locale-route-session', sessionToken, expiresAt).split(';')[0],
      ),
      response,
      '/api/account/preferences',
    );

    assert.equal(handled, true);
    assert.equal(response.status, 400);
    assert.deepEqual(JSON.parse(response.body), { error: 'invalid_locale' });
  });
});

function jsonRequest(body: unknown, cookie?: string): IncomingMessage {
  const request = Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage;
  request.method = 'PATCH';
  request.headers = cookie ? { cookie } : {};
  return request;
}

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

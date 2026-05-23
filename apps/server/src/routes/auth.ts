import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeEmail } from './../account-identity.js';
import {
  accountSessionCookie,
  accountSessionFromRequest,
  accountSessionTtlMs,
  authEmailDeliveryEnabled,
  currentAccountUser,
  devAuthCodesEnabled,
  emailLoginCodeTtlMs,
  ensureUserForEmail,
  expiredAccountSessionCookie,
  hashSecret,
  publicUser,
  randomEmailLoginCode,
  sendEmailLoginCode,
} from './../account-session.js';
import * as persistence from './../persistence.js';
import { readJsonBody, requireMethod, requirePersistence, writeJson } from './lib.js';

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === '/api/auth/me') {
    if (!requireMethod(request, response, 'GET')) return true;
    const user = await currentAccountUser(request);
    writeJson(response, 200, { user: user ? publicUser(user) : null });
    return true;
  }

  if (pathname === '/api/auth/email/start') {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    if (!authEmailDeliveryEnabled && !devAuthCodesEnabled) {
      writeJson(response, 503, { error: 'email_delivery_not_configured' });
      return true;
    }
    const body = await readJsonBody(request);
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : null);
    if (!email) {
      writeJson(response, 400, { error: 'invalid_email' });
      return true;
    }
    const loginId = randomUUID();
    const code = randomEmailLoginCode();
    const expiresAt = new Date(Date.now() + emailLoginCodeTtlMs);
    await persistence.createEmailLoginChallenge({
      id: loginId,
      email,
      codeHash: hashSecret(code),
      expiresAt,
    });
    if (authEmailDeliveryEnabled) {
      const delivery = await sendEmailLoginCode(email, code);
      if (!delivery.ok) {
        await persistence.deleteEmailLoginChallenge(loginId);
        writeJson(response, 502, { error: 'email_delivery_failed' });
        return true;
      }
    }
    writeJson(response, 202, {
      loginId,
      email,
      expiresAt: expiresAt.toISOString(),
      delivery: authEmailDeliveryEnabled ? 'email' : 'dev-response',
      ...(devAuthCodesEnabled ? { devCode: code } : {}),
    });
    return true;
  }

  if (pathname === '/api/auth/email/confirm') {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    const body = await readJsonBody(request);
    const loginId = typeof body.loginId === 'string' ? body.loginId.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!loginId || !code) {
      writeJson(response, 400, { error: 'invalid_login_code' });
      return true;
    }
    const now = new Date();
    const challenge = await persistence.consumeEmailLoginChallenge(loginId, hashSecret(code), now);
    if (!challenge) {
      writeJson(response, 400, { error: 'invalid_login_code' });
      return true;
    }

    const { user, isNew } = await ensureUserForEmail(challenge.email, now);
    const sessionId = randomUUID();
    const sessionToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + accountSessionTtlMs);
    await persistence.createAccountSession({
      id: sessionId,
      userId: user.id,
      tokenHash: hashSecret(sessionToken),
      expiresAt,
    });
    writeJson(
      response,
      200,
      { user: publicUser(user), isNewUser: isNew },
      {
        'set-cookie': accountSessionCookie(sessionId, sessionToken, expiresAt),
      },
    );
    return true;
  }

  if (pathname === '/api/auth/logout') {
    if (!requireMethod(request, response, 'POST')) return true;
    const session = accountSessionFromRequest(request);
    if (session && persistence.isInitialized()) {
      await persistence.revokeAccountSession(
        session.sessionId,
        hashSecret(session.token),
        new Date(),
      );
    }
    writeJson(
      response,
      200,
      { ok: true },
      {
        'set-cookie': expiredAccountSessionCookie(),
      },
    );
    return true;
  }

  return false;
}

/**
 * Shared Resend transactional-email sender — the single place the platform
 * talks to the email provider. Auth login codes, feedback notifications,
 * engine alerts, and (correspondence C2) turn nudges / deadline warnings all
 * go through sendTransactionalEmail. Policy stays caller-owned: recipients,
 * From-address fallbacks, throttles, templates, enablement flags, and
 * failure logging all live with the caller; this module only does the wire
 * call and never logs (the API key must not leak into any log path).
 */

const resendApiKey = process.env.RESEND_API_KEY;

export const transactionalEmailConfigured = !!resendApiKey;

export type TransactionalEmail = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export type SendTransactionalEmailResult =
  | { ok: true }
  | { ok: false; error?: string; statusCode?: number };

export async function sendTransactionalEmail(
  message: TransactionalEmail,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SendTransactionalEmailResult> {
  if (!resendApiKey) return { ok: false, error: 'not_configured' };
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });
    if (response.ok) return { ok: true };
    return { ok: false, statusCode: response.status };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

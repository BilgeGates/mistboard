const resendApiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.MISTBOARD_AUTH_EMAIL_FROM ?? process.env.RESEND_FROM_EMAIL;
const feedbackTo = process.env.MISTBOARD_FEEDBACK_TO;

export const feedbackEmailEnabled = !!resendApiKey && !!fromAddress && !!feedbackTo;

export interface FeedbackEmailPayload {
  id: string;
  message: string;
  email: string | null;
  path: string | null;
  userId: string | null;
  userAgent: string | null;
}

export async function sendFeedbackNotification(payload: FeedbackEmailPayload): Promise<void> {
  if (!feedbackEmailEnabled) return;

  const subject = `Mistboard feedback (${payload.id.slice(0, 8)})`;
  const lines = [
    payload.message,
    '',
    '---',
    `From: ${payload.email ?? '(anonymous)'}`,
    `Path: ${payload.path ?? '(unknown)'}`,
    `User: ${payload.userId ?? '(guest)'}`,
    `UA:   ${payload.userAgent ?? '(unknown)'}`,
    `ID:   ${payload.id}`,
  ];

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [feedbackTo],
        subject,
        text: lines.join('\n'),
        ...(payload.email ? { reply_to: payload.email } : {}),
      }),
    });
    if (!response.ok) {
      console.error(JSON.stringify({
        level: 'error',
        kind: 'feedback_delivery_failure',
        provider: 'resend',
        status: response.status,
        at: Date.now(),
      }));
    }
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      kind: 'feedback_delivery_failure',
      provider: 'resend',
      error: (err as Error).message,
      at: Date.now(),
    }));
  }
}

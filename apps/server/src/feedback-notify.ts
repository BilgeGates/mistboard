const resendApiKey = process.env.RESEND_API_KEY;
// MISTBOARD_FEEDBACK_FROM lets feedback use a dedicated sender (e.g.
// feedback@mistboard.com) without disturbing the auth-email From. Falls back
// to the auth From so existing deploys keep working with no env change.
const fromAddress =
  process.env.MISTBOARD_FEEDBACK_FROM ??
  process.env.MISTBOARD_AUTH_EMAIL_FROM ??
  process.env.RESEND_FROM_EMAIL;
const feedbackTo = process.env.MISTBOARD_FEEDBACK_TO;

export const feedbackEmailEnabled = !!resendApiKey && !!fromAddress && !!feedbackTo;

export interface FeedbackEmailPayload {
  id: string;
  message: string;
  email: string | null;
  path: string | null;
  userId: string | null;
  userAgent: string | null;
  accountHandle: string | null;
  accountEmail: string | null;
}

export async function sendFeedbackNotification(payload: FeedbackEmailPayload): Promise<void> {
  if (!feedbackEmailEnabled) return;

  const isUserLane = payload.userId !== null;
  const lanePrefix = isUserLane ? '[USER]' : '[ANON]';
  const handleSuffix = isUserLane && payload.accountHandle ? ` @${payload.accountHandle}` : '';
  const subject = `${lanePrefix} Mistboard feedback${handleSuffix} (${payload.id.slice(0, 8)})`;

  // Logged-in lane: trust the verified account email for reply_to.
  // Anonymous lane: trust the optional user-supplied email (already
  // shape-validated upstream); skip reply_to if none was provided.
  const replyTo = isUserLane ? payload.accountEmail : payload.email;

  const fromLine = isUserLane
    ? `From: @${payload.accountHandle ?? '(no handle)'} <${payload.accountEmail ?? '(no email)'}>`
    : `From: ${payload.email ?? '(anonymous)'}`;

  const lines = [
    payload.message,
    '',
    '---',
    fromLine,
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
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!response.ok) {
      console.error(
        JSON.stringify({
          level: 'error',
          kind: 'feedback_delivery_failure',
          provider: 'resend',
          status: response.status,
          at: Date.now(),
        }),
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        kind: 'feedback_delivery_failure',
        provider: 'resend',
        error: (err as Error).message,
        at: Date.now(),
      }),
    );
  }
}

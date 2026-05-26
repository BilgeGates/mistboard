export type EngineAlertEmailPayload = {
  severity: 'critical' | 'warning';
  [field: string]: string | number | undefined;
};

type SendEngineAlertEmailResult =
  | { status: 'disabled' }
  | { status: 'throttled' }
  | { status: 'sent' }
  | { status: 'failed'; error?: string; statusCode?: number };

type SendOptions = {
  fetchImpl?: typeof fetch;
  nowMs?: number;
};

const resendApiKey = process.env.RESEND_API_KEY;
const alertEmailFrom =
  process.env.MISTBOARD_ALERT_EMAIL_FROM ??
  process.env.MISTBOARD_FEEDBACK_FROM ??
  process.env.MISTBOARD_AUTH_EMAIL_FROM ??
  process.env.RESEND_FROM_EMAIL;
const alertEmailTo = parseRecipients(
  process.env.MISTBOARD_ALERT_EMAIL_TO ?? process.env.MISTBOARD_FEEDBACK_TO,
);
const alertEmailMinIntervalMs = parsePositiveInt(
  process.env.MISTBOARD_ALERT_EMAIL_MIN_INTERVAL_MS,
  10 * 60 * 1000,
);
const lastEmailAtBySeverity = new Map<EngineAlertEmailPayload['severity'], number>();

export const engineAlertEmailEnabled = !!resendApiKey && !!alertEmailFrom && alertEmailTo.length > 0;

export async function sendEngineAlertNotification(
  alert: EngineAlertEmailPayload,
  options: SendOptions = {},
): Promise<SendEngineAlertEmailResult> {
  if (!engineAlertEmailEnabled) return { status: 'disabled' };

  const nowMs = options.nowMs ?? Date.now();
  const lastEmailAt = lastEmailAtBySeverity.get(alert.severity) ?? 0;
  if (nowMs - lastEmailAt < alertEmailMinIntervalMs) return { status: 'throttled' };
  lastEmailAtBySeverity.set(alert.severity, nowMs);

  const at = new Date(nowMs);
  const serviceName = currentServiceName();
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: alertEmailFrom,
        to: alertEmailTo,
        subject: engineAlertEmailSubject(alert, serviceName),
        text: engineAlertEmailText(alert, at, serviceName),
      }),
    });
    if (response.ok) return { status: 'sent' };
    return { status: 'failed', statusCode: response.status };
  } catch (err) {
    return { status: 'failed', error: (err as Error).message };
  }
}

export function engineAlertEmailSubject(
  alert: EngineAlertEmailPayload,
  serviceName = currentServiceName(),
): string {
  return `[Mistboard] ${alert.severity.toUpperCase()} engine alert (${serviceName})`;
}

export function engineAlertEmailText(
  alert: EngineAlertEmailPayload,
  at = new Date(),
  serviceName = currentServiceName(),
): string {
  const fields = Object.entries(alert).filter(
    ([key, value]) => key !== 'severity' && value !== undefined,
  );
  const fieldLines =
    fields.length > 0
      ? fields.map(([key, value]) => `- ${key}: ${String(value)}`)
      : ['- (no fields)'];

  return [
    'Mistboard emitted an engine alert.',
    '',
    `Severity: ${alert.severity}`,
    `Service: ${serviceName}`,
    `Time: ${at.toISOString()}`,
    '',
    'Fields:',
    ...fieldLines,
    '',
    'Suggested checks:',
    '- Search production logs for kind="engine_alert".',
    '- Run the production engine playout smoke from apps/server/README.md.',
  ].join('\n');
}

function currentServiceName(): string {
  return process.env.RAILWAY_SERVICE_NAME ?? process.env.MISTBOARD_SERVICE_NAME ?? 'unknown-service';
}

function parseRecipients(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((recipient) => recipient.trim())
    .filter((recipient) => recipient.length > 0);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

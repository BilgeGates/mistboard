import { sendTransactionalEmail, transactionalEmailConfigured } from './send-email.js';

export type EngineAlertEmailPayload = {
  severity: 'critical' | 'warning';
  [field: string]: string | number | undefined;
};

export type SendEngineAlertEmailResult =
  | { status: 'disabled' }
  | { status: 'throttled' }
  | { status: 'sent' }
  | { status: 'failed'; error?: string; statusCode?: number };

type SendOptions = {
  fetchImpl?: typeof fetch;
  nowMs?: number;
  serviceName?: string;
};

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
const lastEmailAtByKey = new Map<string, number>();

// Throttle independently per (alert_kind, severity) so an infra alert (memory /
// loop-lag) can't be masked by an unrelated engine alert sharing the same severity,
// and vice versa. Engine alerts carry no alert_kind → bucket "engine".
function alertThrottleKey(alert: EngineAlertEmailPayload): string {
  const kind = typeof alert.alert_kind === 'string' ? alert.alert_kind : 'engine';
  return `${kind}:${alert.severity}`;
}

export const engineAlertEmailEnabled =
  transactionalEmailConfigured && !!alertEmailFrom && alertEmailTo.length > 0;

export async function sendEngineAlertNotification(
  alert: EngineAlertEmailPayload,
  options: SendOptions = {},
): Promise<SendEngineAlertEmailResult> {
  if (!engineAlertEmailEnabled) return { status: 'disabled' };

  const nowMs = options.nowMs ?? Date.now();
  const throttleKey = alertThrottleKey(alert);
  const lastEmailAt = lastEmailAtByKey.get(throttleKey) ?? 0;
  if (nowMs - lastEmailAt < alertEmailMinIntervalMs) return { status: 'throttled' };
  lastEmailAtByKey.set(throttleKey, nowMs);

  const at = new Date(nowMs);
  const serviceName = options.serviceName ?? currentServiceName();
  const result = await sendTransactionalEmail(
    {
      from: alertEmailFrom as string,
      to: alertEmailTo,
      subject: engineAlertEmailSubject(alert, serviceName),
      text: engineAlertEmailText(alert, at, serviceName),
    },
    { fetchImpl: options.fetchImpl },
  );
  if (result.ok) return { status: 'sent' };
  return {
    status: 'failed',
    ...(result.statusCode !== undefined ? { statusCode: result.statusCode } : {}),
    ...(result.error !== undefined ? { error: result.error } : {}),
  };
}

export function engineAlertEmailSubject(
  alert: EngineAlertEmailPayload,
  serviceName = currentServiceName(),
): string {
  const kind = typeof alert.alert_kind === 'string' ? alert.alert_kind : 'engine';
  return `[Mistboard] ${alert.severity.toUpperCase()} ${kind} alert (${serviceName})`;
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
  return (
    process.env.RAILWAY_SERVICE_NAME ?? process.env.MISTBOARD_SERVICE_NAME ?? 'unknown-service'
  );
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

import { pathToFileURL } from 'node:url';
import {
  type EngineAlertEmailPayload,
  engineAlertEmailSubject,
  engineAlertEmailText,
  sendEngineAlertNotification,
} from './engine-alert-email.js';

type EngineAlertSeverity = EngineAlertEmailPayload['severity'];

export type EngineAlertEmailCliOptions = {
  send: boolean;
  severity: EngineAlertSeverity;
  serviceName: string;
  fields: Record<string, string | number>;
  nowMs: number;
};

export type ParsedEngineAlertEmailCliArgs =
  | { help: true }
  | { help: false; options: EngineAlertEmailCliOptions };

const DEFAULT_SERVICE_NAME = 'synthetic-alert-test';
const SYNTHETIC_ALERT_SOURCE = 'ops:test-engine-alert';
const FIELD_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_:-]*$/;

export function parseEngineAlertEmailCliArgs(
  args: string[],
  nowMs = Date.now(),
): ParsedEngineAlertEmailCliArgs {
  let send = false;
  let severity: EngineAlertSeverity = 'warning';
  let serviceName = DEFAULT_SERVICE_NAME;
  const fields: Record<string, string | number> = {};
  let alertNowMs = nowMs;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    if (arg === '--send') {
      send = true;
      continue;
    }
    if (arg === '--severity' || arg.startsWith('--severity=')) {
      const [value, nextIndex] = readOptionValue(args, index, '--severity');
      severity = parseSeverity(value);
      index = nextIndex;
      continue;
    }
    if (arg === '--service' || arg.startsWith('--service=')) {
      const [value, nextIndex] = readOptionValue(args, index, '--service');
      serviceName = parseServiceName(value);
      index = nextIndex;
      continue;
    }
    if (arg === '--field' || arg.startsWith('--field=')) {
      const [value, nextIndex] = readOptionValue(args, index, '--field');
      const [key, fieldValue] = parseField(value);
      fields[key] = fieldValue;
      index = nextIndex;
      continue;
    }
    if (arg === '--now' || arg.startsWith('--now=')) {
      const [value, nextIndex] = readOptionValue(args, index, '--now');
      alertNowMs = parseTimestamp(value);
      index = nextIndex;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return {
    help: false,
    options: {
      send,
      severity,
      serviceName,
      fields,
      nowMs: alertNowMs,
    },
  };
}

export function buildSyntheticEngineAlert(
  options: EngineAlertEmailCliOptions,
): EngineAlertEmailPayload {
  return {
    ...options.fields,
    synthetic: 1,
    source: SYNTHETIC_ALERT_SOURCE,
    severity: options.severity,
  };
}

export async function runEngineAlertEmailCli(args = process.argv.slice(2)): Promise<number> {
  let parsed: ParsedEngineAlertEmailCliArgs;
  try {
    parsed = parseEngineAlertEmailCliArgs(args);
  } catch (err) {
    console.error((err as Error).message);
    console.error(helpText());
    return 2;
  }

  if (parsed.help) {
    console.log(helpText());
    return 0;
  }

  const { options } = parsed;
  const alert = buildSyntheticEngineAlert(options);
  const at = new Date(options.nowMs);

  if (!options.send) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: 'dry-run',
          serviceName: options.serviceName,
          severity: options.severity,
          subject: engineAlertEmailSubject(alert, options.serviceName),
          text: engineAlertEmailText(alert, at, options.serviceName),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const result = await sendEngineAlertNotification(alert, {
    nowMs: options.nowMs,
    serviceName: options.serviceName,
  });
  const ok = result.status === 'sent';
  console.log(
    JSON.stringify(
      {
        ok,
        mode: 'send',
        serviceName: options.serviceName,
        severity: options.severity,
        result,
      },
      null,
      2,
    ),
  );

  if (result.status === 'disabled') {
    console.error(
      'Alert email is disabled; configure Resend plus alert sender and recipient before using --send.',
    );
  }
  return ok ? 0 : 1;
}

export function helpText(): string {
  return [
    'Usage: npm run ops:test-engine-alert -- [options]',
    '',
    'Sends or previews a synthetic engine_alert email payload.',
    '',
    'Options:',
    '  --send                    Post the email through the configured Resend account.',
    '  --severity <level>        warning or critical. Defaults to warning.',
    `  --service <name>          Service label in the email. Defaults to ${DEFAULT_SERVICE_NAME}.`,
    '  --field <key=value>       Extra alert field. Repeat for multiple fields.',
    '  --now <iso-timestamp>     Fixed timestamp for deterministic dry runs.',
    '  -h, --help                Show this help.',
    '',
    'The default mode is a dry run. Output reports status and rendered email text,',
    'but it never prints provider credentials or environment values.',
  ].join('\n');
}

function readOptionValue(args: string[], index: number, option: string): [string, number] {
  const arg = args[index];
  const inlinePrefix = `${option}=`;
  if (arg.startsWith(inlinePrefix)) {
    return [arg.slice(inlinePrefix.length), index];
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${option}`);
  }
  return [value, index + 1];
}

function parseSeverity(value: string): EngineAlertSeverity {
  if (value === 'critical' || value === 'warning') return value;
  throw new Error(`Invalid severity: ${value}`);
}

function parseServiceName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error('Service name cannot be empty');
  return trimmed;
}

function parseField(value: string): [string, string | number] {
  const separatorIndex = value.indexOf('=');
  if (separatorIndex <= 0) {
    throw new Error(`Invalid field: ${value}`);
  }

  const key = value.slice(0, separatorIndex).trim();
  if (!FIELD_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid field key: ${key}`);
  }
  if (key === 'severity') {
    throw new Error('Use --severity instead of --field severity=...');
  }

  const rawValue = value.slice(separatorIndex + 1).trim();
  const numericValue = Number(rawValue);
  if (rawValue.length > 0 && Number.isFinite(numericValue)) {
    return [key, numericValue];
  }
  return [key, rawValue];
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return timestamp;
}

const entrypointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entrypointUrl === import.meta.url) {
  runEngineAlertEmailCli().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (err) => {
      console.error((err as Error).message);
      process.exitCode = 1;
    },
  );
}

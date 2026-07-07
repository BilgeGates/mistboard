import { isIP } from 'node:net';

export type XiangqiBroadcastSourceUrlPolicy = {
  allowedHosts: readonly string[];
  allowLocal: boolean;
};

export type XiangqiBroadcastSourceUrlDecision =
  | { ok: true; url: URL; host: string }
  | {
      ok: false;
      reason:
        | 'invalid_url'
        | 'unsupported_protocol'
        | 'credentials_not_allowed'
        | 'local_source_not_allowed'
        | 'host_not_allowed';
      message: string;
    };

const ALLOWED_HOSTS_ENV = 'XIANGQI_BROADCAST_ALLOWED_SOURCE_HOSTS';
const ALLOW_LOCAL_ENV = 'XIANGQI_BROADCAST_ALLOW_LOCAL_SOURCES';

export function xiangqiBroadcastSourceUrlPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): XiangqiBroadcastSourceUrlPolicy {
  return {
    allowedHosts: parseAllowedHosts(env[ALLOWED_HOSTS_ENV]),
    allowLocal: env[ALLOW_LOCAL_ENV] === '1' || env.NODE_ENV !== 'production',
  };
}

export function validateXiangqiBroadcastSourceUrl(
  sourceUrl: string,
  policy: XiangqiBroadcastSourceUrlPolicy = xiangqiBroadcastSourceUrlPolicyFromEnv(),
): XiangqiBroadcastSourceUrlDecision {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return {
      ok: false,
      reason: 'invalid_url',
      message: 'source URL must be an absolute URL',
    };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'unsupported_protocol',
      message: 'source URL must use http or https',
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      reason: 'credentials_not_allowed',
      message: 'source URL must not include credentials',
    };
  }

  const host = normalizeHost(url.hostname);
  if (!host) {
    return {
      ok: false,
      reason: 'invalid_url',
      message: 'source URL must include a host',
    };
  }

  if (isLocalOrPrivateHost(host)) {
    if (policy.allowLocal) return { ok: true, url, host };
    return {
      ok: false,
      reason: 'local_source_not_allowed',
      message: 'local or private source URLs are not allowed',
    };
  }

  if (hostMatchesAllowedHosts(host, policy.allowedHosts)) return { ok: true, url, host };
  return {
    ok: false,
    reason: 'host_not_allowed',
    message: 'source URL host is not allowed',
  };
}

function parseAllowedHosts(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((entry) => normalizeAllowedHost(entry))
    .filter((entry) => entry.length > 0);
}

function normalizeAllowedHost(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('*.')) return `*.${normalizeHost(trimmed.slice(2))}`;
  if (trimmed.includes('://')) {
    try {
      return normalizeHost(new URL(trimmed).hostname);
    } catch {
      return '';
    }
  }
  return normalizeHost(trimmed);
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
}

function hostMatchesAllowedHosts(host: string, allowedHosts: readonly string[]): boolean {
  for (const allowed of allowedHosts) {
    if (allowed === host) return true;
    if (allowed.startsWith('*.') && host.endsWith(allowed.slice(1))) return true;
  }
  return false;
}

function isLocalOrPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const ipVersion = isIP(host);
  if (ipVersion === 4) return isPrivateIpv4(host);
  if (ipVersion === 6) return isPrivateIpv6(host);
  return false;
}

function isPrivateIpv4(host: string): boolean {
  const octets = host.split('.').map((part) => Number(part));
  const [a, b] = octets;
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

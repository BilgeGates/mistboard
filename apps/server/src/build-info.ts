const REVISION_ENV_KEYS = [
  'MISTBOARD_REVISION',
  'RAILWAY_GIT_COMMIT_SHA',
  'GITHUB_SHA',
  'VERCEL_GIT_COMMIT_SHA',
] as const;

const BUILD_TIME_ENV_KEYS = ['MISTBOARD_BUILD_AT', 'RAILWAY_DEPLOYMENT_CREATED_AT'] as const;

export type BuildInfo = {
  revision: string | null;
  builtAt: string | null;
};

export function getBuildInfo(): BuildInfo {
  return {
    revision: firstCleanEnv(REVISION_ENV_KEYS),
    builtAt: firstCleanEnv(BUILD_TIME_ENV_KEYS),
  };
}

function firstCleanEnv(keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

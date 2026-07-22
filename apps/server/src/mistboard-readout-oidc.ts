import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose';

export const MISTBOARD_READOUT_OIDC_AUDIENCE = 'https://mistboard.com/api/admin/readouts';
export const GITHUB_ACTIONS_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
export const GITHUB_READOUT_REPOSITORY = 'brianhliou/mistboard';
export const GITHUB_READOUT_REF = 'refs/heads/main';
export const GITHUB_READOUT_WORKFLOW = 'Mistboard Readout';

const githubJwks = createRemoteJWKSet(
  new URL('https://token.actions.githubusercontent.com/.well-known/jwks'),
);

export type MistboardReadoutOidcClaims = JWTPayload & {
  repository?: string;
  ref?: string;
  workflow?: string;
  event_name?: string;
};

export type MistboardReadoutTokenVerifier = (token: string) => Promise<MistboardReadoutOidcClaims>;

export const verifyGithubReadoutToken: MistboardReadoutTokenVerifier = async (token) => {
  const { payload } = await jwtVerify(token, githubJwks, {
    issuer: GITHUB_ACTIONS_OIDC_ISSUER,
    audience: MISTBOARD_READOUT_OIDC_AUDIENCE,
    algorithms: ['RS256'],
    clockTolerance: 5,
  });
  return payload as MistboardReadoutOidcClaims;
};

export function githubReadoutClaimsAllowed(claims: MistboardReadoutOidcClaims): boolean {
  const eventName = claims.event_name;
  return (
    claims.iss === GITHUB_ACTIONS_OIDC_ISSUER &&
    claims.aud === MISTBOARD_READOUT_OIDC_AUDIENCE &&
    claims.repository === GITHUB_READOUT_REPOSITORY &&
    claims.ref === GITHUB_READOUT_REF &&
    claims.workflow === GITHUB_READOUT_WORKFLOW &&
    typeof claims.sub === 'string' &&
    claims.sub.startsWith('repo:') &&
    claims.sub.endsWith(`:ref:${GITHUB_READOUT_REF}`) &&
    (eventName === 'schedule' || eventName === 'workflow_dispatch')
  );
}

export async function authorizeGithubReadoutBearer(
  authorization: string | string[] | undefined,
  verifier: MistboardReadoutTokenVerifier = verifyGithubReadoutToken,
): Promise<boolean> {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!header?.startsWith('Bearer ')) return false;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return false;
  try {
    return githubReadoutClaimsAllowed(await verifier(token));
  } catch {
    return false;
  }
}

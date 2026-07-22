import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeGithubReadoutBearer,
  GITHUB_ACTIONS_OIDC_ISSUER,
  GITHUB_READOUT_REF,
  GITHUB_READOUT_REPOSITORY,
  GITHUB_READOUT_WORKFLOW,
  githubReadoutClaimsAllowed,
  MISTBOARD_READOUT_OIDC_AUDIENCE,
  type MistboardReadoutOidcClaims,
} from './mistboard-readout-oidc.js';

const allowedClaims: MistboardReadoutOidcClaims = {
  iss: GITHUB_ACTIONS_OIDC_ISSUER,
  aud: MISTBOARD_READOUT_OIDC_AUDIENCE,
  sub: `repo:${GITHUB_READOUT_REPOSITORY}:ref:${GITHUB_READOUT_REF}`,
  repository: GITHUB_READOUT_REPOSITORY,
  ref: GITHUB_READOUT_REF,
  workflow: GITHUB_READOUT_WORKFLOW,
  event_name: 'schedule',
};

test('GitHub readout OIDC claims are bound to repo, main, workflow, and event', () => {
  assert.equal(githubReadoutClaimsAllowed(allowedClaims), true);
  assert.equal(
    githubReadoutClaimsAllowed({
      ...allowedClaims,
      sub: 'repo:brianhliou@123/mistboard@456:ref:refs/heads/main',
    }),
    true,
  );
  for (const claims of [
    { ...allowedClaims, repository: 'attacker/fork' },
    { ...allowedClaims, ref: 'refs/heads/feature' },
    { ...allowedClaims, workflow: 'CI' },
    { ...allowedClaims, event_name: 'pull_request' },
    { ...allowedClaims, aud: 'https://attacker.example/readout' },
  ]) {
    assert.equal(githubReadoutClaimsAllowed(claims), false);
  }
});

test('bearer authorization fails closed and delegates signature verification', async () => {
  assert.equal(await authorizeGithubReadoutBearer(undefined, async () => allowedClaims), false);
  assert.equal(await authorizeGithubReadoutBearer('Basic token', async () => allowedClaims), false);
  assert.equal(
    await authorizeGithubReadoutBearer('Bearer signed-token', async (token) => {
      assert.equal(token, 'signed-token');
      return allowedClaims;
    }),
    true,
  );
  assert.equal(
    await authorizeGithubReadoutBearer('Bearer invalid', async () => {
      throw new Error('bad signature');
    }),
    false,
  );
});

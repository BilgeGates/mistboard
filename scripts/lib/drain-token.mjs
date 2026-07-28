import { execFileSync } from 'node:child_process';

// Where the drain token lives when it isn't in the environment. A release that
// has to interrupt live games needs the token, and typing it into a shell (or
// pasting it into an agent session) puts a production secret somewhere it can
// be logged, scrolled back, or captured in a transcript. The macOS Keychain
// keeps it out of the tree, out of shell history, and out of any log: this
// module reads it at invocation time and hands it straight to the request.
//
// Same shape as the `railway()` wrapper in ~/.zshrc, which injects
// RAILWAY_API_TOKEN at call time rather than exporting it into the shell.
//
// Store it once (the -w flag prompts, so the value never lands in history):
//   security add-generic-password -a "$USER" -s mistboard-drain-token -w
// Rotate it by deleting and re-adding:
//   security delete-generic-password -s mistboard-drain-token
export const DRAIN_TOKEN_KEYCHAIN_SERVICE = 'mistboard-drain-token';

/**
 * The drain token, or null when neither source has one.
 *
 * NEVER log, print, or echo the return value. Callers pass it to an
 * Authorization header or hand it to a child process through env, never argv
 * (argv is visible in `ps`).
 */
export function resolveDrainToken() {
  const fromEnv = process.env.MISTBOARD_DRAIN_TOKEN;
  if (fromEnv) return fromEnv;
  return readKeychainToken();
}

/** Which source answered, for messages that must not name the value itself. */
export function drainTokenSource() {
  if (process.env.MISTBOARD_DRAIN_TOKEN) return 'env';
  return readKeychainToken() ? 'keychain' : null;
}

function readKeychainToken() {
  // Non-macOS, no Keychain entry, or a locked keychain all land here. The
  // caller's job is to explain how to set one up; ours is to stay quiet,
  // because `security` writes the item's metadata to stderr on some paths.
  try {
    const out = execFileSync(
      'security',
      ['find-generic-password', '-w', '-s', DRAIN_TOKEN_KEYCHAIN_SERVICE],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

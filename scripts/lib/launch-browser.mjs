// Shared Chromium launcher for the smoke and capture scripts.
//
// Agent harnesses run shell commands inside a macOS seatbelt sandbox, and the
// profiles they use deny `mach-register`. Chromium's browser process calls
// bootstrap_check_in() at startup to register the Mach service it uses to hand
// ports to its child processes, so under that denial it dies before the first
// page loads:
//
//   [pid=8193][err] [FATAL:base/apple/mach_port_rendezvous_mac.cc:159]
//       Check failed: kr == KERN_SUCCESS. bootstrap_
//   browserType.launch: Target page, context or browser has been closed
//
// Playwright's own message names none of that, and it arrives under forty
// lines of Chromium flags, so it reads like a flaky browser. Agents have
// repeatedly written the ceval smoke off as "optional" or "unrelated" on the
// strength of it and shipped past a real release gate. Translate the failure
// into the one sentence that resolves it.
//
// Note the trap: every call site already passes `--no-sandbox`, and it does
// not help. That flag disables Chromium's *own* renderer sandbox; the denial
// comes from the outer seatbelt the harness wraps the process in.
import { chromium } from '@playwright/test';

// Signatures of the sandbox wall, matched against the whole Playwright error
// (its `Browser logs:` section carries the child's stderr). Deliberately keyed
// on the Mach failure rather than on Playwright's generic closed-target text,
// which also covers ordinary crashes.
const SANDBOX_LAUNCH_SIGNATURES = [
  /mach_port_rendezvous/i,
  /Check failed: kr == KERN_SUCCESS/i,
  /bootstrap_check_in/i,
  /sandbox_mac\.mm/i,
  /Failed to initialize sandbox/i,
];

export const SANDBOX_LAUNCH_MESSAGE = [
  'Chromium could not start: the macOS sandbox this process runs under denied',
  'its Mach bootstrap registration.',
  '',
  'This is a permission wall, not a flaky browser, and not an optional check.',
  'Re-run the same command with escalated (unsandboxed) permissions:',
  '  - Codex: approve the escalation prompt, or pre-approve the command prefix',
  '  - Claude Code: re-issue the Bash call with the sandbox disabled',
  '  - a plain terminal outside any agent harness always works',
  '',
  "Passing --no-sandbox does not help. It disables Chromium's own renderer",
  'sandbox, not the outer macOS seatbelt that produced this failure.',
].join('\n');

// True when `error` is the sandbox wall rather than a genuine browser crash.
export function isSandboxLaunchFailure(error) {
  const text = launchErrorText(error);
  return SANDBOX_LAUNCH_SIGNATURES.some((signature) => signature.test(text));
}

// Playwright folds the browser's stderr into `message`, but read `stack` too so
// a wrapped or re-thrown error still matches.
function launchErrorText(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return `${error.message ?? ''}\n${error.stack ?? ''}`;
}

// Drop-in for `chromium.launch`. Applies the `--no-sandbox` every call site
// wants, and rewrites the sandbox wall into an actionable error while keeping
// the original as `cause` so the raw Chromium logs stay available.
export async function launchChromium({ args = [], ...options } = {}) {
  try {
    return await chromium.launch({ args: ['--no-sandbox', ...args], ...options });
  } catch (error) {
    if (!isSandboxLaunchFailure(error)) throw error;
    throw new Error(SANDBOX_LAUNCH_MESSAGE, { cause: error });
  }
}

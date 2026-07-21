import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import {
  type ElephantChessPilotManifest,
  verifyElephantChessPilotManifest,
} from './elephantchess-pilot-manifest.js';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function requireSha256(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`${label} must be a lowercase SHA-256`);
  return normalized;
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function readPinnedArtifact(input: {
  path: string;
  expectedSha256: string;
  label: string;
}): Promise<{ path: string; name: string; sha256: string; bytes: Buffer }> {
  const path = resolve(input.path);
  const expected = requireSha256(input.expectedSha256, `${input.label} expected hash`);
  const bytes = await readFile(path);
  const sha256 = sha256Bytes(bytes);
  if (sha256 !== expected) {
    throw new Error(`${input.label} hash mismatch: expected ${expected}, got ${sha256}`);
  }
  return { path, name: basename(path), sha256, bytes };
}

export async function readPinnedElephantChessPilotManifest(input: {
  path: string;
  expectedFileSha256: string;
  expectedContentSha256: string;
}): Promise<{
  manifest: ElephantChessPilotManifest;
  path: string;
  name: string;
  fileSha256: string;
}> {
  const artifact = await readPinnedArtifact({
    path: input.path,
    expectedSha256: input.expectedFileSha256,
    label: 'pilot manifest file',
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(artifact.bytes.toString('utf8')) as unknown;
  } catch (error) {
    throw new Error(`pilot manifest is not valid JSON: ${(error as Error).message}`);
  }
  const manifest = verifyElephantChessPilotManifest(parsed);
  const expectedContentSha256 = requireSha256(
    input.expectedContentSha256,
    'pilot manifest expected content hash',
  );
  if (manifest.manifestSha256 !== expectedContentSha256) {
    throw new Error(
      `pilot manifest identity mismatch: expected ${expectedContentSha256}, got ${manifest.manifestSha256}`,
    );
  }
  return {
    manifest,
    path: artifact.path,
    name: artifact.name,
    fileSha256: artifact.sha256,
  };
}

export async function probePikafishUciIdentity(
  binary: string,
  timeoutMs = 10_000,
): Promise<{ name: string; author: string | null }> {
  const path = resolve(binary);
  return new Promise((resolveIdentity, rejectIdentity) => {
    const process = spawn(path, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    let buffer = '';
    let name: string | null = null;
    let author: string | null = null;
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        process.kill();
        rejectIdentity(error);
        return;
      }
      process.stdin.write('quit\n');
      resolveIdentity({ name: name as string, author });
    };
    const timer = setTimeout(
      () => finish(new Error(`Pikafish UCI identity probe timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    timer.unref();
    process.on('error', (error) => finish(new Error(`could not start Pikafish: ${error.message}`)));
    process.on('exit', (code) => {
      if (!settled) finish(new Error(`Pikafish exited before uciok with code ${String(code)}`));
    });
    process.stdout.setEncoding('utf8');
    process.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('id name ')) name = line.slice('id name '.length).trim();
        if (line.startsWith('id author ')) author = line.slice('id author '.length).trim();
        if (line === 'uciok') {
          if (!name) finish(new Error('Pikafish UCI response omitted id name'));
          else finish();
          return;
        }
        newline = buffer.indexOf('\n');
      }
    });
    process.stdin.write('uci\n');
  });
}

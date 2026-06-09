// Fairy-Stockfish move provider for perfect-information Dual Chess.
//
// FSF plays the variant natively (loaded from dual-chess.ini), so it is a free,
// strong opponent for the open mode. Per the AI-serving decision this lives
// server-side behind a small move provider — NOT the Obscuro engine-worker (the
// fog engine), which speaks a different, redaction-shaped protocol. For now it
// spawns one FSF process per request (stateless, robust; FSF starts in ~100ms),
// which is plenty for turn-based local play. Promote to a persistent process or
// its own service only under real load (the task-#92 trigger).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VARIANT = 'dualchess';

// Resolve the FSF binary: explicit env override, else the known dev location.
export function fairyStockfishPath(): string {
  const explicit = process.env.MISTBOARD_FSF_PATH;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(`MISTBOARD_FSF_PATH points at ${resolved} but the binary does not exist`);
    }
    return resolved;
  }
  const home = process.env.HOME;
  if (home) {
    const dev = resolve(home, 'projects', 'tools', 'fairy-stockfish', 'src', 'stockfish');
    if (existsSync(dev)) return dev;
  }
  for (const candidate of [
    resolve(process.cwd(), 'bin', 'fairy-stockfish'),
    '/usr/local/bin/fairy-stockfish',
    '/usr/bin/fairy-stockfish',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Fairy-Stockfish binary not found. Set MISTBOARD_FSF_PATH.');
}

// dual-chess.ini lives in src/; tsc does not copy it to dist/, so look in both
// the tsx-dev (src) and built (dist -> ../src) locations.
export function dualChessVariantIniPath(): string {
  const candidates = [
    resolve(HERE, 'dual-chess.ini'),
    resolve(HERE, '..', 'src', 'dual-chess.ini'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`dual-chess.ini not found (looked in ${candidates.join(', ')})`);
}

/**
 * Ask Fairy-Stockfish for a move given the UCI move history from the start
 * position. Returns the UCI move (e.g. "d2d3", "a7a8q") or null if there is no
 * move (game already over). Callers MUST pre-validate each move string — it is
 * written to the engine's stdin.
 */
export type DualChessEngineOptions = { movetimeMs?: number; skill?: number };

export function dualChessEngineMove(
  moves: string[],
  opts: DualChessEngineOptions = {},
): Promise<string | null> {
  const fsf = fairyStockfishPath();
  const ini = dualChessVariantIniPath();
  const movetimeMs = opts.movetimeMs ?? 500;
  // Fairy-Stockfish Skill Level: 0 (weakest) .. 20 (full strength).
  const skill = opts.skill === undefined ? null : Math.max(0, Math.min(20, Math.floor(opts.skill)));

  return new Promise<string | null>((resolveMove, reject) => {
    const child = spawn(fsf, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    let settled = false;

    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      run();
    };

    const timer = setTimeout(
      () => finish(() => reject(new Error('fsf move timed out'))),
      movetimeMs + 4000,
    );

    child.on('error', (err) => finish(() => reject(err)));
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let newline = buf.indexOf('\n');
      while (newline >= 0) {
        const line = buf.slice(0, newline).trim();
        buf = buf.slice(newline + 1);
        if (line.startsWith('bestmove')) {
          const move = line.split(/\s+/)[1];
          finish(() => resolveMove(move && move !== '(none)' ? move : null));
          return;
        }
        newline = buf.indexOf('\n');
      }
    });

    const position =
      moves.length > 0 ? `position startpos moves ${moves.join(' ')}` : 'position startpos';
    const commands = [
      'uci',
      `setoption name VariantPath value ${ini}`,
      `setoption name UCI_Variant value ${VARIANT}`,
      ...(skill === null ? [] : [`setoption name Skill Level value ${skill}`]),
      'ucinewgame',
      'isready',
      position,
      `go movetime ${movetimeMs}`,
    ];
    child.stdin.write(`${commands.join('\n')}\n`);
  });
}

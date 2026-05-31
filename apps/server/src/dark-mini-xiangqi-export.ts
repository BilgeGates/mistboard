// JSON publication export for Dark Mini Xiangqi.
//
// The chess buildGamePublicationJson cannot be reused: it derives SAN via the
// chess-only algebraicMoveLabels and labels players white/black. Dark Mini Xiangqi
// is genuinely red/black (persisted as red-wins/black-wins with red/black
// participants), so this builder emits an honest red/black publication. Moves are
// coordinate UCI (from+to, e.g. "b1b2"); xiangqi has no SAN/PGN standard, which is
// why PGN export is intentionally not offered for this variant.

import type { MiniXiangqiColor } from '@mistboard/game';
import type { DarkMiniXiangqiEvent } from './dark-mini-xiangqi-runtime.js';
import { DEFAULT_SITE_HOST, LICENSE, SCHEMA_VERSION, SITE_NAME } from './game-export.js';
import type { GameParticipant, RecentEveGameRecord } from './persistence.js';

export type MiniXiangqiPublicationPly = {
  ply: number;
  mover: MiniXiangqiColor;
  uci: string;
  red_clock_ms_after: number | null;
  black_clock_ms_after: number | null;
};

export type DarkMiniXiangqiPublication = {
  schema_version: string;
  game_id: string;
  source: { name: string; url: string; game_url: string };
  variant: string;
  mode: string;
  time_control: { initial_ms: number | null; increment_ms: number | null; label: string };
  players: { red: { handle: string | null }; black: { handle: string | null } };
  started_at: string;
  ended_at: string;
  result: string;
  termination: string;
  ply_count: number;
  license: string;
  plies: MiniXiangqiPublicationPly[];
};

function participantName(summary: RecentEveGameRecord, color: MiniXiangqiColor): string | null {
  const participant = summary.participants.find((p: GameParticipant) => p.color === color);
  return participant?.displayName ?? null;
}

function timeControlLabel(initialMs: number | null, incrementMs: number | null): string {
  if (initialMs == null) return 'untimed';
  return `${Math.round(initialMs / 1000)}+${Math.round((incrementMs ?? 0) / 1000)}`;
}

// Time control lives on the room-created event; fall back to the games-row columns
// if the event log predates it.
function timeControlFor(
  summary: RecentEveGameRecord,
  events: DarkMiniXiangqiEvent[],
): { initial_ms: number | null; increment_ms: number | null; label: string } {
  const created = events.find((event) => event.type === 'room-created');
  const tc = created?.type === 'room-created' ? created.timeControl : undefined;
  const initial = tc?.initialMs ?? summary.initialMs ?? null;
  const increment = tc?.incrementMs ?? summary.incrementMs ?? null;
  return {
    initial_ms: initial,
    increment_ms: increment,
    label: timeControlLabel(initial, increment),
  };
}

function normalizeResult(result: string): string {
  if (result === 'red-wins') return 'red';
  if (result === 'black-wins') return 'black';
  return 'draw';
}

function plyList(events: DarkMiniXiangqiEvent[]): MiniXiangqiPublicationPly[] {
  const plies: MiniXiangqiPublicationPly[] = [];
  let ply = 0;
  for (const event of events) {
    if (event.type !== 'move-played') continue;
    ply += 1;
    plies.push({
      ply,
      mover: event.color,
      uci: `${event.move.from}${event.move.to}`,
      red_clock_ms_after: event.clock?.remainingMs.red ?? null,
      black_clock_ms_after: event.clock?.remainingMs.black ?? null,
    });
  }
  return plies;
}

export function buildDarkMiniXiangqiPublicationJson(
  summary: RecentEveGameRecord,
  events: DarkMiniXiangqiEvent[],
): DarkMiniXiangqiPublication {
  return {
    schema_version: SCHEMA_VERSION,
    game_id: summary.roomId,
    source: {
      name: SITE_NAME,
      url: DEFAULT_SITE_HOST,
      game_url: `${DEFAULT_SITE_HOST}/dark-mini-xiangqi/game/${summary.roomId}`,
    },
    variant: summary.variant,
    mode: summary.mode,
    time_control: timeControlFor(summary, events),
    players: {
      red: { handle: participantName(summary, 'red') },
      black: { handle: participantName(summary, 'black') },
    },
    started_at: summary.startedAt.toISOString(),
    ended_at: summary.endedAt.toISOString(),
    result: normalizeResult(summary.result),
    termination: summary.termination,
    ply_count: summary.plyCount,
    license: LICENSE,
    plies: plyList(events),
  };
}

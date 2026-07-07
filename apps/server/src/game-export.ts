import { algebraicMoveLabels, type Color, type GameEvent, type Move } from '@mistboard/game';
import type { GameParticipant, RecentEveGameRecord } from './persistence.js';

export const SCHEMA_VERSION = '1.0';
export const LICENSE = 'CC BY 4.0';
export const DEFAULT_SITE_HOST = 'https://mistboard.com';
export const SITE_NAME = 'Mistboard';

export type PublicationPly = {
  ply: number;
  mover: Color;
  uci: string;
  san: string;
  white_clock_ms_after: number | null;
  black_clock_ms_after: number | null;
};

export type GamePublication = {
  schema_version: string;
  game_id: string;
  source: {
    name: string;
    url: string;
    game_url: string;
  };
  variant: string;
  mode: string;
  time_control: {
    initial_ms: number | null;
    increment_ms: number | null;
    label: string;
  };
  players: {
    white: { handle: string | null };
    black: { handle: string | null };
  };
  started_at: string;
  ended_at: string;
  result: string;
  termination: string;
  ply_count: number;
  license: string;
  plies: PublicationPly[];
};

function participantByColor(
  summary: RecentEveGameRecord,
  color: Color,
): GameParticipant | undefined {
  return summary.participants.find((p) => p.color === color);
}

// games.white_name / games.black_name are written as null at room creation and
// never backfilled for live games; the actual display name lives in
// game_participants.display_name. Prefer that, then fall back.
function displayNameForColor(summary: RecentEveGameRecord, color: Color): string | null {
  const participantName = participantByColor(summary, color)?.displayName ?? null;
  if (participantName) return participantName;
  return color === 'white' ? summary.whiteName : summary.blackName;
}

function moveToUci(move: Move): string {
  const promo = move.promotion
    ? ({ queen: 'q', rook: 'r', bishop: 'b', knight: 'n' }[move.promotion] ?? '')
    : '';
  return `${move.from}${move.to}${promo}`;
}

function timeControlFromSummary(summary: RecentEveGameRecord): {
  initial_ms: number | null;
  increment_ms: number | null;
  label: string;
} {
  // PvP/PvE games store time control in games.initial_ms / games.increment_ms.
  // EvE games carry an additional eve_games.time_control JSON. Prefer the
  // games-table values when present, fall back to the EvE JSON otherwise.
  let initial = summary.initialMs ?? null;
  let increment = summary.incrementMs ?? null;
  if (initial == null) {
    const raw = summary.timeControl ?? {};
    const initialMsValue = (raw as Record<string, unknown>).initialMs;
    const incrementMsValue = (raw as Record<string, unknown>).incrementMs;
    if (typeof initialMsValue === 'number') initial = initialMsValue;
    if (typeof incrementMsValue === 'number') increment = incrementMsValue;
  }
  return {
    initial_ms: initial,
    increment_ms: increment,
    label: timeControlLabel(initial, increment),
  };
}

function timeControlLabel(initialMs: number | null, incrementMs: number | null): string {
  if (initialMs == null) return 'untimed';
  const initialS = Math.round(initialMs / 1000);
  const incS = Math.round((incrementMs ?? 0) / 1000);
  return `${initialS}+${incS}`;
}

function plyListFromEvents(events: GameEvent[], roomId: string): PublicationPly[] {
  const labels = algebraicMoveLabels(events, roomId);
  const plies: PublicationPly[] = [];
  let plyIndex = 0;
  for (const [index, event] of events.entries()) {
    if (event.type !== 'move-played') continue;
    plyIndex += 1;
    plies.push({
      ply: plyIndex,
      mover: event.color,
      uci: moveToUci(event.move),
      san: labels.get(index + 1) ?? '',
      white_clock_ms_after: event.clock?.remainingMs.white ?? null,
      black_clock_ms_after: event.clock?.remainingMs.black ?? null,
    });
  }
  return plies;
}

export function buildGamePublicationJson(
  summary: RecentEveGameRecord,
  events: GameEvent[],
): GamePublication {
  return {
    schema_version: SCHEMA_VERSION,
    game_id: summary.roomId,
    source: {
      name: SITE_NAME,
      url: DEFAULT_SITE_HOST,
      game_url: `${DEFAULT_SITE_HOST}/game/${summary.roomId}`,
    },
    variant: summary.variant,
    mode: summary.mode,
    time_control: timeControlFromSummary(summary),
    players: {
      white: { handle: displayNameForColor(summary, 'white') },
      black: { handle: displayNameForColor(summary, 'black') },
    },
    started_at: summary.startedAt.toISOString(),
    ended_at: summary.endedAt.toISOString(),
    result: normalizeJsonResult(summary.result),
    termination: summary.termination,
    ply_count: summary.plyCount,
    license: LICENSE,
    plies: plyListFromEvents(events, summary.roomId),
  };
}

function pgnResult(result: string): string {
  if (result === 'white-wins') return '1-0';
  if (result === 'black-wins') return '0-1';
  if (result === 'draw') return '1/2-1/2';
  return '*';
}

function normalizeJsonResult(result: string): string {
  if (result === 'white-wins') return 'white';
  if (result === 'black-wins') return 'black';
  if (result === 'draw') return 'draw';
  return result;
}

function pgnVariantName(variant: string): string {
  if (variant === 'dark-chess') return 'Fog Chess';
  if (variant === 'draft960') return 'Draft960 (Fog Chess + Chess960)';
  return variant;
}

// Map Mistboard's internal termination vocabulary onto the PGN standard set
// (the original value is preserved in [MistboardTermination "..."]).
// Standard PGN values: normal, abandoned, time forfeit, adjudication, death,
// emergency, rules infraction, unterminated.
function pgnStandardTermination(termination: string): string {
  switch (termination) {
    case 'king-captured':
    case 'checkmate':
    case 'resignation':
    case 'draw':
    case 'no-legal-moves':
      return 'normal';
    case 'timeout':
      return 'time forfeit';
    case 'engine-failure':
      return 'adjudication';
    case 'worker-aborted':
    case 'server-restarted':
    case 'abandoned':
      return 'abandoned';
    case 'truncated':
      return 'unterminated';
    default:
      return 'normal';
  }
}

function pgnEventName(mode: string): string {
  if (mode === 'pvp') return 'Mistboard Casual';
  if (mode === 'pve') return 'Mistboard PvE';
  if (mode === 'eve') return 'Mistboard EvE';
  return `Mistboard ${mode}`;
}

function escapePgnHeader(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildPgnHeaders(summary: RecentEveGameRecord, siteOrigin: string): string[] {
  const date = summary.startedAt.toISOString().slice(0, 10).replace(/-/g, '.');
  const tc = timeControlFromSummary(summary);
  const termination = summary.termination ?? '';
  const headers: Array<[string, string]> = [
    ['Event', pgnEventName(summary.mode)],
    ['Site', `${siteOrigin}/game/${summary.roomId}`],
    ['Date', date],
    ['Round', '-'],
    ['White', displayNameForColor(summary, 'white') ?? '?'],
    ['Black', displayNameForColor(summary, 'black') ?? '?'],
    ['Result', pgnResult(summary.result)],
    ['Variant', pgnVariantName(summary.variant)],
    ['MistboardVariant', summary.variant],
    ['TimeControl', tc.label],
    ['Termination', pgnStandardTermination(termination)],
    ['MistboardTermination', termination],
    ['License', LICENSE],
    ['MistboardSchema', SCHEMA_VERSION],
  ];
  return headers.map(([k, v]) => `[${k} "${escapePgnHeader(String(v))}"]`);
}

export function buildGamePgn(
  summary: RecentEveGameRecord,
  events: GameEvent[],
  siteOrigin: string = DEFAULT_SITE_HOST,
): string {
  const labels = algebraicMoveLabels(events, summary.roomId);
  const tokens: string[] = [];
  let ply = 0;
  for (const [index, event] of events.entries()) {
    if (event.type !== 'move-played') continue;
    ply += 1;
    const san = labels.get(index + 1) ?? '';
    if (ply % 2 === 1) {
      tokens.push(`${Math.ceil(ply / 2)}. ${san}`);
    } else {
      tokens.push(san);
    }
  }
  const headers = buildPgnHeaders(summary, siteOrigin);
  const result = pgnResult(summary.result);
  const moveText = tokens.length > 0 ? `${tokens.join(' ')} ${result}` : result;
  return `${headers.join('\n')}\n\n${moveText}\n`;
}

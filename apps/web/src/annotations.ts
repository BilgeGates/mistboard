/**
 * Curated failure-mode / reinforcement tags. The form renders these as chips.
 * Free-form tags can still be added; the scorer treats anything not in this
 * list as ad-hoc and bucketed separately.
 *
 * Categories:
 *  - negative: a flaw the engine should fix
 *  - positive: behaviour the engine got right (reinforces an architectural choice)
 *  - meta:     not a Tier-1 strength signal (e.g., opponent move)
 */
export const CURATED_TAGS: Array<{
  tag: string;
  kind: 'negative' | 'positive' | 'meta';
  hint: string;
}> = [
  {
    tag: 'aggregation-dilution',
    kind: 'negative',
    hint: 'Truth particle was likely present but its move got drowned out by other particles.',
  },
  {
    tag: 'belief-collapse',
    kind: 'negative',
    hint: 'Truth particle missing from the belief set entirely.',
  },
  {
    tag: 'visibility-threat-undershot',
    kind: 'negative',
    hint: 'P2.1 visibility-threat metric should have penalized this but did not.',
  },
  {
    tag: 'missed-hanging-capture',
    kind: 'negative',
    hint: "Tier-1 had a visible piece attacking opponent's queen/rook and didn't capture.",
  },
  {
    tag: 'missed-hanging-save',
    kind: 'negative',
    hint: 'Tier-1 had a piece visibly under attack and failed to defend or move it.',
  },
  {
    tag: 'missed-info-gain',
    kind: 'negative',
    hint: 'Skipped a move that would have captured material AND increased visibility.',
  },
  {
    tag: 'repetition',
    kind: 'negative',
    hint: 'Played the same wrong idea twice; missing diversification when belief unchanged.',
  },
  {
    tag: 'fog-aware-good',
    kind: 'positive',
    hint: 'Move only makes sense given correct fog-inferred belief — validates the belief filter.',
  },
  {
    tag: 'prior-soundness',
    kind: 'positive',
    hint: 'Stockfish-shallow prior produced principled chess — validates the evaluator choice.',
  },
  {
    tag: 'opponent-blunder',
    kind: 'meta',
    hint: 'Move was opponent (random); not a Tier-1 strength signal.',
  },
];

export type Annotation = {
  id: string;
  created_at: string;
  manifest_url: string;
  game_path: string;
  game_index: number;
  ply: number;
  move_played_uci: string;
  move_played_color: 'white' | 'black';
  is_tier1_move: boolean;
  board_fen_after: string;
  severity: 'major' | 'minor' | 'good' | 'neutral';
  tags: string[];
  suggested_move_uci: string | null;
  note: string;
};

export type AnnotationContext = {
  manifestUrl: string;
  gamePath: string;
  gameIndex: number;
  ply: number;
  movePlayedUci: string;
  movePlayedColor: 'white' | 'black';
  isTier1Move: boolean;
  boardFenAfter: string;
};

export async function loadAnnotations(): Promise<Annotation[]> {
  try {
    const resp = await fetch('/api/annotations');
    if (!resp.ok) return [];
    const data = (await resp.json()) as { annotations?: Annotation[] };
    return data.annotations ?? [];
  } catch {
    return [];
  }
}

export async function saveAnnotation(a: Annotation): Promise<void> {
  const resp = await fetch('/api/annotations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(a),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`save failed (${resp.status}): ${text}`);
  }
}

export async function updateAnnotation(a: Annotation): Promise<void> {
  const resp = await fetch('/api/annotations', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(a),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`update failed (${resp.status}): ${text}`);
  }
}

export async function deleteAnnotation(id: string): Promise<void> {
  const resp = await fetch('/api/annotations', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`delete failed (${resp.status}): ${text}`);
  }
}

export function buildAnnotationFromForm(
  ctx: AnnotationContext,
  form: {
    severity: 'major' | 'minor' | 'good' | 'neutral';
    better: string;
    note: string;
  },
): Annotation {
  return {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    manifest_url: ctx.manifestUrl,
    game_path: ctx.gamePath,
    game_index: ctx.gameIndex,
    ply: ctx.ply,
    move_played_uci: ctx.movePlayedUci,
    move_played_color: ctx.movePlayedColor,
    is_tier1_move: ctx.isTier1Move,
    board_fen_after: ctx.boardFenAfter,
    severity: form.severity,
    tags: [],
    suggested_move_uci: form.better.trim() || null,
    note: form.note.trim(),
  };
}

export function formatAnnotationLine(a: Annotation): string {
  const sev =
    a.severity === 'major'
      ? '●'
      : a.severity === 'good'
        ? '★'
        : a.severity === 'neutral'
          ? '◇'
          : '○';
  const better = a.suggested_move_uci ? ` → ${a.suggested_move_uci}` : '';
  const tags = a.tags.length ? ` [${a.tags.join(', ')}]` : '';
  const note = a.note ? ` ${a.note}` : '';
  return `${sev} ply ${a.ply} ${a.move_played_uci}${better}${tags}${note}`;
}

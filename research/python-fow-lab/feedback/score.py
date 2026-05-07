"""
Score the feedback corpus against the bake-off it covers.

Reads:
    feedback/annotations.jsonl
    apps/web/public/<manifest_url> for each manifest referenced

Reports per bake-off:
    - severity counts (major/minor/good) with /100 Tier-1 plies normalization
    - tag counts (curated failure-mode tags + free-form tags)
    - per-game critique density

Usage:
    .venv/bin/python3 -m feedback.score                  # from python-fow-lab/
    .venv/bin/python3 research/python-fow-lab/feedback/score.py  # from repo root
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

# Resolve repo root from this file's location.
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
ANNOTATIONS_FILE = HERE / 'annotations.jsonl'
WEB_PUBLIC = REPO / 'apps' / 'web' / 'public'

POSITIVE_TAGS = {'fog-aware-good', 'prior-soundness'}
META_TAGS = {'opponent-blunder'}


def load_annotations() -> list[dict]:
    if not ANNOTATIONS_FILE.exists():
        return []
    rows = []
    with ANNOTATIONS_FILE.open() as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def load_manifest(manifest_url: str) -> dict | None:
    rel = manifest_url.lstrip('/')
    path = WEB_PUBLIC / rel
    if not path.exists():
        return None
    return json.loads(path.read_text())


def tier1_ply_count(manifest: dict) -> int:
    total = 0
    for g in manifest['games']:
        n = g['plies']
        if g['tier1_color'] == 'white':
            total += (n + 1) // 2
        else:
            total += n // 2
    return total


def report_one_manifest(manifest_url: str, items: list[dict]) -> None:
    print(f'=== {manifest_url} ===')
    manifest = load_manifest(manifest_url)
    if manifest is None:
        print(f'  manifest not found at {WEB_PUBLIC / manifest_url.lstrip("/")}')
        print()
        return

    games_total = len(manifest['games'])
    tier1_plies = tier1_ply_count(manifest)
    version = manifest.get('tier1_version', '0.1.0?')
    commit = manifest.get('tier1_commit', '?')
    config = (
        f"eval={manifest.get('evaluator')} "
        f"depth={manifest.get('depth')} "
        f"mp={manifest.get('max_particles')} "
        f"target_n={manifest.get('target_n')} "
        f"seed={manifest.get('base_seed')}"
    )
    print(f'  Tier-1 v{version}  ({commit})')
    print(f'  config: {config}')
    print(f'  games: {games_total}, total Tier-1 plies: {tier1_plies}')
    print()

    tier1_items = [a for a in items if a['is_tier1_move']]
    other_items = [a for a in items if not a['is_tier1_move']]

    games_covered = sorted({a['game_index'] for a in items})
    games_with_tier1_critique = sorted({a['game_index'] for a in tier1_items})
    print(
        f'  annotations: {len(items)} '
        f'({len(tier1_items)} on Tier-1 plies across {len(games_with_tier1_critique)} game(s), '
        f'{len(other_items)} on opponent plies)'
    )
    print(f'  games covered: {[i + 1 for i in games_covered]}')
    print()

    # --- Severity, /100p normalized
    sev_counter = Counter(a['severity'] for a in tier1_items)
    print('  severity (Tier-1 plies):')
    for sev in ('major', 'minor', 'good', 'neutral'):
        n = sev_counter.get(sev, 0)
        per_100 = (n / tier1_plies * 100) if tier1_plies else 0.0
        print(f'    {sev:<6} {n:>3}   {per_100:>5.2f}/100p')
    print()

    # --- Tag distribution
    tag_counter: Counter[str] = Counter()
    for a in tier1_items:
        for t in a['tags']:
            tag_counter[t] += 1
    if tag_counter:
        print('  tags (Tier-1 plies, descending):')
        for tag, n in tag_counter.most_common():
            kind = 'positive' if tag in POSITIVE_TAGS else 'meta' if tag in META_TAGS else 'negative'
            print(f'    {tag:<32} {n:>3}   ({kind})')
    untagged = sum(1 for a in tier1_items if not a['tags'])
    if untagged:
        print(f'    (untagged annotations: {untagged})')
    print()

    # --- Per-game breakdown
    per_game: dict[int, Counter[str]] = defaultdict(Counter)
    per_game_plies: dict[int, int] = {}
    for g in manifest['games']:
        n = g['plies']
        per_game_plies[g['index']] = (n + 1) // 2 if g['tier1_color'] == 'white' else n // 2
    for a in tier1_items:
        per_game[a['game_index']][a['severity']] += 1

    if per_game:
        print('  per-game (Tier-1 plies):')
        print(f'    {"game":<8} {"plies":>6} {"major":>6} {"minor":>6} {"good":>6}   density (issues / 100 t1p)')
        for gi in sorted(per_game.keys()):
            c = per_game[gi]
            t1p = per_game_plies.get(gi, 0)
            issues = c['major'] + c['minor']
            density = (issues / t1p * 100) if t1p else 0.0
            print(
                f'    #{gi + 1:<7} {t1p:>6} {c["major"]:>6} {c["minor"]:>6} {c["good"]:>6}   {density:>5.1f}'
            )
    print()


def main() -> int:
    annotations = load_annotations()
    if not annotations:
        print(f'No annotations found at {ANNOTATIONS_FILE}.')
        return 0

    by_manifest: dict[str, list[dict]] = defaultdict(list)
    for a in annotations:
        by_manifest[a['manifest_url']].append(a)

    print(f'Annotations: {len(annotations)} across {len(by_manifest)} manifest(s)')
    print()
    for manifest_url, items in sorted(by_manifest.items()):
        report_one_manifest(manifest_url, items)
    return 0


if __name__ == '__main__':
    sys.exit(main())

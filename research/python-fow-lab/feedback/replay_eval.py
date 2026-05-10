"""
Replay-eval: at each annotated ply, build Tier-1 with a candidate config and
record its move choice. Compare against (a) what was actually played and (b)
what the user suggested.

This is *not* a full bake-off. It walks the historical game JSONL up to the
target ply, building Tier-1's belief from observations, then asks the
candidate engine to pick once. Knob changes are isolated from divergent
gameplay — every config sees the same belief input at the same position.

Usage:
    .venv/bin/python3 -m feedback.replay_eval --configs baseline prior_sf
    .venv/bin/python3 research/python-fow-lab/feedback/replay_eval.py \\
        --configs baseline prior_sf risk_05 fog_03 all_on
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

# Ensure src/ is on the path when run as a script.
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
SRC = REPO / 'research' / 'python-fow-lab' / 'src'
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

import chess

from fow_chess.engine import EvaluatorBuilder, static_builder
from fow_chess.evaluator import (
    fog_aware_evaluator,
    stockfish_evaluator,
)
from fow_chess.move_priors import (
    OpponentMovePrior,
    stockfish_shallow_prior_ctx,
    uniform_prior,
)
from fow_chess.observation import observation_from_transition
from fow_chess.selfplay import PerspectiveView
from fow_chess.strategies import Tier1Strategy
from fow_chess.visibility import visible_piece_map, visible_squares

ANNOTATIONS_FILE = HERE / 'annotations.jsonl'
WEB_PUBLIC = REPO / 'apps' / 'web' / 'public'


@dataclass
class Config:
    name: str
    prior: str  # 'uniform' | 'stockfish-shallow'
    fog_lambda: float = 0.0
    risk_aversion: float = 0.0
    max_particles: int = 16
    target_n: int = 256
    depth: int = 4


CONFIG_LIBRARY: dict[str, Config] = {
    'baseline': Config(name='baseline', prior='uniform'),
    'prior_sf': Config(name='prior_sf', prior='stockfish-shallow'),
    'risk_05':  Config(name='risk_05',  prior='uniform', risk_aversion=0.5),
    'fog_03':   Config(name='fog_03',   prior='uniform', fog_lambda=0.3),
    'all_on':   Config(name='all_on',   prior='stockfish-shallow', risk_aversion=0.5, fog_lambda=0.3),
}


def load_jsonl(path: Path) -> list[dict]:
    with path.open() as f:
        return [json.loads(line) for line in f if line.strip()]


def event_move_to_chess(event_move: dict, prev: chess.Board) -> chess.Move:
    """Mistboard JSONL encodes castling as king-takes-rook; convert back to python-chess king-2-square form."""
    from_sq = chess.parse_square(event_move['from'])
    to_sq = chess.parse_square(event_move['to'])
    promotion_str = event_move.get('promotion')
    promotion_map = {'queen': chess.QUEEN, 'rook': chess.ROOK, 'bishop': chess.BISHOP, 'knight': chess.KNIGHT}
    promotion = promotion_map.get(promotion_str) if promotion_str else None

    from_piece = prev.piece_at(from_sq)
    to_piece = prev.piece_at(to_sq)
    if (
        from_piece and from_piece.piece_type == chess.KING
        and to_piece and to_piece.piece_type == chess.ROOK
        and to_piece.color == from_piece.color
    ):
        rank = chess.square_rank(from_sq)
        kingside = chess.square_file(to_sq) > chess.square_file(from_sq)
        new_to = chess.square(6 if kingside else 2, rank)
        return chess.Move(from_sq, new_to, promotion=promotion)
    return chess.Move(from_sq, to_sq, promotion=promotion)


@contextmanager
def make_strategy(config: Config, seed: int) -> Iterator[Tier1Strategy]:
    """Build a Tier1Strategy with the requested config; tears down Stockfish/prior subprocesses on exit."""
    with ExitStack() as stack:
        if config.prior == 'stockfish-shallow':
            prior: OpponentMovePrior = stack.enter_context(
                stockfish_shallow_prior_ctx(depth=config.depth)
            )
        else:
            prior = uniform_prior

        evaluate = stack.enter_context(stockfish_evaluator(depth=config.depth))
        evaluator_builder: EvaluatorBuilder = static_builder(evaluate)

        if config.fog_lambda > 0:
            base_builder = evaluator_builder
            fog_lambda = config.fog_lambda

            def fog_wrapped_builder(view, _b=base_builder, _l=fog_lambda):
                return fog_aware_evaluator(_b(view), _l)

            evaluator_builder = fog_wrapped_builder

        strategy = Tier1Strategy(
            evaluator_builder=evaluator_builder,
            move_prior=prior,
            target_n=config.target_n,
            max_eval_particles=config.max_particles,
            risk_aversion=config.risk_aversion,
            seed=seed,
        )
        yield strategy


def replay_to_ply(
    events: list[dict],
    target_ply: int,
    tier1_color: chess.Color,
    strategy: Tier1Strategy,
) -> chess.Board:
    """Replay event history up to (but not including) target_ply. Returns board state."""
    board = chess.Board()
    move_events = [e for e in events if e['type'] == 'move-played']
    strategy.reset(perspective=tier1_color)

    for i, event in enumerate(move_events):
        ply = i + 1
        if ply >= target_ply:
            break
        prev = board.copy()
        move = event_move_to_chess(event['move'], prev)
        if not prev.is_pseudo_legal(move):
            raise RuntimeError(f'replay diverged: ply {ply} move {move.uci()} not pseudo-legal')
        board.push(move)
        event_color = chess.WHITE if event['color'] == 'white' else chess.BLACK
        if event_color == tier1_color:
            strategy.observe_own_move(
                move, observation_from_transition(prev, board, tier1_color)
            )
        else:
            obs = observation_from_transition(prev, board, tier1_color)
            strategy.observe_opp_move(obs)
    return board


def evaluate_annotation(annotation: dict, manifest: dict, config: Config) -> dict:
    game_index = annotation['game_index']
    target_ply = annotation['ply']
    game_meta = manifest['games'][game_index]
    tier1_color = chess.WHITE if game_meta['tier1_color'] == 'white' else chess.BLACK

    rel = manifest['_rel_dir']  # set by caller
    game_path = WEB_PUBLIC / rel / game_meta['path']
    events = load_jsonl(game_path)
    move_events = [e for e in events if e['type'] == 'move-played']
    if target_ply > len(move_events):
        return {'error': f'ply {target_ply} > game length {len(move_events)}'}

    target_event = move_events[target_ply - 1]
    target_event_color = chess.WHITE if target_event['color'] == 'white' else chess.BLACK
    if target_event_color != tier1_color:
        return {'error': 'annotation is on opponent ply'}

    with make_strategy(config, seed=game_meta['tier1_seed']) as strategy:
        board = replay_to_ply(events, target_ply, tier1_color, strategy)
        own_legals = list(board.pseudo_legal_moves)
        if not own_legals:
            return {'error': 'no legal moves at target ply'}
        view = PerspectiveView(
            perspective=tier1_color,
            own_legal_moves=own_legals,
            visible_squares=visible_squares(board, tier1_color),
            visible_piece_map=visible_piece_map(board, tier1_color),
            clock_remaining_ms=None,
            increment_ms=0,
        )
        chosen = strategy.pick_move(view)

    chosen_uci = chosen.uci()
    played_uci = annotation['move_played_uci']
    suggested_uci = annotation.get('suggested_move_uci')

    return {
        'chosen_uci': chosen_uci,
        'played_uci': played_uci,
        'suggested_uci': suggested_uci,
        'matches_played': chosen_uci == played_uci,
        'matches_suggested': suggested_uci is not None and chosen_uci == suggested_uci,
    }


def severity_emoji(sev: str) -> str:
    return {'major': '●', 'minor': '○', 'good': '★'}.get(sev, '?')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        '--configs',
        nargs='+',
        default=['baseline'],
        help=f'config names from: {", ".join(CONFIG_LIBRARY.keys())}',
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help='cap annotations evaluated per config (for smoke tests)',
    )
    args = parser.parse_args()

    for name in args.configs:
        if name not in CONFIG_LIBRARY:
            print(f'unknown config: {name}. choices: {list(CONFIG_LIBRARY.keys())}')
            return 2

    annotations = load_jsonl(ANNOTATIONS_FILE)

    by_manifest: dict[str, list[dict]] = {}
    for a in annotations:
        by_manifest.setdefault(a['manifest_url'], []).append(a)

    for manifest_url, items in by_manifest.items():
        rel = manifest_url.lstrip('/')
        manifest_path = WEB_PUBLIC / rel
        manifest = json.loads(manifest_path.read_text())
        manifest['_rel_dir'] = str(Path(rel).parent)

        tier1_items = [a for a in items if a['is_tier1_move']]
        if args.limit is not None:
            tier1_items = tier1_items[: args.limit]

        print(f'=== {manifest_url} ({len(tier1_items)} Tier-1 annotations) ===')
        print()

        config_summaries: list[tuple[str, dict]] = []
        for cfg_name in args.configs:
            config = CONFIG_LIBRARY[cfg_name]
            print(
                f'>> config: {config.name}  '
                f'(prior={config.prior}, risk={config.risk_aversion}, fog={config.fog_lambda})'
            )
            t0 = time.monotonic()
            results = []
            for a in tier1_items:
                r = evaluate_annotation(a, manifest, config)
                r['game'] = a['game_index'] + 1
                r['ply'] = a['ply']
                r['severity'] = a['severity']
                results.append(r)
                if 'error' in r:
                    print(f'    game #{r["game"]:>2} ply {r["ply"]:>3}  {severity_emoji(r["severity"])} ERROR: {r["error"]}')
                else:
                    same = '=' if r['matches_played'] else '≠'
                    if r['matches_suggested']:
                        sug = '  ✅ matches user suggestion'
                    elif r['suggested_uci']:
                        sug = f'  (suggested {r["suggested_uci"]})'
                    else:
                        sug = ''
                    print(
                        f'    game #{r["game"]:>2} ply {r["ply"]:>3}  '
                        f'{severity_emoji(r["severity"])} '
                        f'played={r["played_uci"]:<6} chosen={r["chosen_uci"]:<6} {same}{sug}'
                    )
            elapsed = time.monotonic() - t0

            ok = [r for r in results if 'error' not in r]
            n = len(ok)
            same = sum(1 for r in ok if r['matches_played'])
            changed = n - same
            sug_resolved = sum(1 for r in ok if r['matches_suggested'])
            with_sug = sum(1 for r in ok if r['suggested_uci'])
            print(
                f'    --- {config.name}: {same}/{n} same as historical, '
                f'{changed} changed, {sug_resolved}/{with_sug} match user suggestion '
                f'({elapsed:.1f}s) ---'
            )
            print()
            config_summaries.append(
                (
                    config.name,
                    {
                        'same': same,
                        'changed': changed,
                        'sug_resolved': sug_resolved,
                        'with_sug': with_sug,
                        'n': n,
                    },
                )
            )

        # Cross-config summary table
        print('  comparison:')
        print(f'    {"config":<14} {"same/n":>10} {"changed":>9} {"matches-sug":>14}')
        for cfg_name, s in config_summaries:
            same_pct = (s['same'] / s['n'] * 100) if s['n'] else 0.0
            sug_pct = (s['sug_resolved'] / s['with_sug'] * 100) if s['with_sug'] else 0.0
            print(
                f'    {cfg_name:<14} '
                f'{s["same"]}/{s["n"]:>2} ({same_pct:>5.1f}%) '
                f'{s["changed"]:>5} '
                f'{s["sug_resolved"]}/{s["with_sug"]:>2} ({sug_pct:>5.1f}%)'
            )
        print()

    return 0


if __name__ == '__main__':
    sys.exit(main())

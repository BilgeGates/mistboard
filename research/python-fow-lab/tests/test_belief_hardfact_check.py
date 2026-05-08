import importlib.util
import json
import sys
from pathlib import Path

import chess

from fow_chess.visibility import visible_piece_map, visible_squares


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "belief_hardfact_check.py"
SPEC = importlib.util.spec_from_file_location("belief_hardfact_check", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
belief_hardfact_check = importlib.util.module_from_spec(SPEC)
sys.modules["belief_hardfact_check"] = belief_hardfact_check
SPEC.loader.exec_module(belief_hardfact_check)


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows))


def make_run(tmp_path: Path, marginal_field: dict) -> Path:
    run_dir = tmp_path / "run"
    games_dir = run_dir / "games"
    games_dir.mkdir(parents=True)
    (run_dir / "manifest.json").write_text(
        json.dumps(
            {
                "games": [
                    {
                        "index": 0,
                        "path": "games/game-0000.jsonl",
                    }
                ]
            }
        )
    )
    write_jsonl(
        games_dir / "game-0000.jsonl",
        [
            {"type": "room-created", "at": 0, "roomId": "test"},
            {
                "type": "move-played",
                "at": 1,
                "roomId": "test",
                "color": "white",
                "move": {"from": "e2", "to": "e4"},
            },
        ],
    )
    write_jsonl(
        run_dir / "belief.jsonl",
        [
            {
                "game_index": 0,
                "tier1_side": "white",
                "tier1_seat": "tier1_a",
                "ply": 1,
                "snapshot_kind": "decision",
                "marginal_field": marginal_field,
            }
        ],
    )
    return run_dir


def initial_white_visible_marginal() -> dict:
    board = chess.Board()
    marginal: dict[str, list[dict]] = {}
    for square, piece in visible_piece_map(board, chess.WHITE).items():
        marginal[chess.square_name(square)] = [
            {
                "piece": piece.symbol(),
                "color": "white" if piece.color == chess.WHITE else "black",
                "prob": 1.0,
            }
        ]
    for square in visible_squares(board, chess.WHITE):
        name = chess.square_name(square)
        if name not in marginal:
            marginal[name] = [{"piece": None, "prob": 1.0}]
    return marginal


def visible_marginal(board: chess.Board, perspective: chess.Color) -> dict:
    marginal: dict[str, list[dict]] = {}
    for square, piece in visible_piece_map(board, perspective).items():
        marginal[chess.square_name(square)] = [
            {
                "piece": piece.symbol(),
                "color": "white" if piece.color == chess.WHITE else "black",
                "prob": 1.0,
            }
        ]
    for square in visible_squares(board, perspective):
        name = chess.square_name(square)
        if name not in marginal:
            marginal[name] = [{"piece": None, "prob": 1.0}]
    return marginal


def test_validate_run_passes_when_visible_facts_match(tmp_path: Path) -> None:
    run_dir = make_run(tmp_path, initial_white_visible_marginal())

    violations = belief_hardfact_check.validate_run(run_dir)

    assert violations == []


def test_validate_run_flags_visible_piece_mismatch(tmp_path: Path) -> None:
    marginal = initial_white_visible_marginal()
    marginal["e1"] = [{"piece": "Q", "color": "white", "prob": 1.0}]
    run_dir = make_run(tmp_path, marginal)

    violations = belief_hardfact_check.validate_run(run_dir)

    assert len(violations) == 1
    assert violations[0].kind == "visible-piece-mismatch"
    assert violations[0].square == "e1"
    assert violations[0].expected == "K"


def test_validate_run_flags_visible_empty_mismatch(tmp_path: Path) -> None:
    marginal = initial_white_visible_marginal()
    marginal["a3"] = [
        {"piece": "q", "color": "black", "prob": 0.2},
        {"piece": None, "prob": 0.8},
    ]
    run_dir = make_run(tmp_path, marginal)

    violations = belief_hardfact_check.validate_run(run_dir)

    assert len(violations) == 1
    assert violations[0].kind == "visible-empty-mismatch"
    assert violations[0].square == "a3"
    assert violations[0].expected == "empty"


def test_validate_run_flags_hidden_capture_landing_missing(tmp_path: Path) -> None:
    run_dir = tmp_path / "run"
    games_dir = run_dir / "games"
    games_dir.mkdir(parents=True)
    (run_dir / "manifest.json").write_text(
        json.dumps({"games": [{"index": 0, "path": "games/game-0000.jsonl"}]})
    )
    # Queen moves away so c7 is not visible to black after the capture. The
    # final move is intentionally pseudo-event-level: replay_canonical mirrors
    # the bake-off logs and does not validate strategy legality.
    write_jsonl(
        games_dir / "game-0000.jsonl",
        [
            {"type": "room-created", "at": 0, "roomId": "test"},
            {
                "type": "move-played",
                "at": 1,
                "roomId": "test",
                "color": "white",
                "move": {"from": "g2", "to": "g3"},
            },
            {
                "type": "move-played",
                "at": 2,
                "roomId": "test",
                "color": "black",
                "move": {"from": "d8", "to": "h4"},
            },
            {
                "type": "move-played",
                "at": 3,
                "roomId": "test",
                "color": "white",
                "move": {"from": "c1", "to": "c7"},
            },
        ],
    )
    board = chess.Board()
    board.push(chess.Move.from_uci("g2g3"))
    board.push(chess.Move.from_uci("d8h4"))
    board.push(chess.Move.from_uci("c1c7"))
    marginal = visible_marginal(board, chess.BLACK)
    assert "c7" not in marginal
    write_jsonl(
        run_dir / "belief.jsonl",
        [
            {
                "game_index": 0,
                "tier1_side": "black",
                "tier1_seat": "tier1_a",
                "ply": 4,
                "snapshot_kind": "decision",
                "marginal_field": marginal,
            }
        ],
    )

    violations = belief_hardfact_check.validate_run(run_dir)

    assert len(violations) == 1
    assert violations[0].kind == "hidden-capture-landing-missing"
    assert violations[0].square == "c7"
    assert violations[0].expected == "opponent-piece"

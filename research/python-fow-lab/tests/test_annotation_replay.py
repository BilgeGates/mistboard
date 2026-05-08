import importlib.util
import json
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "annotation_replay.py"
SPEC = importlib.util.spec_from_file_location("annotation_replay", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
annotation_replay = importlib.util.module_from_spec(SPEC)
sys.modules["annotation_replay"] = annotation_replay
SPEC.loader.exec_module(annotation_replay)


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows))


def test_annotation_candidates_filters_to_suggested_moves() -> None:
    rows = [
        {
            "id": "a",
            "manifest_url": "/run/manifest.json",
            "game_index": 0,
            "ply": 1,
            "suggested_move_uci": None,
        },
        {
            "id": "b",
            "manifest_url": "/run/manifest.json",
            "game_index": 1,
            "ply": 3,
            "suggested_move_uci": "g3h4",
        },
        {
            "id": "c",
            "manifest_url": "/other/manifest.json",
            "game_index": 1,
            "ply": 2,
            "suggested_move_uci": "a2a3",
        },
    ]

    candidates = annotation_replay.annotation_candidates(
        rows,
        manifest_url="/run/manifest.json",
    )

    assert [row["id"] for row in candidates] == ["b"]


def test_replay_annotation_passes_when_current_engine_chooses_suggestion(
    tmp_path: Path,
) -> None:
    run_dir = tmp_path / "bakeoff-test"
    games_dir = run_dir / "games"
    games_dir.mkdir(parents=True)
    manifest = {
        "opponent": "tier1",
        "evaluator": "material",
        "max_particles": 8,
        "target_n": 16,
        "risk_aversion": 0.0,
        "threat_lambda": 0.3,
        "depth": 1,
        "games": [
            {
                "index": 0,
                "tier1_color": "white",
                "tier1_seed": 1,
                "random_seed": 2,
                "path": "games/game-0000-L-tier1-white.jsonl",
            }
        ],
    }
    (run_dir / "manifest.json").write_text(json.dumps(manifest))
    write_jsonl(
        games_dir / "game-0000-L-tier1-white.jsonl",
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
                "move": {"from": "e7", "to": "e5"},
            },
            {
                "type": "move-played",
                "at": 3,
                "roomId": "test",
                "color": "white",
                "move": {"from": "f2", "to": "f3"},
            },
            {
                "type": "move-played",
                "at": 4,
                "roomId": "test",
                "color": "black",
                "move": {"from": "d8", "to": "h4"},
            },
            {
                "type": "move-played",
                "at": 5,
                "roomId": "test",
                "color": "white",
                "move": {"from": "g3", "to": "g4"},
            },
        ],
    )
    annotation = {
        "id": "ann-1",
        "manifest_url": str(run_dir / "manifest.json"),
        "game_path": "games/game-0000-L-tier1-white.jsonl",
        "game_index": 0,
        "ply": 5,
        "move_played_uci": "g3g4",
        "move_played_color": "white",
        "is_tier1_move": True,
        "suggested_move_uci": "g3h4",
    }

    result = annotation_replay.replay_annotation(
        annotation,
        evaluator_name="material",
    )

    assert result.status == "pass"
    assert result.chosen_move_uci == "g3h4"
    assert result.decision_path == "queen-capture"


def test_replay_annotation_reports_failure_for_different_suggestion(
    tmp_path: Path,
) -> None:
    run_dir = tmp_path / "bakeoff-test"
    games_dir = run_dir / "games"
    games_dir.mkdir(parents=True)
    (run_dir / "manifest.json").write_text(
        json.dumps(
            {
                "opponent": "tier1",
                "evaluator": "material",
                "max_particles": 8,
                "target_n": 16,
                "risk_aversion": 0.0,
                "games": [
                    {
                        "index": 0,
                        "tier1_color": "white",
                        "tier1_seed": 1,
                        "random_seed": 2,
                        "path": "games/game-0000-L-tier1-white.jsonl",
                    }
                ],
            }
        )
    )
    write_jsonl(
        games_dir / "game-0000-L-tier1-white.jsonl",
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
                "move": {"from": "e7", "to": "e5"},
            },
            {
                "type": "move-played",
                "at": 3,
                "roomId": "test",
                "color": "white",
                "move": {"from": "f2", "to": "f3"},
            },
            {
                "type": "move-played",
                "at": 4,
                "roomId": "test",
                "color": "black",
                "move": {"from": "d8", "to": "h4"},
            },
            {
                "type": "move-played",
                "at": 5,
                "roomId": "test",
                "color": "white",
                "move": {"from": "g3", "to": "g4"},
            },
        ],
    )
    annotation = {
        "id": "ann-2",
        "manifest_url": str(run_dir / "manifest.json"),
        "game_path": "games/game-0000-L-tier1-white.jsonl",
        "game_index": 0,
        "ply": 5,
        "move_played_uci": "g3g4",
        "move_played_color": "white",
        "is_tier1_move": True,
        "suggested_move_uci": "a2a3",
    }

    result = annotation_replay.replay_annotation(
        annotation,
        evaluator_name="material",
    )

    assert result.status == "fail"
    assert result.chosen_move_uci == "g3h4"


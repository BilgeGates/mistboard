import importlib.util
import json
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "review_queue.py"
SPEC = importlib.util.spec_from_file_location("review_queue", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
review_queue = importlib.util.module_from_spec(SPEC)
sys.modules["review_queue"] = review_queue
SPEC.loader.exec_module(review_queue)


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows))


def test_generate_queue_prioritizes_generic_csp_and_loss_window(tmp_path: Path) -> None:
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "games": [
                    {
                        "index": 0,
                        "outcome": "L",
                        "plies": 40,
                        "path": "games/game-0000-L-tier1-white.jsonl",
                    }
                ]
            }
        )
    )
    write_jsonl(
        tmp_path / "trace.jsonl",
        [
            {
                "game_index": 0,
                "tier1_seat": "tier1_a",
                "tier1_side": "white",
                "ply": 10,
                "decision_path": "main-eval",
                "move_chosen_uci": "e2e4",
                "belief_unique_count": 20,
                "csp_reseed_fired": True,
                "csp_reseed_count": 64,
                "csp_reseed_stage_b": 1,
            },
            {
                "game_index": 0,
                "tier1_seat": "tier1_a",
                "tier1_side": "white",
                "ply": 38,
                "decision_path": "king-defense-flight",
                "move_chosen_uci": "e1f1",
                "belief_unique_count": 1,
            },
        ],
    )
    write_jsonl(
        tmp_path / "belief.jsonl",
        [
            {
                "game_index": 0,
                "tier1_seat": "tier1_a",
                "ply": 10,
                "snapshot_kind": "decision",
            },
            {
                "game_index": 0,
                "tier1_seat": "tier1_a",
                "ply": 10,
                "snapshot_kind": "after-own-move",
            }
        ],
    )

    items = review_queue.generate_queue(tmp_path)

    assert [item.ply for item in items] == [38, 10]
    assert "loss-window+26" in items[0].reasons
    assert "decision:king-defense-flight+28" in items[0].reasons
    assert "belief-unique<=1+14" in items[0].reasons
    assert "generic-csp-reseed-stage-b+54" in items[1].reasons
    assert items[1].has_belief_snapshot is True
    assert items[1].belief_snapshot_kinds == ["decision", "after-own-move"]


def test_generate_queue_scores_particle_drops(tmp_path: Path) -> None:
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "games": [
                    {
                        "index": 1,
                        "outcome": "W",
                        "plies": 24,
                        "path": "games/game-0001-W-tier1-black.jsonl",
                    }
                ]
            }
        )
    )
    write_jsonl(
        tmp_path / "trace.jsonl",
        [
            {
                "game_index": 1,
                "tier1_seat": "tier1_b",
                "tier1_side": "black",
                "ply": 16,
                "decision_path": "main-eval",
                "move_chosen_uci": "d7d5",
                "belief_unique_count": 12,
                "belief_pre_stage_a": 100,
                "belief_post_stage_a": 9,
                "belief_pre_stage_b": 64,
                "belief_post_stage_b": 64,
            },
            {
                "game_index": 1,
                "tier1_seat": "tier1_b",
                "tier1_side": "black",
                "ply": 18,
                "decision_path": "main-eval",
                "move_chosen_uci": "g8f6",
                "belief_unique_count": 12,
                "belief_pre_stage_b": 64,
                "belief_post_stage_b": 0,
            },
        ],
    )

    items = review_queue.generate_queue(tmp_path)

    assert [item.ply for item in items] == [18, 16]
    assert "stage_b-collapse+60" in items[0].reasons
    assert "stage_a-drop-90pct+24" in items[1].reasons


def test_generate_queue_labels_repair_as_lower_priority_than_generic_csp(
    tmp_path: Path,
) -> None:
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "games": [
                    {
                        "index": 2,
                        "outcome": "W",
                        "plies": 30,
                        "path": "games/game-0002-W-tier1-white.jsonl",
                    }
                ]
            }
        )
    )
    write_jsonl(
        tmp_path / "trace.jsonl",
        [
            {
                "game_index": 2,
                "tier1_seat": "tier1_a",
                "tier1_side": "white",
                "ply": 12,
                "decision_path": "main-eval",
                "move_chosen_uci": "a2a3",
                "belief_unique_count": 16,
                "repair_fired": True,
                "repair_stage_b": 1,
                "repair_count": 8,
            },
            {
                "game_index": 2,
                "tier1_seat": "tier1_a",
                "tier1_side": "white",
                "ply": 14,
                "decision_path": "main-eval",
                "move_chosen_uci": "h2h3",
                "belief_unique_count": 16,
                "csp_reseed_fired": True,
                "csp_reseed_stage_a": 1,
            },
        ],
    )

    items = review_queue.generate_queue(tmp_path)

    assert [item.ply for item in items] == [14, 12]
    assert "generic-csp-reseed-stage-a+50" in items[0].reasons


def test_generate_queue_prioritizes_teleport_like_repairs(tmp_path: Path) -> None:
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "games": [
                    {
                        "index": 2,
                        "outcome": "W",
                        "plies": 30,
                        "path": "games/game-0002-W-tier1-white.jsonl",
                    }
                ]
            }
        )
    )
    write_jsonl(
        tmp_path / "trace.jsonl",
        [
            {
                "game_index": 2,
                "tier1_seat": "tier1_a",
                "tier1_side": "white",
                "ply": 12,
                "decision_path": "main-eval",
                "move_chosen_uci": "a2a3",
                "belief_unique_count": 16,
                "repair_fired": True,
                "repair_stage_b": 1,
                "repair_count": 8,
                "repair_teleport_like_count": 1,
                "repair_long_move_count": 1,
                "repair_cost_max": 54,
            },
            {
                "game_index": 2,
                "tier1_seat": "tier1_a",
                "tier1_side": "white",
                "ply": 14,
                "decision_path": "main-eval",
                "move_chosen_uci": "h2h3",
                "belief_unique_count": 16,
                "repair_fired": True,
                "repair_stage_b": 1,
                "repair_count": 8,
            },
        ],
    )

    items = review_queue.generate_queue(tmp_path)

    assert [item.ply for item in items] == [12, 14]
    assert "repair-teleport-like:1+24" in items[0].reasons
    assert "repair-long-move:1+10" in items[0].reasons


def test_generate_queue_labels_checkpoint_repair(tmp_path: Path) -> None:
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "games": [
                    {
                        "index": 2,
                        "outcome": "W",
                        "plies": 30,
                        "path": "games/game-0002-W-tier1-white.jsonl",
                    }
                ]
            }
        )
    )
    write_jsonl(
        tmp_path / "trace.jsonl",
        [
            {
                "game_index": 2,
                "tier1_seat": "tier1_a",
                "tier1_side": "white",
                "ply": 12,
                "decision_path": "main-eval",
                "move_chosen_uci": "a2a3",
                "belief_unique_count": 16,
                "repair_fired": True,
                "repair_stage_b": 1,
                "repair_count": 8,
                "checkpoint_repair_fired": True,
                "checkpoint_repair_stage_b": 1,
                "checkpoint_repair_count": 4,
                "checkpoint_repair_age": 3,
            }
        ],
    )

    items = review_queue.generate_queue(tmp_path)

    assert len(items) == 1
    assert "checkpoint-repair+16" in items[0].reasons
    assert "belief-repair+10" in items[0].reasons


def test_generate_queue_labels_repair_supplement_pressure(tmp_path: Path) -> None:
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "games": [
                    {
                        "index": 2,
                        "outcome": "W",
                        "plies": 30,
                        "path": "games/game-0002-W-tier1-white.jsonl",
                    }
                ]
            }
        )
    )
    write_jsonl(
        tmp_path / "trace.jsonl",
        [
            {
                "game_index": 2,
                "tier1_seat": "tier1_a",
                "tier1_side": "white",
                "ply": 12,
                "decision_path": "main-eval",
                "move_chosen_uci": "a2a3",
                "belief_unique_count": 16,
                "stage_b_repair_supplement_dropped_count": 128,
            }
        ],
    )

    items = review_queue.generate_queue(tmp_path)

    assert len(items) == 1
    assert "stage-b-repair-supplement-dropped:128+10" in items[0].reasons


def test_generate_queue_prioritizes_weight_mode_disagreement(tmp_path: Path) -> None:
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "games": [
                    {
                        "index": 3,
                        "outcome": "W",
                        "plies": 30,
                        "path": "games/game-0003-W-tier1-white.jsonl",
                    }
                ]
            }
        )
    )
    write_jsonl(
        tmp_path / "trace.jsonl",
        [
            {
                "game_index": 3,
                "tier1_seat": "tier1_a",
                "tier1_side": "white",
                "ply": 12,
                "decision_path": "main-eval",
                "move_chosen_uci": "a2a3",
                "belief_unique_count": 200,
                "chosen_move_king_capture_risk": 0.01,
                "decision_weight_modes": {
                    "sample": {
                        "selected_clusters": 16,
                        "total_unique_clusters": 200,
                        "max_clusters": 16,
                    },
                    "mode_winners": {
                        "posterior": "a2a3",
                        "appearance": "b1c3",
                        "uniform_distinct": "b1c3",
                    },
                    "winner_disagreement": True,
                    "modes": {
                        "posterior": [
                            {
                                "uci": "a2a3",
                                "score": 10,
                                "support_mass": 0.2,
                                "support_clusters": 2,
                            }
                        ]
                    },
                },
            }
        ],
    )

    items = review_queue.generate_queue(tmp_path)

    assert len(items) == 1
    assert "weight-mode-winner-disagreement+24" in items[0].reasons
    assert "posterior-vs-uniform-winner+14" in items[0].reasons
    assert "posterior-vs-appearance-winner+10" in items[0].reasons
    assert "weight-mode-sampled:16/200+10" in items[0].reasons
    assert "posterior-winner-support<25pct+8" in items[0].reasons
    assert "posterior-winner-clusters:2+8" in items[0].reasons
    assert "weight-disagreement-with-risk+8" in items[0].reasons
    assert items[0].to_json()["trace_summary"]["decision_weight_modes"][
        "winner_disagreement"
    ] is True


def test_generate_queue_prioritizes_latent_danger_probe(tmp_path: Path) -> None:
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "games": [
                    {
                        "index": 16,
                        "outcome": "*",
                        "plies": 12,
                        "path": "games/game-0016.jsonl",
                    }
                ]
            }
        )
    )
    write_jsonl(
        tmp_path / "trace.jsonl",
        [
            {
                "game_index": 16,
                "tier1_seat": "tier1_a",
                "tier1_side": "white",
                "ply": 7,
                "decision_path": "main-eval",
                "move_chosen_uci": "e3e4",
                "belief_unique_count": 64,
                "latent_danger_probe_count": 1,
                "latent_danger_probes": [
                    {
                        "target_square": "e1",
                        "target_piece": "K",
                        "danger_square": "a5",
                        "danger_piece": "q",
                        "belief_mass": 0.0,
                        "ray": ["d2", "c3", "b4", "a5"],
                        "blocking_squares": ["d2", "c3", "b4"],
                        "blocking_moves": ["b1c3", "c1d2"],
                    }
                ],
            }
        ],
    )
    write_jsonl(
        tmp_path / "belief.jsonl",
        [
            {
                "game_index": 16,
                "tier1_seat": "tier1_a",
                "ply": 7,
                "snapshot_kind": "decision",
            }
        ],
    )

    items = review_queue.generate_queue(tmp_path)

    assert len(items) == 1
    assert "latent-danger-probe:1+12" in items[0].reasons
    assert "latent-king-queen-ray+18" in items[0].reasons
    assert "latent-danger-has-blocker+8" in items[0].reasons
    assert "latent-danger-missing-belief+8" in items[0].reasons
    assert items[0].to_json()["trace_summary"]["latent_danger_probe_count"] == 1

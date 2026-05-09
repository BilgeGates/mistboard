"""Generate a ranked Engine Lab review queue from bake-off artifacts.

Usage:
    .venv/bin/python scripts/review_queue.py /path/to/bakeoff-run

Reads:
    manifest.json
    trace.jsonl
    belief.jsonl (optional; currently used to mark availability)

Writes, by default:
    review_queue.json
    review_queue.md
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


CRITICAL_DECISION_PATHS: dict[str, int] = {
    "king-capture": 30,
    "king-defense-capture": 28,
    "king-defense-block": 28,
    "king-defense-flight": 28,
    "queen-capture": 22,
    "queen-save": 22,
    "visible-minor-rook-capture": 16,
    "fallback": 24,
}


@dataclass
class QueueItem:
    score: int
    game_index: int
    ply: int
    review_ply: int
    review_snapshot_kind: str | None
    tier1_seat: str
    tier1_side: str
    decision_path: str
    move_chosen_uci: str
    reasons: list[str] = field(default_factory=list)
    game_outcome: str | None = None
    game_path: str | None = None
    has_belief_snapshot: bool = False
    belief_snapshot_kinds: list[str] = field(default_factory=list)
    trace: dict[str, Any] = field(default_factory=dict)

    @property
    def key(self) -> tuple[int, str, int, str | None]:
        return (
            self.game_index,
            self.tier1_seat,
            self.review_ply,
            self.review_snapshot_kind,
        )

    def to_json(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "game_index": self.game_index,
            "ply": self.ply,
            "review_ply": self.review_ply,
            "review_snapshot_kind": self.review_snapshot_kind,
            "tier1_seat": self.tier1_seat,
            "tier1_side": self.tier1_side,
            "decision_path": self.decision_path,
            "move_chosen_uci": self.move_chosen_uci,
            "reasons": self.reasons,
            "game_outcome": self.game_outcome,
            "game_path": self.game_path,
            "review_url_params": review_url_params(self),
            "has_belief_snapshot": self.has_belief_snapshot,
            "belief_snapshot_kinds": self.belief_snapshot_kinds,
            "trace_summary": trace_summary(self.trace),
        }


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open() as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def generate_queue(
    run_dir: Path,
    limit: int = 30,
    *,
    include_mirror_seats: bool = False,
) -> list[QueueItem]:
    manifest = load_json(run_dir / "manifest.json")
    trace_rows = load_jsonl(run_dir / "trace.jsonl")
    belief_kinds_by_key: dict[tuple[Any, Any, Any], set[str]] = {}
    for row in load_jsonl(run_dir / "belief.jsonl"):
        key = (row.get("game_index"), row.get("tier1_seat"), row.get("ply"))
        kind = str(row.get("snapshot_kind") or "snapshot")
        belief_kinds_by_key.setdefault(key, set()).add(kind)
    games_by_index = {game["index"]: game for game in manifest.get("games", [])}

    items_by_key: dict[tuple[int, str, int, str | None], QueueItem] = {}
    for row in trace_rows:
        game = games_by_index.get(int(row["game_index"]), {})
        if (
            not include_mirror_seats
            and game.get("tier1_color") is not None
            and row.get("tier1_side") != game.get("tier1_color")
        ):
            continue
        item = score_trace_row(row, games_by_index, belief_kinds_by_key)
        if item is None:
            continue
        existing = items_by_key.get(item.key)
        if existing is None or item.score > existing.score:
            items_by_key[item.key] = item

    items = sorted(
        items_by_key.values(),
        key=lambda item: (
            -item.score,
            item.game_index,
            item.review_ply,
            item.review_snapshot_kind or "",
            item.tier1_seat,
        ),
    )
    return items[:limit]


def score_trace_row(
    row: dict[str, Any],
    games_by_index: dict[int, dict[str, Any]],
    belief_kinds_by_key: dict[tuple[Any, Any, Any], set[str]],
) -> QueueItem | None:
    game_index = int(row["game_index"])
    game = games_by_index.get(game_index, {})
    outcome = game.get("outcome")
    ply = int(row["ply"])
    score = 0
    reasons: list[str] = []

    csp_score = score_csp_reseed(reasons, row)
    score += csp_score

    if row.get("repair_fired") is True:
        add(reasons, "belief-repair", 10)
        score += 10
        teleport_count = int(row.get("repair_teleport_like_count") or 0)
        long_move_count = int(row.get("repair_long_move_count") or 0)
        repair_cost_max = int(row.get("repair_cost_max") or 0)
        if teleport_count:
            add(reasons, f"repair-teleport-like:{teleport_count}", 24)
            score += 24
        if long_move_count:
            add(reasons, f"repair-long-move:{long_move_count}", 10)
            score += 10
        if repair_cost_max >= 80:
            add(reasons, "repair-cost>=80", 12)
            score += 12
        elif repair_cost_max >= 40:
            add(reasons, "repair-cost>=40", 6)
            score += 6
        worst_piece = row.get("repair_worst_piece")
        worst_from = row.get("repair_worst_from")
        worst_to = row.get("repair_worst_to")
        worst_distance = int(row.get("repair_worst_distance") or 0)
        worst_legal = row.get("repair_worst_one_move_legal")
        if worst_piece and worst_from and worst_to and worst_legal is False:
            add(
                reasons,
                f"repair-worst:{worst_piece}:{worst_from}->{worst_to}:d{worst_distance}:nonlegal",
                4,
            )
            score += 4
        strict_rejected = int(row.get("repair_strict_rejected_count") or 0)
        strict_fallback = int(row.get("repair_strict_fallback_count") or 0)
        if strict_rejected:
            add(reasons, f"repair-strict-rejected:{strict_rejected}", 8)
            score += 8
        if strict_fallback:
            add(reasons, f"repair-strict-fallback:{strict_fallback}", 12)
            score += 12
    if row.get("checkpoint_repair_fired") is True:
        add(reasons, "checkpoint-repair", 16)
        score += 16

    score += score_particle_drop(reasons, row, "stage_a")
    score += score_particle_drop(reasons, row, "stage_b")
    score += score_particle_profile(reasons, row)
    score += score_decision_audit(reasons, row)
    score += score_weight_mode_disagreement(reasons, row)

    unique = int(row.get("belief_unique_count") or 0)
    if unique <= 1:
        add(reasons, "belief-unique<=1", 14)
        score += 14
    elif unique <= 3:
        add(reasons, "belief-unique<=3", 8)
        score += 8

    decision_path = str(row.get("decision_path") or "unknown")
    decision_score = CRITICAL_DECISION_PATHS.get(decision_path)
    if decision_score is not None:
        add(reasons, f"decision:{decision_path}", decision_score)
        score += decision_score

    constraint_pruned = int(row.get("constraint_pruned_stage_b") or 0)
    if constraint_pruned > 0:
        add(reasons, "constraint-pruned", min(16, 4 + constraint_pruned // 8))
        score += min(16, 4 + constraint_pruned // 8)

    if outcome == "D":
        add(reasons, "draw-game", 12)
        score += 12
    elif outcome == "L":
        end_ply = int(game.get("plies") or 0)
        if end_ply and ply >= max(1, end_ply - 8):
            add(reasons, "loss-window", 26)
            score += 26
        else:
            add(reasons, "loss-game", 6)
            score += 6

    if score == 0:
        return None

    review_ply, review_snapshot_kind = review_target(row, belief_kinds_by_key)
    belief_key = (game_index, row.get("tier1_seat"), ply)
    belief_snapshot_kinds = sorted(
        belief_kinds_by_key.get(belief_key, set()),
        key=snapshot_kind_sort_key,
    )

    return QueueItem(
        score=score,
        game_index=game_index,
        ply=ply,
        review_ply=review_ply,
        review_snapshot_kind=review_snapshot_kind,
        tier1_seat=str(row.get("tier1_seat") or "tier1"),
        tier1_side=str(row.get("tier1_side") or "unknown"),
        decision_path=decision_path,
        move_chosen_uci=str(row.get("move_chosen_uci") or ""),
        reasons=reasons,
        game_outcome=outcome,
        game_path=game.get("path"),
        has_belief_snapshot=bool(belief_snapshot_kinds),
        belief_snapshot_kinds=belief_snapshot_kinds,
        trace=row,
    )


def review_target(
    row: dict[str, Any],
    belief_kinds_by_key: dict[tuple[Any, Any, Any], set[str]],
) -> tuple[int, str | None]:
    """Return the belief snapshot that best explains this trace row.

    Trace rows are emitted at decision time, but Stage A/B diagnostics are
    pending from earlier observation updates. Stage A belongs to the previous
    move this side played (`ply - 2`, `after-own-move`); Stage B belongs to the
    opponent's immediately preceding move (`ply - 1`, `after-opp-move`).
    """
    game_index = row.get("game_index")
    seat = row.get("tier1_seat")
    ply = int(row["ply"])
    candidates: list[tuple[int, int, str]] = []

    stage_a_score = stage_signal_score(row, "stage_a")
    if stage_a_score:
        candidates.append((stage_a_score, max(1, ply - 2), "after-own-move"))

    stage_b_score = stage_signal_score(row, "stage_b")
    if stage_b_score:
        candidates.append((stage_b_score, max(1, ply - 1), "after-opp-move"))

    candidates.sort(reverse=True)
    for _, target_ply, kind in candidates:
        if kind in belief_kinds_by_key.get((game_index, seat, target_ply), set()):
            return target_ply, kind

    if "decision" in belief_kinds_by_key.get((game_index, seat, ply), set()):
        return ply, "decision"
    return ply, None


def stage_signal_score(row: dict[str, Any], stage: str) -> int:
    score = 0
    if row.get(f"csp_reseed_{stage}"):
        score += 100
    if row.get(f"repair_{stage}"):
        score += 40
    elapsed_ms = float(row.get(f"{stage}_elapsed_ms") or 0.0)
    if stage == "stage_b" and elapsed_ms >= 750:
        score += 20
    elif stage == "stage_a" and elapsed_ms >= 50:
        score += 10
    pre = row.get(f"belief_pre_{stage}")
    post = row.get(f"belief_post_{stage}")
    if pre is not None and post is not None:
        pre_i = int(pre)
        post_i = int(post)
        if pre_i > 0 and post_i == 0:
            score += 80
        elif pre_i > 0 and post_i <= max(1, pre_i // 10):
            score += 30
        elif pre_i > 0 and post_i <= max(1, pre_i // 4):
            score += 15
    return score


def add(reasons: list[str], reason: str, score: int) -> None:
    reasons.append(f"{reason}+{score}")


def snapshot_kind_sort_key(kind: str) -> tuple[int, str]:
    order = {
        "decision": 0,
        "after-own-move": 1,
        "after-opp-move": 2,
        "snapshot": 3,
    }
    return order.get(kind, 9), kind


def review_url_params(item: QueueItem) -> dict[str, str]:
    params = {
        "game": str(item.game_index),
        "ply": str(item.review_ply),
        "capture": "belief",
        "beliefSeat": item.tier1_seat,
    }
    if item.review_snapshot_kind:
        params["beliefKind"] = item.review_snapshot_kind
    return params


def score_particle_drop(
    reasons: list[str], row: dict[str, Any], stage: str
) -> int:
    pre = row.get(f"belief_pre_{stage}")
    post = row.get(f"belief_post_{stage}")
    if pre is None or post is None:
        return 0
    pre_i = int(pre)
    post_i = int(post)
    if pre_i <= 0:
        return 0
    if post_i == 0:
        add(reasons, f"{stage}-collapse", 60)
        return 60
    if post_i <= max(1, pre_i // 10):
        add(reasons, f"{stage}-drop-90pct", 24)
        return 24
    if post_i <= max(1, pre_i // 4):
        add(reasons, f"{stage}-drop-75pct", 12)
        return 12
    return 0


def score_particle_profile(reasons: list[str], row: dict[str, Any]) -> int:
    """Rank rows where particle quality was expensive to maintain."""

    score = 0
    stage_a_ms = float(row.get("stage_a_elapsed_ms") or 0.0)
    stage_b_ms = float(row.get("stage_b_elapsed_ms") or 0.0)
    stage_b_repair_ms = float(row.get("stage_b_repair_ms") or 0.0)
    stage_b_expanded = int(row.get("stage_b_expanded_count") or 0)
    supplement_dropped = int(
        row.get("stage_b_repair_supplement_dropped_count") or 0
    )

    if stage_a_ms >= 100:
        add(reasons, "stage-a-slow>=100ms", 8)
        score += 8
    elif stage_a_ms >= 50:
        add(reasons, "stage-a-slow>=50ms", 4)
        score += 4

    if stage_b_ms >= 1500:
        add(reasons, "stage-b-slow>=1500ms", 18)
        score += 18
    elif stage_b_ms >= 750:
        add(reasons, "stage-b-slow>=750ms", 10)
        score += 10

    if stage_b_repair_ms >= 500:
        add(reasons, "stage-b-repair>=500ms", 12)
        score += 12
    elif stage_b_repair_ms >= 200:
        add(reasons, "stage-b-repair>=200ms", 6)
        score += 6

    if stage_b_expanded >= 8000:
        add(reasons, "stage-b-expanded>=8000", 8)
        score += 8

    if supplement_dropped >= 100:
        add(reasons, f"stage-b-repair-supplement-dropped:{supplement_dropped}", 10)
        score += 10
    elif supplement_dropped:
        add(reasons, f"stage-b-repair-supplement-dropped:{supplement_dropped}", 4)
        score += 4

    return score


def score_decision_audit(reasons: list[str], row: dict[str, Any]) -> int:
    score = 0
    missed_capture = int(row.get("visible_capture_value_missed") or 0)
    king_risk = float(row.get("chosen_move_king_capture_risk") or 0.0)
    piece_risk = float(row.get("chosen_move_piece_capture_risk") or 0.0)
    piece_value = int(row.get("chosen_piece_value") or 0)

    if missed_capture >= 5:
        add(reasons, "missed-visible-capture>=rook", 18)
        score += 18
    elif missed_capture >= 3:
        add(reasons, "missed-visible-capture>=minor", 10)
        score += 10

    if king_risk >= 0.05:
        add(reasons, "chosen-king-risk>=5pct", 22)
        score += 22
    elif king_risk > 0:
        add(reasons, "chosen-king-risk>0", 10)
        score += 10

    if piece_value >= 3 and piece_risk >= 0.25:
        add(reasons, "chosen-piece-risk>=25pct", 10)
        score += 10

    return score


def score_weight_mode_disagreement(reasons: list[str], row: dict[str, Any]) -> int:
    modes = row.get("decision_weight_modes")
    if not isinstance(modes, dict):
        return 0

    score = 0
    winners = modes.get("mode_winners")
    if not isinstance(winners, dict):
        winners = {}
    posterior = winners.get("posterior")
    appearance = winners.get("appearance")
    uniform = winners.get("uniform_distinct")

    if modes.get("winner_disagreement") is True:
        add(reasons, "weight-mode-winner-disagreement", 24)
        score += 24
        if posterior and uniform and posterior != uniform:
            add(reasons, "posterior-vs-uniform-winner", 14)
            score += 14
        if posterior and appearance and posterior != appearance:
            add(reasons, "posterior-vs-appearance-winner", 10)
            score += 10

    sample = modes.get("sample")
    if isinstance(sample, dict):
        selected = int(sample.get("selected_clusters") or 0)
        total = int(sample.get("total_unique_clusters") or 0)
        if selected > 0 and total >= selected * 8:
            add(reasons, f"weight-mode-sampled:{selected}/{total}", 10)
            score += 10
        elif selected > 0 and total >= selected * 4:
            add(reasons, f"weight-mode-sampled:{selected}/{total}", 6)
            score += 6

    mode_rows = modes.get("modes")
    if isinstance(mode_rows, dict):
        posterior_rows = mode_rows.get("posterior")
        if isinstance(posterior_rows, list) and posterior_rows:
            top = posterior_rows[0]
            if isinstance(top, dict):
                support_clusters = int(top.get("support_clusters") or 0)
                support_mass = float(top.get("support_mass") or 0.0)
                if support_mass and support_mass < 0.25:
                    add(reasons, "posterior-winner-support<25pct", 8)
                    score += 8
                if support_clusters and support_clusters <= 2:
                    add(reasons, f"posterior-winner-clusters:{support_clusters}", 8)
                    score += 8

    king_risk = float(row.get("chosen_move_king_capture_risk") or 0.0)
    piece_risk = float(row.get("chosen_move_piece_capture_risk") or 0.0)
    if modes.get("winner_disagreement") is True and (king_risk > 0 or piece_risk >= 0.25):
        add(reasons, "weight-disagreement-with-risk", 8)
        score += 8

    return score


def trace_summary(row: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "particle_count_pre_sample",
        "belief_unique_count",
        "chosen_piece",
        "chosen_piece_value",
        "chosen_visible_capture_value",
        "best_visible_capture_uci",
        "best_visible_capture_value",
        "visible_capture_value_missed",
        "chosen_move_king_capture_risk",
        "chosen_move_piece_capture_risk",
        "chosen_move_risk_support_count",
        "chosen_move_risk_support_unique",
        "belief_pre_stage_a",
        "belief_post_stage_a",
        "stage_a_elapsed_ms",
        "stage_a_filter_ms",
        "stage_a_repair_ms",
        "stage_a_csp_ms",
        "stage_a_resample_ms",
        "stage_a_reject_illegal",
        "stage_a_reject_observation",
        "stage_a_reject_hard",
        "belief_pre_stage_b",
        "belief_post_stage_b",
        "stage_b_elapsed_ms",
        "stage_b_expand_ms",
        "stage_b_repair_ms",
        "stage_b_csp_ms",
        "stage_b_resample_ms",
        "stage_b_expanded_count",
        "stage_b_obs_checked_count",
        "stage_b_repair_supplement_count",
        "stage_b_repair_supplement_considered_count",
        "stage_b_repair_supplement_dropped_count",
        "stage_b_reject_observation",
        "stage_b_reject_hard",
        "stage_b_reject_count",
        "constraint_pruned_stage_b",
        "csp_reseed_fired",
        "csp_reseed_count",
        "csp_reseed_stage_a",
        "csp_reseed_stage_b",
        "repair_fired",
        "repair_count",
        "repair_cost_max",
        "repair_cost_total",
        "repair_teleport_like_count",
        "repair_long_move_count",
        "repair_forced_visible_square_count",
        "repair_worst_stage",
        "repair_worst_cost",
        "repair_worst_piece",
        "repair_worst_from",
        "repair_worst_to",
        "repair_worst_distance",
        "repair_worst_one_move_legal",
        "repair_strict_rejected_count",
        "repair_strict_fallback_count",
        "checkpoint_repair_fired",
        "checkpoint_repair_count",
        "checkpoint_repair_age",
        "repair_stage_a",
        "repair_stage_b",
        "repair_cost_max_stage_a",
        "repair_cost_max_stage_b",
        "repair_teleport_like_count_stage_a",
        "repair_teleport_like_count_stage_b",
        "repair_long_move_count_stage_a",
        "repair_long_move_count_stage_b",
        "repair_worst_cost_stage_a",
        "repair_worst_cost_stage_b",
        "repair_worst_piece_stage_a",
        "repair_worst_piece_stage_b",
        "repair_worst_from_stage_a",
        "repair_worst_from_stage_b",
        "repair_worst_to_stage_a",
        "repair_worst_to_stage_b",
        "repair_worst_distance_stage_a",
        "repair_worst_distance_stage_b",
        "repair_worst_one_move_legal_stage_a",
        "repair_worst_one_move_legal_stage_b",
        "repair_strict_rejected_count_stage_a",
        "repair_strict_rejected_count_stage_b",
        "repair_strict_fallback_count_stage_a",
        "repair_strict_fallback_count_stage_b",
        "checkpoint_repair_stage_a",
        "checkpoint_repair_stage_b",
        "checkpoint_repair_count_stage_a",
        "checkpoint_repair_count_stage_b",
        "checkpoint_repair_age_stage_a",
        "checkpoint_repair_age_stage_b",
        "particle_weight_profile",
        "decision_weight_modes",
    ]
    return {key: row[key] for key in keys if key in row}


def score_csp_reseed(reasons: list[str], row: dict[str, Any]) -> int:
    stage_a = bool(row.get("csp_reseed_stage_a"))
    stage_b = bool(row.get("csp_reseed_stage_b"))
    if stage_a and stage_b:
        add(reasons, "generic-csp-reseed-stage-a+b", 60)
        return 60
    if stage_b:
        add(reasons, "generic-csp-reseed-stage-b", 54)
        return 54
    if stage_a:
        add(reasons, "generic-csp-reseed-stage-a", 50)
        return 50
    if row.get("csp_reseed_fired") is True:
        add(reasons, "generic-csp-reseed", 50)
        return 50
    return 0


def write_json(path: Path, items: list[QueueItem]) -> None:
    path.write_text(json.dumps([item.to_json() for item in items], indent=2) + "\n")


def write_markdown(path: Path, items: list[QueueItem], run_dir: Path) -> None:
    lines = [
        "# Engine Lab Review Queue",
        "",
        f"Run: `{run_dir}`",
        "",
        "| Rank | Score | Game | Review | Trace | Side | Move | Path | Reasons | Belief |",
        "| ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for idx, item in enumerate(items, start=1):
        game = (
            f"{item.game_index}"
            + (f" `{item.game_outcome}`" if item.game_outcome else "")
            + (f"<br>`{item.game_path}`" if item.game_path else "")
        )
        belief = ", ".join(item.belief_snapshot_kinds) if item.has_belief_snapshot else "no"
        review = (
            f"{item.review_ply}"
            + (
                f"<br>`{item.review_snapshot_kind}`"
                if item.review_snapshot_kind
                else ""
            )
        )
        params = "&".join(
            f"{key}={value}" for key, value in review_url_params(item).items()
        )
        lines.append(
            "| "
            f"{idx} | {item.score} | {game} | {review} | {item.ply} | "
            f"{item.tier1_side}/{item.tier1_seat} | `{item.move_chosen_uci}` | "
            f"`{item.decision_path}` | {', '.join(item.reasons)} | {belief}<br>`?{params}` |"
        )
    lines.append("")
    path.write_text("\n".join(lines))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument(
        "--include-mirror-seats",
        action="store_true",
        help=(
            "Include both Tier-1 seats in mirror runs. Default queues only the "
            "manifest's reviewed tier1_color so human annotation matches the lab UI."
        ),
    )
    parser.add_argument("--json-out", type=Path, default=None)
    parser.add_argument("--md-out", type=Path, default=None)
    args = parser.parse_args()

    run_dir = args.run_dir
    items = generate_queue(
        run_dir,
        limit=args.limit,
        include_mirror_seats=args.include_mirror_seats,
    )
    json_out = args.json_out or run_dir / "review_queue.json"
    md_out = args.md_out or run_dir / "review_queue.md"
    write_json(json_out, items)
    write_markdown(md_out, items, run_dir)

    print(f"review items: {len(items)}")
    print(f"json:         {json_out}")
    print(f"markdown:     {md_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

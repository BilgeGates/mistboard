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
    def key(self) -> tuple[int, str, int]:
        return self.game_index, self.tier1_seat, self.ply

    def to_json(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "game_index": self.game_index,
            "ply": self.ply,
            "tier1_seat": self.tier1_seat,
            "tier1_side": self.tier1_side,
            "decision_path": self.decision_path,
            "move_chosen_uci": self.move_chosen_uci,
            "reasons": self.reasons,
            "game_outcome": self.game_outcome,
            "game_path": self.game_path,
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


def generate_queue(run_dir: Path, limit: int = 30) -> list[QueueItem]:
    manifest = load_json(run_dir / "manifest.json")
    trace_rows = load_jsonl(run_dir / "trace.jsonl")
    belief_kinds_by_key: dict[tuple[Any, Any, Any], set[str]] = {}
    for row in load_jsonl(run_dir / "belief.jsonl"):
        key = (row.get("game_index"), row.get("tier1_seat"), row.get("ply"))
        kind = str(row.get("snapshot_kind") or "snapshot")
        belief_kinds_by_key.setdefault(key, set()).add(kind)
    games_by_index = {game["index"]: game for game in manifest.get("games", [])}

    items_by_key: dict[tuple[int, str, int], QueueItem] = {}
    for row in trace_rows:
        item = score_trace_row(row, games_by_index, belief_kinds_by_key)
        if item is None:
            continue
        existing = items_by_key.get(item.key)
        if existing is None or item.score > existing.score:
            items_by_key[item.key] = item

    items = sorted(
        items_by_key.values(),
        key=lambda item: (-item.score, item.game_index, item.ply, item.tier1_seat),
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

    if row.get("csp_reseed_fired") is True:
        add(reasons, "generic-csp-reseed", 50)
        score += 50

    score += score_particle_drop(reasons, row, "stage_a")
    score += score_particle_drop(reasons, row, "stage_b")

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

    belief_key = (game_index, row.get("tier1_seat"), ply)
    belief_snapshot_kinds = sorted(
        belief_kinds_by_key.get(belief_key, set()),
        key=snapshot_kind_sort_key,
    )

    return QueueItem(
        score=score,
        game_index=game_index,
        ply=ply,
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


def trace_summary(row: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "particle_count_pre_sample",
        "belief_unique_count",
        "belief_pre_stage_a",
        "belief_post_stage_a",
        "belief_pre_stage_b",
        "belief_post_stage_b",
        "constraint_pruned_stage_b",
        "csp_reseed_fired",
        "csp_reseed_count",
    ]
    return {key: row[key] for key in keys if key in row}


def write_json(path: Path, items: list[QueueItem]) -> None:
    path.write_text(json.dumps([item.to_json() for item in items], indent=2) + "\n")


def write_markdown(path: Path, items: list[QueueItem], run_dir: Path) -> None:
    lines = [
        "# Engine Lab Review Queue",
        "",
        f"Run: `{run_dir}`",
        "",
        "| Rank | Score | Game | Ply | Side | Move | Path | Reasons | Belief |",
        "| ---: | ---: | --- | ---: | --- | --- | --- | --- | --- |",
    ]
    for idx, item in enumerate(items, start=1):
        game = (
            f"{item.game_index}"
            + (f" `{item.game_outcome}`" if item.game_outcome else "")
            + (f"<br>`{item.game_path}`" if item.game_path else "")
        )
        belief = ", ".join(item.belief_snapshot_kinds) if item.has_belief_snapshot else "no"
        lines.append(
            "| "
            f"{idx} | {item.score} | {game} | {item.ply} | "
            f"{item.tier1_side}/{item.tier1_seat} | `{item.move_chosen_uci}` | "
            f"`{item.decision_path}` | {', '.join(item.reasons)} | {belief} |"
        )
    lines.append("")
    path.write_text("\n".join(lines))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--json-out", type=Path, default=None)
    parser.add_argument("--md-out", type=Path, default=None)
    args = parser.parse_args()

    run_dir = args.run_dir
    items = generate_queue(run_dir, limit=args.limit)
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

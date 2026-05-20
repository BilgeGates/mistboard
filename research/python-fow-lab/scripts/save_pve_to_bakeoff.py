"""Save a finished PvE game into the bakeoff browser format for annotation review.

Pulls events from the local server's /api/games/<room>/events, writes them as
JSONL under apps/web/public/bakeoff-pve-matches/games/, and appends an entry
to that directory's manifest.json (creates the manifest if not present).

The user can then browse:
    http://localhost:3000/?bakeoff=/bakeoff-pve-matches/manifest.json
and annotate moves using the existing bakeoff browser UI.

Usage:
    .venv/bin/python3 scripts/save_pve_to_bakeoff.py \\
        --room-id <id> --label "vs-brian-game-1"
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

_LAB_ROOT = Path(__file__).resolve().parent.parent
_REPO_ROOT = _LAB_ROOT.parent.parent
_BAKEOFF_DIR = _REPO_ROOT / "apps" / "web" / "public" / "bakeoff-pve-matches"
_GAMES_DIR = _BAKEOFF_DIR / "games"
_MANIFEST = _BAKEOFF_DIR / "manifest.json"


def fetch_events(server_url: str, room_id: str) -> list[dict]:
    url = f"{server_url.rstrip('/')}/api/games/{room_id}/events"
    with urllib.request.urlopen(url, timeout=10) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if isinstance(body, dict) and "events" in body:
        return body["events"]
    if isinstance(body, list):
        return body
    raise ValueError(f"unexpected response from {url}: {type(body)}")


def detect_engine_color(events: list[dict]) -> str:
    """Engine color via seat-assigned events. python-tier1-* clientId == engine."""
    for e in events:
        if e.get("type") == "seat-assigned":
            cid = str(e.get("clientId") or "")
            if cid.startswith("python-tier1") or cid.startswith("builtin-") or cid == "random-engine":
                return str(e.get("seat", "black"))
    return "black"


def summarize_game(events: list[dict], engine_color: str) -> dict:
    import chess
    moves = [e for e in events if e.get("type") == "move-played"]
    plies = len(moves)
    end_reason = "unknown"
    winner: str | None = None

    # Try explicit end events first.
    for e in reversed(events):
        if e.get("type") == "game-over":
            end_reason = e.get("reason") or e.get("endReason") or "unknown"
            winner = e.get("winner")
            break
        if e.get("type") == "king-captured":
            end_reason = "king-captured"
            winner = e.get("byColor") or e.get("by")
            break

    # If no explicit end, reconstruct the board and check for missing king.
    if winner is None and moves:
        board = chess.Board()
        promo_map = {"queen": "q", "rook": "r", "bishop": "b", "knight": "n"}
        for mv in moves:
            m = mv.get("move", {})
            p = m.get("promotion")
            uci = f"{m['from']}{m['to']}{promo_map.get(p, '') if p else ''}"
            try:
                board.push(chess.Move.from_uci(uci))
            except Exception:
                # FoW allows pseudo-legal moves (e.g. moving into check); push
                # via pseudo_legal_moves loop if strict push rejects.
                move = chess.Move.from_uci(uci)
                board.turn = move.from_square in [s for s in chess.SQUARES if board.piece_at(s) and board.piece_at(s).color]
                board._push_move(move) if hasattr(board, "_push_move") else board.push(move)
        white_king = board.king(chess.WHITE)
        black_king = board.king(chess.BLACK)
        if white_king is None and black_king is not None:
            winner = "black"
            end_reason = "king-captured"
        elif black_king is None and white_king is not None:
            winner = "white"
            end_reason = "king-captured"
        elif white_king is None and black_king is None:
            end_reason = "both-kings-captured"  # shouldn't happen
        else:
            # Final move flagged game end (activeColor:null) but kings present →
            # probably truncated or draw by clock/agreement.
            last = events[-1]
            clock = last.get("clock", {}) if isinstance(last, dict) else {}
            if clock.get("activeColor") is None:
                end_reason = "ended-without-king-capture"

    if winner == engine_color:
        outcome_letter = "W"
    elif winner is None:
        outcome_letter = "D"
    else:
        outcome_letter = "L"
    return {
        "plies": plies,
        "end_reason": end_reason,
        "outcome": outcome_letter,
        "winner": winner,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--room-id", required=True)
    ap.add_argument("--label", required=True,
                    help="Short label used in the filename (e.g., 'vs-brian-game-1').")
    ap.add_argument("--server-url", default="http://localhost:3001")
    ap.add_argument("--engine-color", default=None,
                    help="Override engine color (default: auto-detect from seat-assigned event).")
    ap.add_argument("--notes", default="",
                    help="Free-text note attached to this game in the manifest.")
    args = ap.parse_args()

    print(f"Fetching {args.room_id} from {args.server_url}...")
    events = fetch_events(args.server_url, args.room_id)
    print(f"  {len(events)} events")

    engine_color = args.engine_color or detect_engine_color(events)
    summary = summarize_game(events, engine_color)
    print(f"  engine={engine_color}, outcome={summary['outcome']}, plies={summary['plies']}, end_reason={summary['end_reason']}")

    _GAMES_DIR.mkdir(parents=True, exist_ok=True)
    safe_label = args.label.replace(" ", "-").replace("/", "-")
    game_filename = f"{safe_label}-{summary['outcome']}-{summary['plies']}p.jsonl"
    game_path = _GAMES_DIR / game_filename
    with game_path.open("w") as f:
        for e in events:
            f.write(json.dumps(e) + "\n")
    print(f"  wrote {game_path.relative_to(_REPO_ROOT)}")

    # Load or initialize manifest.
    if _MANIFEST.exists():
        manifest = json.loads(_MANIFEST.read_text())
    else:
        manifest = {
            "tier1_version": "python-tier1-current (current src/fow_chess, v0.9.5-equivalent)",
            "evaluator": "fow",
            "depth": 0,
            "max_particles": 16,
            "target_n": 256,
            "risk_aversion": 0.0,
            "max_plies": 200,
            "save_only": "pve-matches",
            "verbose_belief": False,
            "tier1_record": {"wins": 0, "losses": 0, "draws": 0},
            "games": [],
        }

    # Drop any existing entry for this label (idempotent overwrite).
    manifest["games"] = [g for g in manifest.get("games", []) if g.get("label") != safe_label]
    next_index = len(manifest["games"])
    manifest["games"].append({
        "index": next_index,
        "label": safe_label,
        "room_id": args.room_id,
        "tier1_color": engine_color,
        "outcome": summary["outcome"],
        "plies": summary["plies"],
        "end_reason": summary["end_reason"],
        "winner": summary["winner"],
        "path": f"games/{game_filename}",
        "notes": args.notes,
    })
    # Update record.
    rec = {"wins": 0, "losses": 0, "draws": 0}
    for g in manifest["games"]:
        if g["outcome"] == "W":
            rec["wins"] += 1
        elif g["outcome"] == "L":
            rec["losses"] += 1
        else:
            rec["draws"] += 1
    manifest["tier1_record"] = rec

    _MANIFEST.write_text(json.dumps(manifest, indent=2))
    print(f"  updated {_MANIFEST.relative_to(_REPO_ROOT)} ({len(manifest['games'])} games)")

    print()
    print("Browse:")
    print(f"  http://localhost:3000/?bakeoff=/bakeoff-pve-matches/manifest.json")
    print()
    print("Or jump straight to this game:")
    print(f"  http://localhost:3000/?bakeoff=/bakeoff-pve-matches/manifest.json&game={next_index}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

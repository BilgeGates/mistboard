"""Tests for Tier1Strategy short-circuits (king-capture, queen-capture, queen-save)."""

from __future__ import annotations

import chess

from fow_chess.engine import static_builder
from fow_chess.evaluator import material_evaluator
from fow_chess.move_priors import uniform_prior
from fow_chess.selfplay import PerspectiveView
from fow_chess.strategies import (
    Tier1Strategy,
    _categorize_king_defense_moves,
    _king_defense_moves,
    _prefer_higher_value_capture,
    _prefer_queen_promotion,
    _queen_save_moves,
    _safe_visible_minor_or_rook_captures,
    _squares_attacked_by_visible_enemy,
)
from fow_chess.visibility import visible_piece_map, visible_squares


def _build_view(
    board: chess.Board,
    perspective: chess.Color,
    *,
    visible_pieces: dict[chess.Square, chess.Piece] | None = None,
) -> PerspectiveView:
    """When `visible_pieces` is set, override visibility — useful for tests
    that want to exercise short-circuit logic without coupling to FOW
    visibility rules."""
    pieces = (
        visible_pieces
        if visible_pieces is not None
        else visible_piece_map(board, perspective)
    )
    return PerspectiveView(
        perspective=perspective,
        own_legal_moves=list(board.pseudo_legal_moves) if board.turn == perspective else [],
        visible_squares=visible_squares(board, perspective),
        visible_piece_map=pieces,
    )


def _strategy(seed: int = 0) -> Tier1Strategy:
    s = Tier1Strategy(
        evaluator_builder=static_builder(material_evaluator()),
        move_prior=uniform_prior,
        target_n=4,
        max_eval_particles=4,
        seed=seed,
    )
    return s


def test_queen_capture_fires_when_visible() -> None:
    # White queen on c5 attacked by black bishop on a3. Queen does NOT attack
    # black king on h8 (so king-defense doesn't pre-empt). Capture should fire.
    board = chess.Board.empty()
    board.set_piece_at(chess.A3, chess.Piece(chess.BISHOP, chess.BLACK))
    board.set_piece_at(chess.C5, chess.Piece(chess.QUEEN, chess.WHITE))
    board.set_piece_at(chess.H8, chess.Piece(chess.KING, chess.BLACK))
    board.set_piece_at(chess.A1, chess.Piece(chess.KING, chess.WHITE))
    board.turn = chess.BLACK

    s = _strategy()
    s.reset(perspective=chess.BLACK)
    view = _build_view(board, chess.BLACK)
    chosen = s.pick_move(view)
    assert chosen.from_square == chess.A3
    assert chosen.to_square == chess.C5, f"expected queen capture, got {chosen}"


def test_king_capture_beats_queen_capture() -> None:
    # Black has both a king-capture (rook on g8 → enemy king on g1) AND a
    # queen-capture (knight on f3 → enemy queen on h2). King-capture must win.
    board = chess.Board.empty()
    board.set_piece_at(chess.G1, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(chess.H2, chess.Piece(chess.QUEEN, chess.WHITE))
    board.set_piece_at(chess.F3, chess.Piece(chess.KNIGHT, chess.BLACK))
    board.set_piece_at(chess.G8, chess.Piece(chess.ROOK, chess.BLACK))
    board.set_piece_at(chess.E8, chess.Piece(chess.KING, chess.BLACK))
    board.turn = chess.BLACK

    s = _strategy()
    s.reset(perspective=chess.BLACK)
    view = _build_view(board, chess.BLACK)
    chosen = s.pick_move(view)
    assert chosen.to_square == chess.G1, f"expected king capture, got {chosen}"


def test_queen_save_fires_when_attacked_with_safe_square() -> None:
    # White queen on d8 attacked by black pawn on e7 (pawn captures e7→d8).
    # White queen has safe square c7 (not attacked by visible black pieces).
    board = chess.Board.empty()
    board.set_piece_at(chess.D8, chess.Piece(chess.QUEEN, chess.WHITE))
    board.set_piece_at(chess.E7, chess.Piece(chess.PAWN, chess.BLACK))
    board.set_piece_at(chess.E1, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(chess.A1, chess.Piece(chess.KING, chess.BLACK))
    board.turn = chess.WHITE

    s = _strategy()
    s.reset(perspective=chess.WHITE)
    view = _build_view(board, chess.WHITE)
    chosen = s.pick_move(view)
    # The queen must move; the destination must not be attacked by the e7 pawn.
    assert chosen.from_square == chess.D8, f"expected queen move, got {chosen}"
    # e7 pawn attacks d8 (where queen was) and f8. d8 is queen's start, so any
    # destination not on f8 (and not staying) is safe in this stripped position.
    assert chosen.to_square != chess.D8


def test_queen_save_skips_when_queen_not_visibly_attacked() -> None:
    # Queen safe on d4; no enemy attacks it.
    board = chess.Board.empty()
    board.set_piece_at(chess.D4, chess.Piece(chess.QUEEN, chess.WHITE))
    board.set_piece_at(chess.E1, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(chess.E8, chess.Piece(chess.KING, chess.BLACK))
    board.turn = chess.WHITE

    view = _build_view(board, chess.WHITE)
    saves = _queen_save_moves(view)
    assert saves == [], f"expected empty (queen not under visible attack) but got {saves}"


def test_king_defense_picks_king_flight() -> None:
    # Black king on e8 attacked by white bishop on a4 (a4-e8 diagonal). Black
    # king should flee to d8 or e7 (not on the diagonal).
    board = chess.Board.empty()
    board.set_piece_at(chess.E8, chess.Piece(chess.KING, chess.BLACK))
    board.set_piece_at(chess.A4, chess.Piece(chess.BISHOP, chess.WHITE))
    board.set_piece_at(chess.A1, chess.Piece(chess.KING, chess.WHITE))
    board.turn = chess.BLACK

    pieces = {
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
        chess.A4: chess.Piece(chess.BISHOP, chess.WHITE),
        chess.A1: chess.Piece(chess.KING, chess.WHITE),
    }

    s = _strategy()
    s.reset(perspective=chess.BLACK)
    view = _build_view(board, chess.BLACK, visible_pieces=pieces)
    chosen = s.pick_move(view)
    assert chosen.from_square == chess.E8, f"expected king move, got {chosen}"


def test_king_defense_captures_attacker() -> None:
    # White king on e1, black knight on f3 attacking e1. White rook on f1 can
    # capture f3. King-defense should include that capture.
    board = chess.Board.empty()
    board.set_piece_at(chess.E1, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(chess.F3, chess.Piece(chess.KNIGHT, chess.BLACK))
    board.set_piece_at(chess.F1, chess.Piece(chess.ROOK, chess.WHITE))
    board.set_piece_at(chess.E8, chess.Piece(chess.KING, chess.BLACK))
    board.turn = chess.WHITE

    pieces = {
        chess.E1: chess.Piece(chess.KING, chess.WHITE),
        chess.F3: chess.Piece(chess.KNIGHT, chess.BLACK),
        chess.F1: chess.Piece(chess.ROOK, chess.WHITE),
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
    }
    view = _build_view(board, chess.WHITE, visible_pieces=pieces)
    moves = _king_defense_moves(view)
    move_set = {m.uci() for m in moves}
    assert 'f1f3' in move_set, f"expected f1f3 (rook captures knight) in {move_set}"


def test_king_defense_blocks_sliding_attack() -> None:
    # White king on e1, black rook on e8 attacking down e-file. White knight on
    # g1 → e2 blocks the e-file.
    board = chess.Board.empty()
    board.set_piece_at(chess.E1, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(chess.E8, chess.Piece(chess.ROOK, chess.BLACK))
    board.set_piece_at(chess.G1, chess.Piece(chess.KNIGHT, chess.WHITE))
    board.set_piece_at(chess.A8, chess.Piece(chess.KING, chess.BLACK))
    board.turn = chess.WHITE

    pieces = {
        chess.E1: chess.Piece(chess.KING, chess.WHITE),
        chess.E8: chess.Piece(chess.ROOK, chess.BLACK),
        chess.G1: chess.Piece(chess.KNIGHT, chess.WHITE),
        chess.A8: chess.Piece(chess.KING, chess.BLACK),
    }
    view = _build_view(board, chess.WHITE, visible_pieces=pieces)
    moves = _king_defense_moves(view)
    move_set = {m.uci() for m in moves}
    assert 'g1e2' in move_set, f"expected g1e2 (knight blocks e-file) in {move_set}"


def test_king_defense_skips_when_king_not_attacked() -> None:
    board = chess.Board.empty()
    board.set_piece_at(chess.E1, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(chess.D4, chess.Piece(chess.KNIGHT, chess.BLACK))
    board.set_piece_at(chess.E8, chess.Piece(chess.KING, chess.BLACK))
    board.turn = chess.WHITE

    pieces = {
        chess.E1: chess.Piece(chess.KING, chess.WHITE),
        chess.D4: chess.Piece(chess.KNIGHT, chess.BLACK),
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
    }
    view = _build_view(board, chess.WHITE, visible_pieces=pieces)
    assert _king_defense_moves(view) == []


def test_king_defense_beats_queen_capture_when_king_attacked() -> None:
    # Black king on e8 attacked by white bishop on a4 (a4-e8 diagonal). Black
    # also has a queen-capture available (rook on h8 can take queen on h1
    # straight down the h-file). King-defense must dominate.
    board = chess.Board.empty()
    board.set_piece_at(chess.E8, chess.Piece(chess.KING, chess.BLACK))
    board.set_piece_at(chess.A4, chess.Piece(chess.BISHOP, chess.WHITE))
    board.set_piece_at(chess.A1, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(chess.H8, chess.Piece(chess.ROOK, chess.BLACK))
    board.set_piece_at(chess.H1, chess.Piece(chess.QUEEN, chess.WHITE))
    board.turn = chess.BLACK

    pieces = {
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
        chess.A4: chess.Piece(chess.BISHOP, chess.WHITE),
        chess.A1: chess.Piece(chess.KING, chess.WHITE),
        chess.H8: chess.Piece(chess.ROOK, chess.BLACK),
        chess.H1: chess.Piece(chess.QUEEN, chess.WHITE),
    }
    s = _strategy()
    s.reset(perspective=chess.BLACK)
    view = _build_view(board, chess.BLACK, visible_pieces=pieces)
    chosen = s.pick_move(view)
    assert chosen.uci() != 'h8h1', f"engine took queen instead of defending king: {chosen}"


def test_prefer_queen_promotion_filters_to_queen() -> None:
    moves = [
        chess.Move.from_uci('d2e1q'),
        chess.Move.from_uci('d2e1r'),
        chess.Move.from_uci('d2e1b'),
        chess.Move.from_uci('d2e1n'),
    ]
    filtered = _prefer_queen_promotion(moves)
    assert len(filtered) == 1
    assert filtered[0].promotion == chess.QUEEN


def test_prefer_queen_promotion_passthrough_when_no_promotions() -> None:
    moves = [
        chess.Move.from_uci('e2e4'),
        chess.Move.from_uci('d2d4'),
    ]
    assert _prefer_queen_promotion(moves) == moves


def test_queen_save_includes_attacker_capture_by_other_piece() -> None:
    # Black queen on d3 attacked by white knight on e5. Black pawn on d6 can
    # capture the knight (d6e5; black-pawn diagonal capture toward rank 1).
    # Old queen-save only considered queen-moves; new general version includes
    # captures of the attacker by other pieces.
    pieces = {
        chess.D3: chess.Piece(chess.QUEEN, chess.BLACK),
        chess.E5: chess.Piece(chess.KNIGHT, chess.WHITE),
        chess.D6: chess.Piece(chess.PAWN, chess.BLACK),
        chess.E1: chess.Piece(chess.KING, chess.WHITE),
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
    }
    board = chess.Board.empty()
    for sq, p in pieces.items():
        board.set_piece_at(sq, p)
    board.turn = chess.BLACK

    view = _build_view(board, chess.BLACK, visible_pieces=pieces)
    saves = _queen_save_moves(view)
    save_set = {m.uci() for m in saves}
    assert 'd6e5' in save_set, f"expected d6e5 (pawn captures attacker) in {save_set}"


def test_squares_attacked_by_visible_enemy_basic() -> None:
    # Hand-build a PerspectiveView with an explicit visible_piece_map so we can
    # exercise the helper without relying on Bichess visibility rules — black
    # rook on e4 + white king on e1, pretending both are mutually visible.
    pieces = {
        chess.E4: chess.Piece(chess.ROOK, chess.BLACK),
        chess.E1: chess.Piece(chess.KING, chess.WHITE),
    }
    view = PerspectiveView(
        perspective=chess.WHITE,
        own_legal_moves=[],
        visible_squares=chess.SquareSet(),
        visible_piece_map=pieces,
    )
    attacked = _squares_attacked_by_visible_enemy(view)
    assert chess.E1 in attacked  # rook attacks down e-file to white king
    assert chess.A4 in attacked  # rook attacks across 4th rank
    assert chess.D5 not in attacked  # rook doesn't move diagonally


def test_capture_detection_decrements_opp_count_after_visible_capture() -> None:
    """When pick_move chooses a move landing on a visible enemy piece, the
    next observe_own_move should register the capture on belief.opp_remaining_counts."""
    # White queen on c5 captures black bishop on a3.
    board = chess.Board.empty()
    board.set_piece_at(chess.A3, chess.Piece(chess.BISHOP, chess.BLACK))
    board.set_piece_at(chess.C5, chess.Piece(chess.QUEEN, chess.WHITE))
    board.set_piece_at(chess.H8, chess.Piece(chess.KING, chess.BLACK))
    board.set_piece_at(chess.A1, chess.Piece(chess.KING, chess.WHITE))
    board.turn = chess.BLACK  # black moves; can capture white queen

    s = _strategy()
    s.reset(perspective=chess.BLACK)
    view = _build_view(board, chess.BLACK)
    chosen = s.pick_move(view)
    # Queen-capture short-circuit fires on a3xc5.
    assert chosen.from_square == chess.A3
    assert chosen.to_square == chess.C5
    assert s._pending_capture_type == chess.QUEEN

    # Drive observe_own_move to consume the pending capture. We need a real
    # observation, so build one from the board transition.
    from fow_chess.observation import observation_from_transition
    prev = board.copy()
    next_board = board.copy()
    next_board.push(chosen)
    obs = observation_from_transition(prev, next_board, chess.BLACK)

    # White-queen count was 1; after capture it should be 0.
    pre = s._belief.opp_remaining_counts[chess.QUEEN]
    s.observe_own_move(chosen, obs)
    post = s._belief.opp_remaining_counts[chess.QUEEN]
    assert pre == 1 and post == 0
    # Pending capture cleared after consumption.
    assert s._pending_capture_type is None


def test_capture_detection_skips_non_capture_move() -> None:
    """A quiet move should not flag a pending capture."""
    board = chess.Board()
    s = _strategy()
    s.reset(perspective=chess.WHITE)
    view = _build_view(board, chess.WHITE)
    s.pick_move(view)
    # Standard opening: nothing visibly captured.
    assert s._pending_capture_type is None


# ============================================================================
# v0.6.1 Pattern A: rank king-defense as captures > blocks > flights.
# ============================================================================


def test_king_defense_prefers_attacker_capture_over_flight() -> None:
    """White king on e1 attacked by black knight on f3. White pawn on g2 can
    capture the knight (g2xf3). King also has flight squares (e2, d2). The
    capture must win — flight was the v0.6.0-mirror bug."""
    pieces = {
        chess.E1: chess.Piece(chess.KING, chess.WHITE),
        chess.G2: chess.Piece(chess.PAWN, chess.WHITE),
        chess.F3: chess.Piece(chess.KNIGHT, chess.BLACK),
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
    }
    board = chess.Board.empty()
    for sq, p in pieces.items():
        board.set_piece_at(sq, p)
    board.turn = chess.WHITE

    s = _strategy()
    s.reset(perspective=chess.WHITE)
    view = _build_view(board, chess.WHITE, visible_pieces=pieces)
    chosen = s.pick_move(view)
    assert chosen.from_square == chess.G2 and chosen.to_square == chess.F3, (
        f"expected attacker-capture g2xf3, got {chosen}"
    )


def test_king_defense_prefers_higher_material_attacker_capture() -> None:
    """King attacked by visible queen; both a pawn and a rook can capture the
    queen. Pawn-takes-queen wins on material — but attacker-capture preference
    + max-material rule should pick whichever pawn or rook capture. We just
    verify a queen capture is selected (not a king flight).
    """
    # Black king on e8 in check from white queen on e4 (down e-file).
    # Black rook on a4 can capture queen (a4xe4). Black pawn on f5 can NOT
    # diagonally take e4 (it'd take whatever's on e4 from f5? f5 captures e4 OK).
    pieces = {
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
        chess.E4: chess.Piece(chess.QUEEN, chess.WHITE),
        chess.A4: chess.Piece(chess.ROOK, chess.BLACK),
        chess.F5: chess.Piece(chess.PAWN, chess.BLACK),
        chess.H1: chess.Piece(chess.KING, chess.WHITE),  # off rook's file/rank
    }
    board = chess.Board.empty()
    for sq, p in pieces.items():
        board.set_piece_at(sq, p)
    board.turn = chess.BLACK

    s = _strategy()
    s.reset(perspective=chess.BLACK)
    view = _build_view(board, chess.BLACK, visible_pieces=pieces)
    chosen = s.pick_move(view)
    # Either a4xe4 or f5xe4 — both capture the queen. Reject king flight.
    assert chosen.to_square == chess.E4, f"expected attacker capture, got {chosen}"


def test_categorize_king_defense_moves_partitions_correctly() -> None:
    """Hand-built position: white king on e1 attacked by black bishop on a5
    (a5-e1 diagonal). Resolutions:
      - capture: white knight on b4 takes a5 (Nxa5)
      - block: white pawn on c2 doesn't block; white pawn on d2 plays d3 to
        block on d2's path? Actually the diagonal a5-b4-c3-d2-e1 — a knight
        on b4 already breaks it; need a different setup.
    Simpler: white king e1, bishop attacks via a5-b4-c3-d2-e1 with empty
    diagonal. Block by interposing on c3, d2, or b4.
    """
    pieces = {
        chess.E1: chess.Piece(chess.KING, chess.WHITE),
        chess.A5: chess.Piece(chess.BISHOP, chess.BLACK),
        chess.G1: chess.Piece(chess.ROOK, chess.WHITE),  # for blocking via Rd1, etc.
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
    }
    board = chess.Board.empty()
    for sq, p in pieces.items():
        board.set_piece_at(sq, p)
    board.turn = chess.WHITE

    view = _build_view(board, chess.WHITE, visible_pieces=pieces)
    captures, blocks, flights = _categorize_king_defense_moves(view)
    # The lone bishop is the only attacker. King flights to non-diagonal squares
    # exist (e.g., e2, f1). Blocks: nothing here can interpose since rook on
    # g1 can't reach d2/c3/b4 in one move along the rank? Rg1-d1 doesn't
    # interpose. So expect captures=[] (rook can't reach a5), blocks=[] (no
    # piece can interpose), flights non-empty.
    capture_squares = {m.to_square for m in captures}
    flight_squares = {m.to_square for m in flights}
    # No piece can capture a5.
    assert chess.A5 not in capture_squares
    # King can flee to e2 (not on diagonal).
    assert chess.E2 in flight_squares


# ============================================================================
# v0.6.1 Pattern A: belief-grounded king-attack veto.
# ============================================================================


def test_belief_veto_drops_candidate_when_majority_of_particles_attacked() -> None:
    """If most particles place a hidden bishop on a discovered-check line,
    veto the candidate move that exposes it."""
    # White king on e1, white knight on c3 (only piece blocking a black bishop's
    # check from a5 along a5-b4-c3-d2-e1 diagonal). If knight moves, king is
    # checked. We construct particles where the bishop on a5 is hypothesized;
    # verify candidate Nc3-Nd5 (which moves the knight off c3) gets vetoed.
    pieces = {
        chess.E1: chess.Piece(chess.KING, chess.WHITE),
        chess.C3: chess.Piece(chess.KNIGHT, chess.WHITE),
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
    }
    # Build a particle that has the bishop on a5 (hidden from white).
    particle = chess.Board.empty()
    for sq, p in pieces.items():
        particle.set_piece_at(sq, p)
    particle.set_piece_at(chess.A5, chess.Piece(chess.BISHOP, chess.BLACK))
    particle.turn = chess.WHITE

    s = _strategy()
    s.reset(perspective=chess.WHITE)
    s._belief.particles = [particle.copy(), particle.copy()]
    s._belief.weights = [1.0, 1.0]
    move = chess.Move.from_uci("c3d5")  # knight off c3 → bishop checks e1
    view_board = chess.Board.empty()
    for sq, p in pieces.items():
        view_board.set_piece_at(sq, p)
    view_board.turn = chess.WHITE
    view = _build_view(view_board, chess.WHITE, visible_pieces=pieces)
    survivors = s._belief_veto_king_attack([move], view)
    assert survivors == [], "all particles agree on hidden discovered check; veto must fire"


def test_belief_veto_passes_candidate_when_minority_of_particles_attacked() -> None:
    """One hallucinating particle isn't enough to veto."""
    pieces = {
        chess.E1: chess.Piece(chess.KING, chess.WHITE),
        chess.C3: chess.Piece(chess.KNIGHT, chess.WHITE),
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
    }
    base = chess.Board.empty()
    for sq, p in pieces.items():
        base.set_piece_at(sq, p)
    base.turn = chess.WHITE
    # 1 of 3 particles hallucinates bishop on a5; 2 don't.
    p_with = base.copy()
    p_with.set_piece_at(chess.A5, chess.Piece(chess.BISHOP, chess.BLACK))

    s = _strategy()
    s.reset(perspective=chess.WHITE)
    s._belief.particles = [p_with, base.copy(), base.copy()]
    s._belief.weights = [1.0, 1.0, 1.0]
    move = chess.Move.from_uci("c3d5")
    view = _build_view(base, chess.WHITE, visible_pieces=pieces)
    survivors = s._belief_veto_king_attack([move], view)
    assert survivors == [move], "1/3 particles isn't a majority; veto should not fire"


# ============================================================================
# v0.6.1 Pattern B: safe-visible-minor-or-rook capture short-circuit.
# ============================================================================


def test_safe_visible_capture_fires_on_undefended_bishop() -> None:
    """Black knight on e3 can capture white bishop on f1; f1 isn't attacked
    by any visible white piece. Expected: short-circuit picks Nxf1."""
    pieces = {
        chess.E3: chess.Piece(chess.KNIGHT, chess.BLACK),
        chess.F1: chess.Piece(chess.BISHOP, chess.WHITE),
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
        chess.A1: chess.Piece(chess.KING, chess.WHITE),
    }
    board = chess.Board.empty()
    for sq, p in pieces.items():
        board.set_piece_at(sq, p)
    board.turn = chess.BLACK

    view = _build_view(board, chess.BLACK, visible_pieces=pieces)
    captures = _safe_visible_minor_or_rook_captures(view)
    assert any(m.to_square == chess.F1 for m in captures), (
        f"expected Nxf1 in {[m.uci() for m in captures]}"
    )


def test_safe_visible_capture_skips_when_destination_visibly_attacked() -> None:
    """Bishop on f1 visibly defended by white king on e1 — destination is
    attacked by enemy king, so this is not a 'free' capture. Short-circuit
    must NOT fire (let main-eval decide whether the trade is worth it)."""
    pieces = {
        chess.E3: chess.Piece(chess.KNIGHT, chess.BLACK),
        chess.F1: chess.Piece(chess.BISHOP, chess.WHITE),
        chess.E1: chess.Piece(chess.KING, chess.WHITE),  # defends f1
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
    }
    board = chess.Board.empty()
    for sq, p in pieces.items():
        board.set_piece_at(sq, p)
    board.turn = chess.BLACK

    view = _build_view(board, chess.BLACK, visible_pieces=pieces)
    captures = _safe_visible_minor_or_rook_captures(view)
    assert captures == [], (
        f"expected no safe captures (king defends f1); got {[m.uci() for m in captures]}"
    )


def test_safe_visible_capture_prefers_higher_material() -> None:
    """Knight can capture either a bishop on f1 or a rook on h6, both safe.
    Rook (5) > bishop (3) — short-circuit should restrict to rook capture."""
    pieces = {
        chess.G4: chess.Piece(chess.KNIGHT, chess.BLACK),
        chess.F1: chess.Piece(chess.BISHOP, chess.WHITE),  # could be reachable from h2; skip realism
        chess.H6: chess.Piece(chess.ROOK, chess.WHITE),
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
        chess.A1: chess.Piece(chess.KING, chess.WHITE),
    }
    board = chess.Board.empty()
    for sq, p in pieces.items():
        board.set_piece_at(sq, p)
    board.turn = chess.BLACK

    view = _build_view(board, chess.BLACK, visible_pieces=pieces)
    captures = _safe_visible_minor_or_rook_captures(view)
    capture_squares = {m.to_square for m in captures}
    # Only the rook capture should remain (max material).
    assert chess.H6 in capture_squares
    assert chess.F1 not in capture_squares


def test_safe_visible_capture_skips_pawns() -> None:
    """A visible undefended pawn capture is not auto-fired — main-eval can decide."""
    pieces = {
        chess.E3: chess.Piece(chess.KNIGHT, chess.BLACK),
        chess.C2: chess.Piece(chess.PAWN, chess.WHITE),
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
        chess.A1: chess.Piece(chess.KING, chess.WHITE),
    }
    board = chess.Board.empty()
    for sq, p in pieces.items():
        board.set_piece_at(sq, p)
    board.turn = chess.BLACK
    view = _build_view(board, chess.BLACK, visible_pieces=pieces)
    captures = _safe_visible_minor_or_rook_captures(view)
    assert captures == []


def test_prefer_higher_value_capture_helper() -> None:
    """Rxqueen beats Rxpawn."""
    pieces = {
        chess.A1: chess.Piece(chess.ROOK, chess.WHITE),
        chess.A8: chess.Piece(chess.QUEEN, chess.BLACK),
        chess.B1: chess.Piece(chess.PAWN, chess.BLACK),
        chess.E1: chess.Piece(chess.KING, chess.WHITE),
        chess.E8: chess.Piece(chess.KING, chess.BLACK),
    }
    board = chess.Board.empty()
    for sq, p in pieces.items():
        board.set_piece_at(sq, p)
    board.turn = chess.WHITE
    view = _build_view(board, chess.WHITE, visible_pieces=pieces)
    captures = [
        chess.Move.from_uci("a1a8"),  # Rxqueen
        chess.Move.from_uci("a1b1"),  # Rxpawn
    ]
    filtered = _prefer_higher_value_capture(captures, view)
    assert filtered == [chess.Move.from_uci("a1a8")]

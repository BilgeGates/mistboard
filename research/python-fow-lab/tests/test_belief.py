import chess

from fow_chess.belief import BeliefState
from fow_chess.move_priors import uniform_prior
from fow_chess.observation import observation_from_transition
from fow_chess.visibility import visible_piece_map, visible_squares


def test_initial_belief_holds_a_single_seeded_particle() -> None:
    belief = BeliefState.initial(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=64,
    )

    assert len(belief.particles) == 1
    assert belief.particles[0].fen() == chess.Board().fen()


def test_own_move_advances_every_particle() -> None:
    belief = BeliefState.initial(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=64,
    )
    move = chess.Move.from_uci("e2e4")

    belief.update_after_own_move(move)

    expected = chess.Board()
    expected.push(move)
    assert len(belief.particles) == 1
    assert belief.particles[0].fen() == expected.fen()


def test_canonical_truth_survives_opp_move_update() -> None:
    seed = chess.Board()
    seed.push_uci("e2e4")

    belief = BeliefState.initial(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=128,
        start_board=seed,
    )

    truth = seed.copy()
    truth.push_uci("d7d5")
    obs = observation_from_transition(seed, truth, chess.WHITE)

    belief.update_after_opp_move(obs)

    assert not belief.collapsed()
    truth_fen = truth.fen()
    assert any(p.fen() == truth_fen for p in belief.particles)


def test_observation_filter_rejects_inconsistent_particle_branches() -> None:
    seed = chess.Board()
    seed.push_uci("e2e4")

    belief = BeliefState.initial(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=256,
        start_board=seed,
    )

    truth = seed.copy()
    truth.push_uci("d7d5")
    obs = observation_from_transition(seed, truth, chess.WHITE)

    belief.update_after_opp_move(obs)

    truth_visibility = visible_squares(truth, chess.WHITE)
    truth_pieces = visible_piece_map(truth, chess.WHITE)
    for particle in belief.particles:
        assert visible_squares(particle, chess.WHITE) == truth_visibility
        assert visible_piece_map(particle, chess.WHITE) == truth_pieces


def test_marginals_sum_to_one_when_belief_is_alive() -> None:
    belief = BeliefState.initial(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=16,
    )

    marginal = belief.marginal_piece_at(chess.E8)

    assert marginal
    total = sum(marginal.values())
    assert abs(total - 1.0) < 1e-9


def test_stage_a_rollback_when_observation_kills_all_particles() -> None:
    """Stage A's observation filter should fall back to pre-filter particles
    rather than letting belief drop to zero. Construct a belief where the
    observation would prune every particle (mismatched visible_piece_map),
    and verify particles survive."""
    import random
    from fow_chess.observation import Observation
    belief = BeliefState.initial(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=4,
        rng=random.Random(0),
    )
    move = chess.Move.from_uci("e2e4")
    # Construct an observation that disagrees with what the canonical board
    # actually shows post-move. Lying about visibility forces every particle
    # to be inconsistent.
    bad_obs = Observation(
        visibility_mask=chess.SquareSet(chess.BB_RANK_1 | chess.BB_RANK_2),
        visible_pieces={chess.A8: chess.Piece(chess.QUEEN, chess.BLACK)},  # nonsense
        own_capture_square=None,
        game_over=None,
    )
    belief.update_after_own_move(move, bad_obs)
    # Rollback: pushed-but-not-filtered particles should survive.
    assert len(belief.particles) > 0
    # And they should have the move applied.
    assert all(b.piece_at(chess.E4) is not None for b in belief.particles)


def test_initial_opp_remaining_counts_match_standard_start() -> None:
    """Standard chess start: 8 pawns, 2 of N/B/R, 1 Q, 1 K for the opponent."""
    belief = BeliefState.initial(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=8,
    )
    assert belief.opp_remaining_counts == {
        chess.PAWN: 8,
        chess.KNIGHT: 2,
        chess.BISHOP: 2,
        chess.ROOK: 2,
        chess.QUEEN: 1,
        chess.KING: 1,
    }


def test_register_capture_decrements_count() -> None:
    belief = BeliefState.initial(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=8,
    )
    belief.register_capture(chess.KNIGHT)
    assert belief.opp_remaining_counts[chess.KNIGHT] == 1
    belief.register_capture(chess.KNIGHT)
    assert belief.opp_remaining_counts[chess.KNIGHT] == 0
    # Floor at zero, never negative.
    belief.register_capture(chess.KNIGHT)
    assert belief.opp_remaining_counts[chess.KNIGHT] == 0


def test_stage_b_constraint_prunes_phantom_pieces() -> None:
    """If we've captured an opp knight, no surviving particle should have 2 opp knights.

    Hand-construct two particles to exercise pruning: one canonical (2 black
    knights — phantom under our bound) and one with one knight already removed
    (consistent). After Stage B, only the 1-knight particle's expansions can
    survive primary filtering.
    """
    import random
    seed_canonical = chess.Board()
    seed_canonical.push_uci("e2e4")  # black to move

    seed_one_knight = seed_canonical.copy()
    seed_one_knight.remove_piece_at(chess.B8)  # opp now has 1 knight

    belief = BeliefState(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=64,
        particles=[seed_canonical, seed_one_knight],
        weights=[1.0, 1.0],
        rng=random.Random(0),
    )
    # Bound says opp has only 1 knight remaining (we captured one).
    belief.opp_remaining_counts[chess.KNIGHT] = 1

    # Construct an observation consistent with the canonical line e2e4 e7e5.
    truth = seed_canonical.copy()
    truth.push_uci("e7e5")
    obs = observation_from_transition(seed_canonical, truth, chess.WHITE)
    belief.update_after_opp_move(obs)

    for particle in belief.particles:
        knight_count = sum(
            1
            for p in particle.piece_map().values()
            if p.color == chess.BLACK and p.piece_type == chess.KNIGHT
        )
        assert knight_count <= 1


def test_stage_a_reseed_when_step1_wipes_all_particles() -> None:
    """v0.6.3: when no particle has my_move pseudo-legal, reseed from the
    post-move observation rather than collapsing to zero particles.

    Construct a contrived case: belief has one particle where the move
    isn't pseudo-legal (a piece is missing from from_square in the
    particle). With reseed enabled, post-update belief should have one
    particle reflecting the visible post-move state.
    """
    import random
    # Belief seeded with an empty board (no piece on e2). The move e2e4
    # therefore has no pseudo-legal support.
    empty_board = chess.Board.empty()
    empty_board.turn = chess.WHITE
    belief = BeliefState(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=4,
        particles=[empty_board],
        weights=[1.0],
        rng=random.Random(0),
    )
    move = chess.Move.from_uci("e2e4")
    # Build a post-move observation showing pawn on e4 (the canonical post-move
    # state from a visibility perspective).
    truth_pre = chess.Board()
    truth_post = truth_pre.copy()
    truth_post.push(move)
    obs = observation_from_transition(truth_pre, truth_post, chess.WHITE)
    belief.update_after_own_move(move, obs)
    # Reseed produces exactly one particle.
    assert len(belief.particles) == 1
    # The reseeded particle reflects the visible post-move state.
    assert belief.particles[0].piece_at(chess.E4) == chess.Piece(chess.PAWN, chess.WHITE)


def test_stage_b_constraint_pruned_diagnostic_increments() -> None:
    """`last_constraint_pruned` should be > 0 when the constraint actually
    rejects expanded particles."""
    seed = chess.Board()
    seed.push_uci("e2e4")  # white move first so opp (black) can move next
    belief = BeliefState.initial(
        perspective=chess.WHITE,
        move_prior=uniform_prior,
        target_n=32,
        start_board=seed,
    )
    # Pretend we've captured all queens — opp has 0 queens. Every expansion
    # still has the queen on d8, so the constraint should fire on each.
    belief.opp_remaining_counts[chess.QUEEN] = 0

    truth = seed.copy()
    truth.push_uci("e7e5")
    obs = observation_from_transition(seed, truth, chess.WHITE)
    belief.update_after_opp_move(obs)

    assert belief.last_constraint_pruned > 0

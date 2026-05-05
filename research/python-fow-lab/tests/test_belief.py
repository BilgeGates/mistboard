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

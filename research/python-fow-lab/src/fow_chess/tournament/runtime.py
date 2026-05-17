"""Per-config runtime: Stockfish process(es) + strategy factory.

`bot_runtime(config, stockfish_path)` is a context manager that:
- Stands up Stockfish subprocesses for evaluator and prior (when used).
- Yields a `StrategyFactory` callable: `(seed: int) -> Strategy`.
- Tears down subprocesses on exit.

This is the "one Stockfish per unique config" boundary the engine roadmap
calls out. Two games using the same config inside one `with bot_runtime(...)`
block share the same evaluator + prior subprocesses. Two configs in separate
runtimes get separate processes (correct — different evaluator depth, different
prior parameters, can't share).

When `config.engine_version` is set, the runtime loads strategies and helpers
from the named snapshot under `engine_versions/` instead of the live source
tree. This is Stage 1.5 of the calibration roadmap — direct head-to-head
between pinned versions and current code in one process.
"""

from __future__ import annotations

from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterator

import chess

from .config import BotConfig, BotConfigError
from .versioned_loader import load_versioned_engine

_LAB_ROOT = Path(__file__).resolve().parent.parent.parent.parent

StrategyFactory = Callable[[int], object]


@dataclass
class _EngineNamespace:
    """References to the engine code in use (current or snapshot)."""

    Tier1Strategy: type
    LegalGreedy: type
    RandomStrategy: type
    static_builder: Callable
    fog_aware_evaluator: Callable
    stockfish_evaluator: Any  # context manager factory
    material_evaluator: Callable
    stockfish_shallow_prior_ctx: Any  # context manager factory
    uniform_prior: Callable
    Evaluator: type
    EvaluatorBuilder: Any
    OpponentMovePrior: Any


def _resolve_namespace(config: BotConfig) -> _EngineNamespace:
    if config.engine_version is None:
        from ..engine import Evaluator, EvaluatorBuilder, static_builder
        from ..evaluator import (
            fog_aware_evaluator,
            material_evaluator,
            stockfish_evaluator,
        )
        from ..move_priors import (
            OpponentMovePrior,
            stockfish_shallow_prior_ctx,
            uniform_prior,
        )
        from ..strategies import LegalGreedy, RandomStrategy, Tier1Strategy

        return _EngineNamespace(
            Tier1Strategy=Tier1Strategy,
            LegalGreedy=LegalGreedy,
            RandomStrategy=RandomStrategy,
            static_builder=static_builder,
            fog_aware_evaluator=fog_aware_evaluator,
            stockfish_evaluator=stockfish_evaluator,
            material_evaluator=material_evaluator,
            stockfish_shallow_prior_ctx=stockfish_shallow_prior_ctx,
            uniform_prior=uniform_prior,
            Evaluator=Evaluator,
            EvaluatorBuilder=EvaluatorBuilder,
            OpponentMovePrior=OpponentMovePrior,
        )

    # Pinned version — load snapshot
    snapshot_dir = _LAB_ROOT / "engine_versions" / config.engine_version
    if not snapshot_dir.is_dir():
        raise BotConfigError(
            f"{config.name}: engine_version {config.engine_version!r} "
            f"not found at {snapshot_dir}. List available pins with "
            f"`ls engine_versions/`."
        )
    ns = load_versioned_engine(snapshot_dir)
    return _EngineNamespace(
        Tier1Strategy=ns.strategies.Tier1Strategy,
        LegalGreedy=ns.strategies.LegalGreedy,
        RandomStrategy=ns.strategies.RandomStrategy,
        static_builder=ns.engine.static_builder,
        fog_aware_evaluator=ns.evaluator.fog_aware_evaluator,
        stockfish_evaluator=ns.evaluator.stockfish_evaluator,
        material_evaluator=ns.evaluator.material_evaluator,
        stockfish_shallow_prior_ctx=ns.move_priors.stockfish_shallow_prior_ctx,
        uniform_prior=ns.move_priors.uniform_prior,
        Evaluator=ns.engine.Evaluator,
        EvaluatorBuilder=ns.engine.EvaluatorBuilder,
        OpponentMovePrior=ns.move_priors.OpponentMovePrior,
    )


@contextmanager
def bot_runtime(
    config: BotConfig,
    *,
    stockfish_path: str = "stockfish",
) -> Iterator[StrategyFactory]:
    ns = _resolve_namespace(config)

    if config.kind == "tier1":
        with ExitStack() as stack:
            evaluate = _enter_evaluator(stack, config, stockfish_path, ns)
            prior = _enter_prior(stack, config, stockfish_path, ns)
            base_builder = ns.static_builder(evaluate)
            if config.fog_lambda > 0:
                fog_lambda = config.fog_lambda
                fog_aware = ns.fog_aware_evaluator

                def builder(view, _b=base_builder, _l=fog_lambda):
                    return fog_aware(_b(view), _l)
            else:
                builder = base_builder

            target_n = config.target_n
            max_particles = config.max_particles
            risk_aversion = config.risk_aversion
            mcts_rollouts = config.mcts_rollouts
            mcts_rollout_depth = config.mcts_rollout_depth
            mcts_selection_depth = config.mcts_selection_depth
            mcts_risk_lambda = config.mcts_risk_lambda
            tier1_cls = ns.Tier1Strategy

            def factory(seed: int) -> object:
                return tier1_cls(
                    evaluator_builder=builder,
                    move_prior=prior,
                    target_n=target_n,
                    max_eval_particles=max_particles,
                    risk_aversion=risk_aversion,
                    seed=seed,
                    mcts_rollouts=mcts_rollouts,
                    mcts_rollout_depth=mcts_rollout_depth,
                    mcts_selection_depth=mcts_selection_depth,
                    mcts_risk_lambda=mcts_risk_lambda,
                )

            yield factory
        return

    if config.kind == "legal_greedy":
        legal_greedy_cls = ns.LegalGreedy

        def factory(seed: int) -> object:
            return legal_greedy_cls(seed=seed)
        yield factory
        return

    if config.kind == "random":
        random_cls = ns.RandomStrategy

        def factory(seed: int) -> object:
            return random_cls(seed=seed)
        yield factory
        return

    raise BotConfigError(f"unknown kind: {config.kind!r}")


def _enter_evaluator(
    stack: ExitStack,
    config: BotConfig,
    stockfish_path: str,
    ns: _EngineNamespace,
):
    if config.evaluator == "stockfish":
        depth = config.evaluator_depth or 4
        return stack.enter_context(
            ns.stockfish_evaluator(path=stockfish_path, depth=depth)
        )
    if config.evaluator == "material":
        return ns.material_evaluator()
    if config.evaluator == "fow":
        from ..evaluator import fow_evaluator
        return fow_evaluator()
    raise BotConfigError(
        f"{config.name}: tier1 requires evaluator in {{stockfish, material, fow}}, "
        f"got {config.evaluator!r}"
    )


def _enter_prior(
    stack: ExitStack,
    config: BotConfig,
    stockfish_path: str,
    ns: _EngineNamespace,
):
    if config.prior == "stockfish_shallow":
        return stack.enter_context(
            ns.stockfish_shallow_prior_ctx(
                path=stockfish_path,
                depth=config.prior_depth or 4,
                movetime_ms=config.prior_movetime_ms or 50,
                top_k=config.prior_top_k or 8,
                softmax_temperature_cp=config.prior_temperature_cp or 100.0,
                uniform_blend=(
                    config.prior_uniform_blend
                    if config.prior_uniform_blend is not None
                    else 0.3
                ),
            )
        )
    if config.prior == "uniform" or config.prior is None:
        return ns.uniform_prior
    raise BotConfigError(
        f"{config.name}: prior must be in {{uniform, stockfish_shallow}}, "
        f"got {config.prior!r}"
    )

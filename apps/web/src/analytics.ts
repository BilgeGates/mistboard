import {
  type GameSpec,
  type GameSpecId,
  gameSpecForId,
  gameSpecForLegacyLiveRoom,
  timeClassFromTimeControl,
  type VariantId,
} from '@mistboard/game';

export type GameSpecAnalyticsProps = {
  game_spec: GameSpec['id'];
  family: GameSpec['family'];
  setup: GameSpec['setup'];
  visibility: GameSpec['visibility'];
  rating_pool: GameSpec['ratingPoolBase'];
};

export function classifyTimeControl(
  initialMs: number,
  incrementMs: number,
): 'bullet' | 'blitz' | 'rapid' | 'classical' {
  // Official Mistboard TCs always agree with the rating-bucket classifier;
  // unofficial TCs (loadtest, dev sandboxes) fall back to a chess.com-style
  // heuristic so analytics still tags them sensibly.
  const official = timeClassFromTimeControl(initialMs, incrementMs);
  if (official) return official;
  const estimated = initialMs + 40 * incrementMs;
  if (estimated < 3 * 60 * 1000) return 'bullet';
  if (estimated < 8 * 60 * 1000) return 'blitz';
  if (estimated < 25 * 60 * 1000) return 'rapid';
  return 'classical';
}

function analyticsPropsFromSpec(spec: GameSpec): GameSpecAnalyticsProps {
  return {
    game_spec: spec.id,
    family: spec.family,
    setup: spec.setup,
    visibility: spec.visibility,
    rating_pool: spec.ratingPoolBase,
  };
}

export function gameSpecAnalyticsProps(input: {
  variant?: VariantId | string | null;
  hiddenDraft960?: boolean | string | null;
}): GameSpecAnalyticsProps {
  return analyticsPropsFromSpec(gameSpecForLegacyLiveRoom(input));
}

// The legacy resolver only covers chess/draft960; this resolves any canonical
// game spec (e.g. Dark Mini Xiangqi) so lobby analytics aren't mislabeled chess.
export function gameSpecAnalyticsPropsForId(gameSpecId: GameSpecId): GameSpecAnalyticsProps {
  return analyticsPropsFromSpec(gameSpecForId(gameSpecId));
}

type PostHogLike = {
  capture: (name: string, props?: Record<string, unknown>) => void;
  captureException?: (error: unknown, props?: Record<string, unknown>) => void;
  identify: (distinctId: string, props?: Record<string, unknown>) => void;
  reset: () => void;
};

let posthogInstance: PostHogLike | null = null;
// Actions queued before posthog-js finishes its async import (see main.ts).
// Closures keep capture/identify/reset uniform so ordering is preserved.
const pending: Array<(ph: PostHogLike) => void> = [];

function enqueue(action: (ph: PostHogLike) => void): void {
  if (posthogInstance) {
    action(posthogInstance);
  } else if (import.meta.env.PROD) {
    pending.push(action);
  }
}

export function setPostHogInstance(instance: PostHogLike): void {
  posthogInstance = instance;
  while (pending.length > 0) {
    pending.shift()!(instance);
  }
}

export function track(name: string, props?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.log('[track]', name, props ?? {});
  }
  enqueue((ph) => ph.capture(name, props));
}

// Report a CAUGHT error to PostHog Error Tracking. posthog's automatic
// capture_exceptions only sees UNHANDLED errors/promise rejections, so any error
// we swallow into a friendly UI panel is invisible to monitoring unless we report
// it here. Groups in Error Tracking the same as an unhandled throw (and rides the
// same before_send filter). No-op in DEV; queues until posthog loads in PROD.
export function captureException(error: unknown, props?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.error('[captureException]', error, props ?? {});
    return;
  }
  enqueue((ph) => {
    if (ph.captureException) {
      ph.captureException(error, props);
    } else {
      ph.capture('$exception', {
        ...props,
        $exception_message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export type GameLifecycleStatusType = 'pregame' | 'playing' | 'finished' | 'aborted';

export type GameFinishedOutcome = {
  winner: string | null;
  reason: string;
  moveNumber: number;
};

export type GameLifecycleTracker = {
  // Call on every render with the current game status. Emits `game_started` on
  // the first transition into `playing` and `game_finished` on entering
  // `finished`. Repeated calls with the same status are no-ops, so it is safe to
  // drive from a render loop. `baseProps` should carry game-spec/time-control
  // identity (see gameSpecAnalyticsProps) so the funnel is sliceable by variant.
  update: (
    input: {
      statusType: GameLifecycleStatusType;
      baseProps: Record<string, unknown>;
      outcome?: GameFinishedOutcome | null;
    } | null,
  ) => void;
  reset: () => void;
};

// One implementation of the start/finish funnel, shared by every live runtime
// (chess + Dark Mini Xiangqi) so the event schema can't drift between parallel
// stacks. Each caller holds its own instance — state is per-tracker, never
// global, so two runtimes can't bleed transitions into each other.
export function createGameLifecycleTracker(): GameLifecycleTracker {
  let lastStatusType: GameLifecycleStatusType | null = null;
  let playingSinceMs: number | null = null;
  return {
    reset() {
      lastStatusType = null;
      playingSinceMs = null;
    },
    update(input) {
      if (!input) return;
      const { statusType, baseProps } = input;
      if (statusType === lastStatusType) return;
      if (statusType === 'playing' && lastStatusType !== 'playing') {
        playingSinceMs = Date.now();
        track('game_started', baseProps);
      }
      if (statusType === 'finished' && input.outcome) {
        track('game_finished', {
          ...baseProps,
          winner: input.outcome.winner,
          reason: input.outcome.reason,
          moveNumber: input.outcome.moveNumber,
          durationMs: playingSinceMs !== null ? Date.now() - playingSinceMs : null,
        });
        playingSinceMs = null;
      }
      lastStatusType = statusType;
    },
  };
}

// Tie subsequent events to a known account. Idempotent: safe to call on every
// signed-in page load. The distinctId is the canonical users.id so PostHog
// persons line up with DB accounts.
export function identify(distinctId: string, props?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.log('[identify]', distinctId, props ?? {});
  }
  enqueue((ph) => ph.identify(distinctId, props));
}

// Clear the identified person on logout so the next anonymous session isn't
// merged into the prior account.
export function resetIdentity(): void {
  if (import.meta.env.DEV) {
    console.log('[reset]');
  }
  enqueue((ph) => ph.reset());
}

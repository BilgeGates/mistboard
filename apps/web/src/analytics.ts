import {
  type GameSpec,
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

export function gameSpecAnalyticsProps(input: {
  variant?: VariantId | string | null;
  hiddenDraft960?: boolean | string | null;
}): GameSpecAnalyticsProps {
  const spec = gameSpecForLegacyLiveRoom(input);
  return {
    game_spec: spec.id,
    family: spec.family,
    setup: spec.setup,
    visibility: spec.visibility,
    rating_pool: spec.ratingPoolBase,
  };
}

type PostHogLike = {
  capture: (name: string, props?: Record<string, unknown>) => void;
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

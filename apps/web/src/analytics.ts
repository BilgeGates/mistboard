import { timeClassFromTimeControl } from '@mistboard/game';

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

type PostHogLike = {
  capture: (name: string, props?: Record<string, unknown>) => void;
};

let posthogInstance: PostHogLike | null = null;
const pending: Array<{ name: string; props?: Record<string, unknown> }> = [];

export function setPostHogInstance(instance: PostHogLike): void {
  posthogInstance = instance;
  while (pending.length > 0) {
    const event = pending.shift()!;
    instance.capture(event.name, event.props);
  }
}

export function track(name: string, props?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.log('[track]', name, props ?? {});
  }
  if (posthogInstance) {
    posthogInstance.capture(name, props);
  } else if (import.meta.env.PROD) {
    pending.push({ name, props });
  }
}

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

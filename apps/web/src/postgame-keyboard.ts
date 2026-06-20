export type PostgameReplayKeyboardActions = {
  flip?: () => void;
  first?: () => void;
  previous?: () => void;
  next?: () => void;
  last?: () => void;
};

export function handlePostgameReplayKeyboard(
  event: KeyboardEvent,
  actions: PostgameReplayKeyboardActions,
): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (isTextInput(event.target)) return false;

  if ((event.key === 'f' || event.key === 'F') && actions.flip) {
    event.preventDefault();
    actions.flip();
    return true;
  }
  if ((event.key === 'ArrowLeft' || event.key === 'Left') && actions.previous) {
    event.preventDefault();
    actions.previous();
    return true;
  }
  if ((event.key === 'ArrowRight' || event.key === 'Right') && actions.next) {
    event.preventDefault();
    actions.next();
    return true;
  }
  if ((event.key === 'ArrowUp' || event.key === 'Home') && actions.first) {
    event.preventDefault();
    actions.first();
    return true;
  }
  if ((event.key === 'ArrowDown' || event.key === 'End') && actions.last) {
    event.preventDefault();
    actions.last();
    return true;
  }
  return false;
}

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

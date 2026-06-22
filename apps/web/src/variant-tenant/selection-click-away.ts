export type SelectionClickAwayOptions = {
  roots: () => Array<HTMLElement | null | undefined>;
  hasSelection: () => boolean;
  clearSelection: () => void;
  document?: Document;
};

function targetNode(target: EventTarget | null): Node | null {
  return target instanceof Node ? target : null;
}

export function installSelectionClickAway(options: SelectionClickAwayOptions): () => void {
  const doc = options.document ?? document;
  const onPointerDown = (event: PointerEvent): void => {
    if (!options.hasSelection()) return;
    const target = targetNode(event.target);
    if (!target) return;
    if (options.roots().some((root) => root?.contains(target))) return;
    options.clearSelection();
  };
  doc.addEventListener('pointerdown', onPointerDown, { capture: true });
  return () => doc.removeEventListener('pointerdown', onPointerDown, { capture: true });
}

/** Parent panels must leave Escape to controls and native dialogs. */
export function ownsEscape(event: KeyboardEvent): boolean {
  return event.defaultPrevented || event.composedPath().some(
    // The dispatch path survives shadow DOM retargeting and a dialog closing
    // earlier in the same dispatch, unlike target.closest('dialog[open]').
    (target) => target instanceof Element && target.localName === 'dialog',
  );
}

/** Inspect events inside the bundle's closed shadow root before retargeting. */
export function containDialogEscape(root: HTMLElement): () => void {
  const handle = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && ownsEscape(event)) {
      event.stopPropagation();
    }
  };
  root.addEventListener('keydown', handle);
  return () => root.removeEventListener('keydown', handle);
}

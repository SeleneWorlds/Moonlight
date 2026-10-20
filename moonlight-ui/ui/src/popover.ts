import type { ObjectDirective } from 'vue';

const cleanups = new WeakMap<HTMLElement, () => void>();

// Keep menus inside every clipping ancestor, including scrollable forms.
export function positionPopover(popup: HTMLElement): void {
  const anchor = popup.parentElement;
  if (!anchor) {
    return;
  }
  let top = 0;
  let bottom = window.innerHeight;
  for (let parent: HTMLElement | null = anchor; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      const rect = parent.getBoundingClientRect();
      top = Math.max(top, rect.top + parent.clientTop);
      bottom = Math.min(bottom, rect.top + parent.clientTop + parent.clientHeight);
    }
  }
  const rect = anchor.getBoundingClientRect();
  const below = Math.max(0, bottom - rect.bottom - 4);
  const above = Math.max(0, rect.top - top - 4);
  const desired = Math.min(popup.scrollHeight + popup.offsetHeight - popup.clientHeight, 270, window.innerHeight * 0.6);
  const upwards = below < desired && above > below;
  popup.style.top = upwards ? 'auto' : 'calc(100% + 4px)';
  popup.style.bottom = upwards ? 'calc(100% + 4px)' : 'auto';
  popup.style.boxSizing = 'border-box';
  popup.style.maxHeight = `${Math.min(desired, upwards ? above : below)}px`;
}

export const vPopover: ObjectDirective<HTMLElement> = {
  mounted(popup) {
    const update = () => positionPopover(popup);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(popup);
    if (popup.parentElement) {
      observer.observe(popup.parentElement);
    }
    // Capture scrolls within the shadow root as well as the document.
    const root = popup.getRootNode();
    root.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    cleanups.set(popup, () => {
      observer.disconnect();
      root.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    });
  },
  updated: positionPopover,
  unmounted(popup) {
    cleanups.get(popup)?.();
    cleanups.delete(popup);
  },
};

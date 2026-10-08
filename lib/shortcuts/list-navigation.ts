/**
 * j / k / o over the rows and cards of the current view (Jira's « next »,
 * « previous » and « open » work item). Item views mark each focusable row or
 * card with `data-shortcut-item`; the shortcut moves real DOM focus so the
 * row's own focus ring shows and Enter keeps working.
 */

export const SHORTCUT_ITEM_SELECTOR = "[data-shortcut-item]";

function isShown(element: HTMLElement): boolean {
  if (element.closest("[hidden], [inert]")) return false;
  return typeof element.checkVisibility === "function"
    ? element.checkVisibility()
    : true;
}

export function shortcutItems(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(SHORTCUT_ITEM_SELECTOR)).filter(isShown);
}

/** The row or card holding focus, if any. */
export function currentShortcutItem(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof Element
    ? active.closest<HTMLElement>(SHORTCUT_ITEM_SELECTOR)
    : null;
}

/**
 * Focus the next (+1) or previous (-1) item. With nothing selected yet the
 * first item is selected, as in Jira; the ends do not wrap.
 */
export function moveShortcutFocus(root: ParentNode, step: 1 | -1): HTMLElement | null {
  const items = shortcutItems(root);
  if (items.length === 0) return null;
  const current = currentShortcutItem();
  const index = current ? items.indexOf(current) : -1;
  const nextIndex =
    index === -1 ? 0 : Math.min(items.length - 1, Math.max(0, index + step));
  const next = items[nextIndex]!;
  next.focus();
  next.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  return next;
}

/** Open the focused item the way a click on it would. */
export function openCurrentShortcutItem(): boolean {
  const current = currentShortcutItem();
  if (!current) return false;
  current.click();
  return true;
}

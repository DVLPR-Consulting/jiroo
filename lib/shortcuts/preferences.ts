/**
 * The « single-key shortcuts » preference (WCAG 2.1.4 Character Key
 * Shortcuts): on by default, stored on this device like the theme and density.
 */

export const SHORTCUTS_ENABLED_STORAGE_KEY = "jiroo-shortcuts-enabled";
const CHANGE_EVENT = "jiroo:shortcuts-preference";

/** Set only when storage refused a write, so the choice holds for this page. */
let memoryOverride: boolean | null = null;

export function readShortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_ENABLED_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeShortcutsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SHORTCUTS_ENABLED_STORAGE_KEY, String(enabled));
    memoryOverride = null;
  } catch {
    // Storage may be unavailable (privacy mode, policy): the change still
    // applies to this page through the event below.
    memoryOverride = enabled;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Current value, honouring an in-memory fallback when storage failed. */
export function shortcutsEnabledSnapshot(): boolean {
  return memoryOverride ?? readShortcutsEnabled();
}

/** Subscribe to changes from this tab or another one (storage event). */
export function subscribeShortcutsEnabled(onChange: () => void): () => void {
  function handleStorage(event: StorageEvent) {
    if (event.key === SHORTCUTS_ENABLED_STORAGE_KEY) onChange();
  }
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

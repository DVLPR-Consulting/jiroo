/**
 * Pure helpers behind the global keyboard shortcut layer: key normalisation,
 * the « g then x » sequence matcher and the guards that keep single-key
 * shortcuts away from text fields and foreign overlays.
 */

/** Time allowed between the keys of a sequence (Jira-style « g puis b »). */
export const SEQUENCE_TIMEOUT_MS = 1000;

export type SequenceBinding<Id extends string = string> = {
  id: Id;
  sequence: readonly string[];
};

export type SequenceResult<Id extends string = string> =
  | { type: "match"; id: Id }
  | { type: "pending" }
  | { type: "none" };

export function createSequenceMatcher<Id extends string>(
  bindings: readonly SequenceBinding<Id>[],
  timeoutMs: number = SEQUENCE_TIMEOUT_MS,
) {
  let buffer: string[] = [];
  let lastAt = 0;

  function lookup(keys: string[]): SequenceResult<Id> {
    const exact = bindings.find(
      (binding) =>
        binding.sequence.length === keys.length &&
        binding.sequence.every((key, index) => key === keys[index]),
    );
    if (exact) return { type: "match", id: exact.id };
    const prefix = bindings.some(
      (binding) =>
        binding.sequence.length > keys.length &&
        keys.every((key, index) => binding.sequence[index] === key),
    );
    return prefix ? { type: "pending" } : { type: "none" };
  }

  function start(key: string, now: number): SequenceResult<Id> {
    const result = lookup([key]);
    buffer = result.type === "pending" ? [key] : [];
    lastAt = now;
    return result;
  }

  return {
    feed(key: string, now: number): SequenceResult<Id> {
      if (buffer.length === 0 || now - lastAt > timeoutMs) return start(key, now);
      const result = lookup([...buffer, key]);
      if (result.type === "none") return start(key, now);
      buffer = result.type === "pending" ? [...buffer, key] : [];
      lastAt = now;
      return result;
    },
    reset() {
      buffer = [];
    },
  };
}

/**
 * The character a shortcut listens for, or null when the event must be left
 * alone. Letters only count without any modifier; punctuation counts however
 * the keyboard layout produced it (AZERTY needs Shift for « / » and AltGr,
 * reported as Ctrl+Alt, for « [ »). ⌘ and lone Ctrl stay with the browser.
 */
export function shortcutEventKey(event: KeyboardEvent): string | null {
  if (event.isComposing || event.repeat || event.metaKey) return null;
  if (event.ctrlKey && !event.altKey) return null;
  const key = event.key;
  if (key.length !== 1 || key === " ") return null;
  if (/^[a-z]$/i.test(key)) {
    if (event.shiftKey || event.altKey || event.ctrlKey) return null;
    return key.toLowerCase();
  }
  return key;
}

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

const EDITABLE_SELECTOR = [
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  ".ProseMirror",
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="searchbox"]',
].join(", ");

/** True when typing into `target` must never trigger a shortcut. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type);
  }
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.closest(EDITABLE_SELECTOR) !== null;
}

/** Overlays whose keys belong to them (menus, pickers, other dialogs). */
const FOREIGN_OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/** The item drawer marks its content with this attribute. */
export const ITEM_SHORTCUT_SCOPE_SELECTOR = '[data-shortcut-scope="item"]';

export type ShortcutContext = "page" | "item";

/**
 * Where a key event happened, for shortcut purposes: the page, the open item
 * drawer, or null when shortcuts must stay silent (text entry, a component
 * that handles its own keys via `data-local-escape`, another dialog or menu).
 */
export function shortcutContext(target: EventTarget | null): ShortcutContext | null {
  if (isEditableTarget(target)) return null;
  if (!(target instanceof Element)) return "page";
  if (target.closest("[data-local-escape]")) return null;
  const overlay = target.closest(FOREIGN_OVERLAY_SELECTOR);
  if (!overlay) return "page";
  return overlay.matches(ITEM_SHORTCUT_SCOPE_SELECTOR) ? "item" : null;
}

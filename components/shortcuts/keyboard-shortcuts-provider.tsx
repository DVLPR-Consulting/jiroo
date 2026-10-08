"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createSequenceMatcher,
  shortcutContext,
  shortcutEventKey,
} from "@/lib/shortcuts/engine";
import {
  SEQUENCE_SHORTCUTS,
  sequenceShortcutGroup,
  type SequenceShortcutId,
} from "@/lib/shortcuts/registry";
import { KeyboardShortcutsDialog } from "@/components/shortcuts/keyboard-shortcuts-dialog";
import { useShortcutsEnabled } from "@/components/shortcuts/use-shortcuts-enabled";

/** Return false to leave the key alone (the action does not apply right now). */
type Handler = () => boolean | void;

type ShortcutRegistry = {
  register: (id: SequenceShortcutId, handler: Handler) => () => void;
};

const ShortcutRegistryContext = createContext<ShortcutRegistry | null>(null);

/**
 * Bind `handler` to the registry shortcut `id` while mounted. Pass null when
 * the action is not allowed (permissions, read-only): the key then does
 * nothing. Outside the provider (isolated component tests) it is a no-op.
 */
export function useShortcutHandler(
  id: SequenceShortcutId,
  handler: Handler | null | undefined | false,
): void {
  const registry = useContext(ShortcutRegistryContext);
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  const active = Boolean(handler);
  useEffect(() => {
    if (!registry || !active) return;
    return registry.register(id, () => (latest.current ? latest.current() : false));
  }, [registry, id, active]);
}

/**
 * Global keyboard shortcut layer (Jira-style): one keydown listener matches
 * the registry's sequences and runs the most recently registered handler.
 * List shortcuts only fire on the page, item shortcuts only inside the item
 * drawer; nothing fires while typing, in another dialog or menu, or when the
 * user turned single-key shortcuts off.
 */
export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  const handlers = useRef(new Map<SequenceShortcutId, Handler[]>());
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpReturnFocus, setHelpReturnFocus] = useState<Element | null>(null);
  const enabled = useShortcutsEnabled();

  const registry = useMemo<ShortcutRegistry>(
    () => ({
      register(id, handler) {
        const stack = handlers.current.get(id) ?? [];
        handlers.current.set(id, [...stack, handler]);
        return () => {
          const current = handlers.current.get(id) ?? [];
          handlers.current.set(
            id,
            current.filter((candidate) => candidate !== handler),
          );
        };
      },
    }),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    const matcher = createSequenceMatcher(SEQUENCE_SHORTCUTS);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const key = shortcutEventKey(event);
      if (key === null) return;
      const context = shortcutContext(event.target);
      if (context === null) {
        matcher.reset();
        return;
      }
      const result = matcher.feed(key, Date.now());
      if (result.type !== "match") return;

      const group = sequenceShortcutGroup(result.id);
      if (group === "list" && context !== "page") return;
      if (group === "item" && context !== "item") return;

      const handler =
        result.id === "help"
          ? () => {
              setHelpReturnFocus(document.activeElement);
              setHelpOpen(true);
            }
          : handlers.current.get(result.id)?.at(-1);
      if (!handler || handler() === false) return;
      event.preventDefault();
    }

    // A pending « g » is dropped on Escape (seen in the capture phase, before
    // any component can consume it), when the window loses focus, and when
    // focus moves somewhere shortcuts stay silent (a field, a menu, a dialog).
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") matcher.reset();
    }
    function cancelOnFocusIn(event: FocusEvent) {
      if (shortcutContext(event.target) === null) matcher.reset();
    }
    function cancel() {
      matcher.reset();
    }

    window.addEventListener("keydown", cancelOnEscape, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", cancel);
    document.addEventListener("focusin", cancelOnFocusIn);
    return () => {
      window.removeEventListener("keydown", cancelOnEscape, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("focusin", cancelOnFocusIn);
    };
  }, [enabled]);

  return (
    <ShortcutRegistryContext.Provider value={registry}>
      {children}
      <KeyboardShortcutsDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        returnFocusTo={helpReturnFocus}
      />
    </ShortcutRegistryContext.Provider>
  );
}

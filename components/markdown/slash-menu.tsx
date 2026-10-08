"use client";

import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  SquareCode,
  Type,
} from "lucide-react";
import type { SlashCommandId } from "@/lib/markdown/slash-commands";
import type { SlashMenuStore } from "@/lib/markdown/slash-extension";
import { cn } from "@/lib/utils";

const ICON = { className: "size-4", "aria-hidden": true } as const;

const ICONS: Record<SlashCommandId, ReactNode> = {
  paragraph: <Type {...ICON} />,
  heading1: <Heading1 {...ICON} />,
  heading2: <Heading2 {...ICON} />,
  heading3: <Heading3 {...ICON} />,
  bulletList: <List {...ICON} />,
  orderedList: <ListOrdered {...ICON} />,
  taskList: <ListTodo {...ICON} />,
  blockquote: <Quote {...ICON} />,
  codeBlock: <SquareCode {...ICON} />,
  horizontalRule: <Minus {...ICON} />,
};

/**
 * Listbox of the « / » menu. Focus stays in the editor (ARIA combobox-like
 * pattern through aria-activedescendant): ↑/↓ move, Entrée inserts, Échap
 * closes — keys are handled by the suggestion plugin.
 */
export function SlashMenu({
  editor,
  store,
  container,
}: {
  editor: Editor;
  store: SlashMenuStore;
  /** Positioned ancestor the menu is placed in (the editor wrapper). */
  container: React.RefObject<HTMLElement | null>;
}) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const listId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = state.open && state.items.length > 0;
  const optionId = (index: number) => `${listId}-option-${index}`;

  // Place the menu under the « / », relative to the editor wrapper.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const box = container.current?.getBoundingClientRect();
    if (!menu || !box || !state.rect) return;
    menu.style.top = `${state.rect.bottom - box.top + 4}px`;
    menu.style.left = `${Math.max(0, state.rect.left - box.left)}px`;
  }, [container, state.rect, visible]);

  // Expose the listbox to assistive technologies from the editable area.
  useEffect(() => {
    const dom = editor.isDestroyed ? null : editor.view.dom;
    if (!dom) return;
    if (visible) {
      dom.setAttribute("aria-controls", listId);
      dom.setAttribute("aria-activedescendant", optionId(state.active));
    } else {
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-activedescendant");
    }
  });

  useEffect(() => {
    if (!visible) return;
    menuRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [visible, state.active]);

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      className="absolute z-50 w-60 overflow-hidden rounded-[var(--radius)] border border-border bg-[var(--surface)] shadow-[var(--shadow-md)]"
    >
      <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Blocs
      </p>
      <ul
        id={listId}
        role="listbox"
        aria-label="Insérer un bloc"
        className="max-h-72 overflow-y-auto px-1 pb-1"
      >
        {state.items.map((item, index) => (
          <li
            key={item.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === state.active}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm text-foreground",
              index === state.active && "bg-[var(--muted)]",
            )}
            // Keep the caret in the editor.
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => store.setActive(index)}
            onClick={() => store.select(item)}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded border border-border bg-[var(--surface)] text-muted-foreground">
              {ICONS[item.id]}
            </span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut ? (
              <kbd className="font-mono text-[11px] text-muted-foreground">{item.shortcut}</kbd>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

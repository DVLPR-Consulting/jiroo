/**
 * « / » block menu (Tiptap suggestion). The plugin only tracks the « /query »
 * typed in the document; the menu itself is rendered by React (SlashMenu)
 * from this store, inside the editor's own DOM, so it stays within modal
 * dialogs (the item drawer) instead of a portal on document.body.
 */
import { Extension } from "@tiptap/react";
import type { EditorState } from "@tiptap/pm/state";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { filterSlashCommands, type SlashCommand } from "@/lib/markdown/slash-commands";

export const SLASH_PLUGIN_KEY = new PluginKey("slashCommands");

/** Whether the « / » menu is tracking a query (it then owns Escape). */
export function isSlashMenuActive(state: EditorState): boolean {
  return Boolean(SLASH_PLUGIN_KEY.getState(state)?.active);
}

export type SlashMenuState = {
  open: boolean;
  items: SlashCommand[];
  active: number;
  /** Caret rectangle (viewport coordinates) the menu is placed under. */
  rect: DOMRect | null;
};

const CLOSED: SlashMenuState = { open: false, items: [], active: 0, rect: null };

export type SlashMenuStore = {
  getState: () => SlashMenuState;
  subscribe: (listener: () => void) => () => void;
  setActive: (index: number) => void;
  select: (item: SlashCommand) => void;
};

type InternalStore = SlashMenuStore & {
  start: (props: SuggestionProps<SlashCommand, SlashCommand>) => void;
  close: () => void;
  keyDown: (event: KeyboardEvent) => boolean;
};

export function createSlashMenuStore(): SlashMenuStore {
  let state = CLOSED;
  let command: ((item: SlashCommand) => void) | null = null;
  const listeners = new Set<() => void>();
  const set = (next: SlashMenuState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const store: InternalStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setActive(index) {
      if (state.open && index >= 0 && index < state.items.length) set({ ...state, active: index });
    },
    select(item) {
      command?.(item);
    },
    start(props) {
      command = props.command;
      // Filtered here, synchronously: the plugin resolves `items` after an
      // await and would briefly report an empty list on every keystroke.
      const items = filterSlashCommands(props.query);
      const sameItems =
        state.open &&
        state.items.length === items.length &&
        state.items.every((item, index) => item.id === items[index]?.id);
      set({
        open: true,
        items,
        active: sameItems ? state.active : 0,
        rect: props.clientRect?.() ?? null,
      });
    },
    close() {
      command = null;
      set(CLOSED);
    },
    keyDown(event) {
      const { items, active, open } = state;
      if (!open || items.length === 0) return false;
      if (event.key === "ArrowDown") {
        set({ ...state, active: (active + 1) % items.length });
        return true;
      }
      if (event.key === "ArrowUp") {
        set({ ...state, active: (active - 1 + items.length) % items.length });
        return true;
      }
      if (event.key === "Enter") {
        command?.(items[active]!);
        return true;
      }
      return false;
    },
  };
  return store;
}

export const SlashCommands = Extension.create<{ store: SlashMenuStore | null }>({
  name: "slashCommands",
  // Before the default keymaps, so Enter picks a block instead of a new line.
  priority: 200,
  addOptions() {
    return { store: null };
  },
  addProseMirrorPlugins() {
    const store = this.options.store as InternalStore | null;
    if (!store) return [];
    return [
      Suggestion<SlashCommand, SlashCommand>({
        editor: this.editor,
        pluginKey: SLASH_PLUGIN_KEY,
        char: "/",
        // « / » opens the menu at the start of a block or after a space.
        allowedPrefixes: [" "],
        allow: ({ editor }) => editor.isEditable && !editor.isActive("codeBlock"),
        command: ({ editor, range, props }) => {
          props.run(editor.chain().focus().deleteRange(range)).run();
        },
        render: () => ({
          onStart: (props) => store.start(props),
          onUpdate: (props) => store.start(props),
          onExit: () => store.close(),
          onKeyDown: ({ event }) => store.keyDown(event),
        }),
      }),
    ];
  },
});

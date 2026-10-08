"use client";

import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection } from "@tiptap/pm/state";
import { Bold, Code, Italic, Link, Strikethrough } from "lucide-react";
import { LinkForm } from "@/components/markdown/markdown-toolbar";

const ICON = { className: "size-4", "aria-hidden": true } as const;

type MarkCommand = {
  id: "bold" | "italic" | "strike" | "code";
  label: string;
  shortcut: string;
  icon: ReactNode;
  run: (editor: Editor) => void;
};

const MARKS: MarkCommand[] = [
  {
    id: "bold",
    label: "Gras",
    shortcut: "Ctrl+B",
    icon: <Bold {...ICON} />,
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    id: "italic",
    label: "Italique",
    shortcut: "Ctrl+I",
    icon: <Italic {...ICON} />,
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    id: "strike",
    label: "Barré",
    shortcut: "Ctrl+Maj+S",
    icon: <Strikethrough {...ICON} />,
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    id: "code",
    label: "Code",
    shortcut: "Ctrl+E",
    icon: <Code {...ICON} />,
    run: (e) => e.chain().focus().toggleCode().run(),
  },
];

const BUTTON =
  "inline-flex size-7 items-center justify-center rounded text-muted-foreground outline-none hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] aria-pressed:bg-[var(--muted)] aria-pressed:text-foreground";

type ShouldShow = NonNullable<ComponentProps<typeof BubbleMenu>["shouldShow"]>;

/** Over a non-empty text selection of an editable, focused editor. */
const shouldShow: ShouldShow = ({ editor, element, view, state, from, to }) => {
  const { selection } = state;
  if (!editor.isEditable || selection.empty || selection instanceof NodeSelection) return false;
  if (editor.isActive("codeBlock")) return false;
  if (!state.doc.textBetween(from, to, " ").trim()) return false;
  return view.hasFocus() || element.contains(document.activeElement);
};

/**
 * Formatting bar shown over a text selection (Notion): Gras, Italique, Barré,
 * Code and Lien. It lives in the editor's DOM (not a body portal) so it stays
 * usable inside the item drawer's modal dialog.
 */
export function SelectionBubbleMenu({
  editor,
  linkRequest,
}: {
  editor: Editor;
  /** Incremented by the editor's Ctrl+K shortcut to open the link form. */
  linkRequest: number;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      href: String(e.getAttributes("link").href ?? ""),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [handledLinkRequest, setHandledLinkRequest] = useState(linkRequest);
  if (handledLinkRequest !== linkRequest) {
    setHandledLinkRequest(linkRequest);
    if (!editor.state.selection.empty) setLinkOpen(true);
  }

  // Stable: a new options object re-sends them to the plugin.
  const options = useMemo(
    () => ({ placement: "top" as const, offset: 8, onHide: () => setLinkOpen(false) }),
    [],
  );

  return (
    <BubbleMenu
      editor={editor}
      options={options}
      shouldShow={shouldShow}
      className="z-50 rounded-[var(--radius)] border border-border bg-[var(--surface)] shadow-[var(--shadow-md)]"
    >
      <div
        role="toolbar"
        aria-label="Mise en forme de la sélection"
        // Escape on a button returns to the text instead of closing the drawer.
        data-local-escape
        className="flex items-center gap-0.5 p-1"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          editor.commands.focus();
        }}
      >
        {MARKS.map((mark) => (
          <button
            key={mark.id}
            type="button"
            className={BUTTON}
            aria-label={mark.label}
            aria-pressed={Boolean(state?.[mark.id])}
            title={`${mark.label} (${mark.shortcut})`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => mark.run(editor)}
          >
            {mark.icon}
          </button>
        ))}
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        <button
          type="button"
          className={BUTTON}
          aria-label="Lien"
          aria-pressed={Boolean(state?.link)}
          aria-expanded={linkOpen}
          title="Lien (Ctrl+K)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setLinkOpen((open) => !open)}
        >
          <Link {...ICON} />
        </button>
      </div>
      {linkOpen ? (
        <LinkForm
          key={state?.href ?? ""}
          editor={editor}
          initialHref={state?.href ?? ""}
          hasLink={Boolean(state?.link)}
          onClose={() => setLinkOpen(false)}
          className="w-80 border-t border-border px-2 py-1.5"
        />
      ) : null}
    </BubbleMenu>
  );
}

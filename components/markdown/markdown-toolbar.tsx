"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
} from "lucide-react";
import { normalizeLinkUrl } from "@/lib/markdown/link-url";

type ToolbarCommand = {
  id: string;
  label: string;
  shortcut?: string;
  icon: ReactNode;
  /** Toggle buttons expose aria-pressed; plain actions (undo/redo) do not. */
  isActive?: (editor: Editor) => boolean;
  canRun?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

const ICON = { className: "size-4", "aria-hidden": true } as const;

const GROUPS: ToolbarCommand[][] = [
  [
    {
      id: "h2",
      label: "Titre 2",
      shortcut: "Ctrl+Alt+2",
      icon: <Heading2 {...ICON} />,
      isActive: (e) => e.isActive("heading", { level: 2 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: "h3",
      label: "Titre 3",
      shortcut: "Ctrl+Alt+3",
      icon: <Heading3 {...ICON} />,
      isActive: (e) => e.isActive("heading", { level: 3 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
  ],
  [
    {
      id: "bold",
      label: "Gras",
      shortcut: "Ctrl+B",
      icon: <Bold {...ICON} />,
      isActive: (e) => e.isActive("bold"),
      run: (e) => e.chain().focus().toggleBold().run(),
    },
    {
      id: "italic",
      label: "Italique",
      shortcut: "Ctrl+I",
      icon: <Italic {...ICON} />,
      isActive: (e) => e.isActive("italic"),
      run: (e) => e.chain().focus().toggleItalic().run(),
    },
    {
      id: "strike",
      label: "Barré",
      shortcut: "Ctrl+Maj+S",
      icon: <Strikethrough {...ICON} />,
      isActive: (e) => e.isActive("strike"),
      run: (e) => e.chain().focus().toggleStrike().run(),
    },
    {
      id: "code",
      label: "Code en ligne",
      shortcut: "Ctrl+E",
      icon: <Code {...ICON} />,
      isActive: (e) => e.isActive("code"),
      run: (e) => e.chain().focus().toggleCode().run(),
    },
  ],
  [
    {
      id: "bulletList",
      label: "Liste à puces",
      shortcut: "Ctrl+Maj+8",
      icon: <List {...ICON} />,
      isActive: (e) => e.isActive("bulletList"),
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      id: "orderedList",
      label: "Liste numérotée",
      shortcut: "Ctrl+Maj+7",
      icon: <ListOrdered {...ICON} />,
      isActive: (e) => e.isActive("orderedList"),
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      id: "taskList",
      label: "Liste de tâches",
      shortcut: "Ctrl+Maj+9",
      icon: <ListTodo {...ICON} />,
      isActive: (e) => e.isActive("taskList"),
      run: (e) => e.chain().focus().toggleTaskList().run(),
    },
    {
      id: "blockquote",
      label: "Citation",
      shortcut: "Ctrl+Maj+B",
      icon: <Quote {...ICON} />,
      isActive: (e) => e.isActive("blockquote"),
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      id: "codeBlock",
      label: "Bloc de code",
      shortcut: "Ctrl+Alt+C",
      icon: <SquareCode {...ICON} />,
      isActive: (e) => e.isActive("codeBlock"),
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
    },
  ],
];

const HISTORY: ToolbarCommand[] = [
  {
    id: "undo",
    label: "Annuler la modification",
    shortcut: "Ctrl+Z",
    icon: <Undo2 {...ICON} />,
    canRun: (e) => e.can().undo(),
    run: (e) => e.chain().focus().undo().run(),
  },
  {
    id: "redo",
    label: "Rétablir la modification",
    shortcut: "Ctrl+Maj+Z",
    icon: <Redo2 {...ICON} />,
    canRun: (e) => e.can().redo(),
    run: (e) => e.chain().focus().redo().run(),
  },
];

const ALL_COMMANDS = [...GROUPS.flat(), ...HISTORY];
/** Visual order of the toolbar buttons (roving tab stop positions). */
const ORDER = [...GROUPS.flat().map((command) => command.id), "link", ...HISTORY.map((command) => command.id)];

const BUTTON =
  "inline-flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-[var(--muted)] aria-pressed:text-foreground";

/**
 * Formatting toolbar of the Markdown editor (WAI-ARIA toolbar pattern: one tab
 * stop, arrow keys / Home / End move between buttons, toggles use aria-pressed).
 */
export function MarkdownToolbar({
  editor,
  disabled,
  linkRequest,
  controlsId,
}: {
  editor: Editor;
  disabled: boolean;
  /** id of the editable area the toolbar formats. */
  controlsId: string;
  /** Incremented by the editor's Ctrl+K shortcut to open the link form. */
  linkRequest: number;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      active: Object.fromEntries(
        ALL_COMMANDS.map((command) => [command.id, command.isActive?.(e) ?? false]),
      ) as Record<string, boolean>,
      enabled: Object.fromEntries(
        ALL_COMMANDS.map((command) => [command.id, command.canRun?.(e) ?? true]),
      ) as Record<string, boolean>,
      link: e.isActive("link"),
      href: String(e.getAttributes("link").href ?? ""),
    }),
  });
  const [focusIndex, setFocusIndex] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [handledLinkRequest, setHandledLinkRequest] = useState(linkRequest);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Ctrl+K in the editor opens the link form (state sync during render).
  if (handledLinkRequest !== linkRequest) {
    setHandledLinkRequest(linkRequest);
    if (!disabled) setLinkOpen(true);
  }

  const buttons = () =>
    Array.from(toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button[data-toolbar-item]") ?? []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = buttons().filter((button) => !button.disabled);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (current + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = items[next]!;
    setFocusIndex(buttons().indexOf(target));
    target.focus();
  }

  // The roving tab stop falls back to the first button when its target is
  // disabled (undo/redo without history), so the toolbar stays reachable.
  const tabStop = state?.enabled[ORDER[focusIndex] ?? ""] === false ? 0 : focusIndex;

  const renderButton = (command: ToolbarCommand) => {
    const position = ORDER.indexOf(command.id);
    const toggle = Boolean(command.isActive);
    return (
      <button
        key={command.id}
        type="button"
        data-toolbar-item
        className={BUTTON}
        aria-label={command.label}
        aria-pressed={toggle ? Boolean(state?.active[command.id]) : undefined}
        title={command.shortcut ? `${command.label} (${command.shortcut})` : command.label}
        tabIndex={position === tabStop ? 0 : -1}
        disabled={disabled || state?.enabled[command.id] === false}
        // Keep the editor selection: the command refocuses the editor itself.
        onMouseDown={(event) => event.preventDefault()}
        onFocus={() => setFocusIndex(position)}
        onClick={() => command.run(editor)}
      >
        {command.icon}
      </button>
    );
  };

  const separator = (key: string) => (
    <span key={key} aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />
  );

  return (
    <div className="border-b border-border">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Mise en forme"
        aria-controls={controlsId}
        aria-orientation="horizontal"
        className="flex flex-wrap items-center gap-0.5 px-1.5 py-1"
        onKeyDown={onKeyDown}
      >
        {GROUPS.map((group, groupIndex) => [
          groupIndex > 0 ? separator(`sep-${groupIndex}`) : null,
          ...group.map(renderButton),
        ])}
        {separator("sep-link")}
        {(() => {
          const position = ORDER.indexOf("link");
          return (
            <button
              type="button"
              data-toolbar-item
              className={BUTTON}
              aria-label="Lien"
              aria-pressed={Boolean(state?.link)}
              title="Lien (Ctrl+K)"
              tabIndex={position === tabStop ? 0 : -1}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onFocus={() => setFocusIndex(position)}
              onClick={() => setLinkOpen((open) => !open)}
            >
              <Link {...ICON} />
            </button>
          );
        })()}
        {separator("sep-history")}
        {HISTORY.map(renderButton)}
      </div>
      {linkOpen && !disabled ? (
        <LinkForm
          key={state?.href ?? ""}
          editor={editor}
          initialHref={state?.href ?? ""}
          hasLink={Boolean(state?.link)}
          onClose={() => setLinkOpen(false)}
        />
      ) : null}
    </div>
  );
}

function LinkForm({
  editor,
  initialHref,
  hasLink,
  onClose,
}: {
  editor: Editor;
  initialHref: string;
  hasLink: boolean;
  onClose: () => void;
}) {
  const [href, setHref] = useState(initialHref);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  function apply() {
    const url = normalizeLinkUrl(href);
    if (!url) {
      setError("Adresse invalide : utilisez http(s)://, mailto: ou un lien relatif.");
      return;
    }
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive("link")) {
      chain.insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] });
    } else {
      chain.extendMarkRange("link").setLink({ href: url });
    }
    chain.run();
    onClose();
  }

  function remove() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onClose();
  }

  function cancel() {
    editor.commands.focus();
    onClose();
  }

  return (
    <div
      // Escape from any control closes the form only, not the surrounding
      // drawer or dialog (see item-detail-sheet), and refocuses the editor.
      data-local-escape
      className="flex flex-wrap items-center gap-2 border-t border-border px-2 py-1.5"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }}
    >
      <label htmlFor={inputId} className="text-xs text-muted-foreground">
        Adresse du lien
      </label>
      <input
        id={inputId}
        // The form opens on an explicit user action: focus its only field.
        autoFocus
        type="text"
        inputMode="url"
        value={href}
        placeholder="https://…"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="h-7 min-w-0 flex-1 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm outline-none focus:border-[var(--ring)]"
        onChange={(event) => {
          setHref(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          }
        }}
      />
      <button
        type="button"
        onClick={apply}
        className="rounded bg-[var(--primary)] px-2 py-1 text-xs font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
      >
        Appliquer
      </button>
      {hasLink ? (
        <button
          type="button"
          onClick={remove}
          className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-[var(--muted)]"
        >
          Retirer le lien
        </button>
      ) : null}
      <button
        type="button"
        onClick={cancel}
        className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-[var(--muted)]"
      >
        Fermer
      </button>
      {error ? (
        <p id={errorId} role="alert" className="w-full text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

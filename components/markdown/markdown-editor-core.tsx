"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import {
  BYPASS_LENGTH_LIMIT,
  markdownEditorExtensions,
} from "@/lib/markdown/editor-extensions";
import {
  docToMarkdown,
  markdownToDoc,
  positionAfterVisibleChars,
  unsupportedMarkdownFeatures,
} from "@/lib/markdown/markdown-document";
import { MarkdownToolbar } from "@/components/markdown/markdown-toolbar";
import { cn } from "@/lib/utils";

export type MarkdownEditorHandle = {
  focus: (position?: "start" | "end") => void;
  /**
   * Replaces the `length` characters before the caret with plain text.
   * Returns false when nothing changed (e.g. refused by the length limit).
   */
  replaceTextBeforeCaret: (length: number, text: string) => boolean;
};

/**
 * Prose spacing aligned on the read-mode Markdown rendering. Headings use
 * explicit sizes (the t-h2 token class cannot be applied through a variant).
 * Task items are styled through their list: the item node view has no
 * data-type attribute.
 */
const PROSE =
  "text-sm leading-relaxed text-foreground [&_a]:text-[var(--primary)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--muted)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-[var(--font-mono)] [&_code]:text-[0.85em] [&_h1]:my-2 [&_h1]:text-[17px] [&_h1]:leading-[1.3] [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-[17px] [&_h2]:leading-[1.3] [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-[var(--radius)] [&_pre]:bg-[var(--muted)] [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border-strong)] [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_hr]:my-3 [&_hr]:border-border [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0 [&_ul[data-type=taskList]>li]:flex [&_ul[data-type=taskList]>li]:items-start [&_ul[data-type=taskList]>li]:gap-2 [&_ul[data-type=taskList]>li>label]:mt-[0.2em] [&_ul[data-type=taskList]>li>div]:min-w-0 [&_ul[data-type=taskList]>li>div]:flex-1 [&_ul[data-type=taskList]>li_p]:my-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0";

const FRAME =
  "rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] focus-within:border-[var(--ring)] data-[invalid=true]:border-[var(--danger)]";

function featureList(features: string[]) {
  return features.join(", ");
}

/**
 * Shared WYSIWYG Markdown editor (Tiptap). The value in and out is Markdown;
 * `onChange` only fires on user edits, so an untouched value is never
 * normalized. Content the editor cannot round-trip (tables, raw HTML, images)
 * is edited as raw Markdown in a textarea instead of being dropped.
 */
export function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder,
  maxLength,
  disabled = false,
  autoFocus = false,
  autoFocusVisibleOffset,
  invalid = false,
  describedBy,
  minHeightClassName = "min-h-32",
  onSubmitShortcut,
  onCaretTextChange,
  ref,
}: {
  value: string;
  onChange: (markdown: string) => void;
  /** Accessible name of the editable area. */
  label: string;
  placeholder?: string;
  /** Limit on the produced Markdown, enforced while typing. */
  maxLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  /**
   * With autoFocus: put the caret after this many non-whitespace characters
   * (e.g. where the read rendering was clicked) instead of at the end.
   */
  autoFocusVisibleOffset?: number | null;
  invalid?: boolean;
  describedBy?: string;
  minHeightClassName?: string;
  /** Ctrl/Cmd+Enter. */
  onSubmitShortcut?: () => void;
  /** Text of the current block before the caret (for @-mentions). */
  onCaretTextChange?: (textBeforeCaret: string) => void;
  ref?: Ref<MarkdownEditorHandle>;
}) {
  const contentId = useId();
  const noteId = useId();
  const [rawFeatures, setRawFeatures] = useState<string[] | null>(null);
  const [linkRequest, setLinkRequest] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Autofocus requested while the editor was disabled.
  const pendingFocus = useRef<number | "end" | null>(null);
  // Last Markdown emitted by the editor, to tell user edits from new values.
  const emitted = useRef<string | null>(null);
  const callbacks = useRef({ onChange, onSubmitShortcut, onCaretTextChange });
  useEffect(() => {
    callbacks.current = { onChange, onSubmitShortcut, onCaretTextChange };
  });

  const reportCaret = (editor: Editor) => {
    const { $from } = editor.state.selection;
    callbacks.current.onCaretTextChange?.(
      $from.parent.textBetween(0, $from.parentOffset, undefined, "￼"),
    );
  };

  // Raw fallback: the current line before the caret, like an editor block.
  const reportRawCaret = (textarea: HTMLTextAreaElement) => {
    const before = textarea.value.slice(0, textarea.selectionStart);
    callbacks.current.onCaretTextChange?.(before.slice(before.lastIndexOf("\n") + 1));
  };

  /** Loads Markdown into the editor; returns false for the raw fallback. */
  const load = (editor: Editor, markdown: string) => {
    const manager = editor.markdown;
    if (!manager) return false;
    const unsupported = unsupportedMarkdownFeatures(manager, markdown);
    setRawFeatures(unsupported.length > 0 ? unsupported : null);
    emitted.current = markdown;
    if (unsupported.length > 0) return false;
    editor
      .chain()
      .setMeta(BYPASS_LENGTH_LIMIT, true)
      .setMeta("addToHistory", false)
      .setContent(markdownToDoc(manager, markdown), { emitUpdate: false })
      .run();
    return true;
  };

  const editor = useEditor({
    // Next.js renders client components on the server too: wait for mount.
    immediatelyRender: false,
    extensions: markdownEditorExtensions({ maxLength: maxLength ?? null }),
    editable: !disabled,
    editorProps: {
      attributes: {
        id: contentId,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        class: cn("px-3 py-2 outline-none", minHeightClassName, PROSE),
      },
      handleKeyDown: (_view, event) => {
        const mod = event.metaKey || event.ctrlKey;
        if (mod && event.key === "Enter" && callbacks.current.onSubmitShortcut) {
          event.preventDefault();
          callbacks.current.onSubmitShortcut();
          return true;
        }
        if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
          event.preventDefault();
          setLinkRequest((count) => count + 1);
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor: created }) => {
      const visual = load(created, value);
      if (autoFocus && visual) {
        const position =
          autoFocusVisibleOffset == null
            ? null
            : positionAfterVisibleChars(created.state.doc, autoFocusVisibleOffset);
        // A disabled editor (save still settling) cannot take focus yet.
        if (created.isEditable) created.commands.focus(position ?? "end");
        else pendingFocus.current = position ?? "end";
      }
    },
    onUpdate: ({ editor: updated }) => {
      if (!updated.markdown) return;
      const markdown = docToMarkdown(updated.markdown, updated.getJSON());
      emitted.current = markdown;
      callbacks.current.onChange(markdown);
      reportCaret(updated);
    },
    onSelectionUpdate: ({ editor: updated }) => reportCaret(updated),
  });

  const isEmpty = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.isEmpty ?? true,
  });

  // A new value from the parent (reset, regeneration, cleared after submit).
  useEffect(() => {
    if (!editor || editor.isDestroyed || value === emitted.current) return;
    load(editor, value);
  }, [editor, value]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!disabled, false);
    if (!disabled && pendingFocus.current !== null) {
      editor.commands.focus(pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [editor, disabled]);

  // Keep the dynamic ARIA state of the editable area in sync.
  useEffect(() => {
    const dom = editor && !editor.isDestroyed ? editor.view.dom : null;
    if (!dom) return;
    dom.setAttribute("aria-label", label);
    if (invalid) dom.setAttribute("aria-invalid", "true");
    else dom.removeAttribute("aria-invalid");
    if (describedBy) dom.setAttribute("aria-describedby", describedBy);
    else dom.removeAttribute("aria-describedby");
    if (disabled) dom.setAttribute("aria-disabled", "true");
    else dom.removeAttribute("aria-disabled");
  }, [editor, label, invalid, describedBy, disabled]);

  useImperativeHandle(
    ref,
    () => ({
      focus: (position) => {
        if (rawFeatures) textareaRef.current?.focus();
        else editor?.commands.focus(position ?? null);
      },
      replaceTextBeforeCaret: (length, text) => {
        const textarea = textareaRef.current;
        if (rawFeatures && textarea) {
          const caret = textarea.selectionStart;
          const start = Math.max(0, caret - length);
          const next = textarea.value.slice(0, start) + text + textarea.value.slice(caret);
          if (maxLength !== undefined && next.length > maxLength) return false;
          emitted.current = next;
          callbacks.current.onChange(next);
          callbacks.current.onCaretTextChange?.(next.slice(0, start + text.length));
          requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + text.length, start + text.length);
          });
          return true;
        }
        if (!editor) return false;
        const { from } = editor.state.selection;
        const before = editor.state.doc;
        editor
          .chain()
          .focus()
          .insertContentAt({ from: Math.max(0, from - length), to: from }, { type: "text", text })
          .run();
        // run() reports success even when the length limit filtered the
        // transaction out: compare the documents instead.
        return editor.state.doc !== before;
      },
    }),
    [editor, rawFeatures, maxLength],
  );

  if (rawFeatures) {
    return (
      <div className="flex flex-col gap-1.5">
        <p id={noteId} className="text-xs text-muted-foreground">
          Ce contenu contient des éléments que l’éditeur visuel ne gère pas (
          {featureList(rawFeatures)}) : il est modifié en Markdown brut pour ne rien perdre.
        </p>
        <textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={[noteId, describedBy].filter(Boolean).join(" ")}
          maxLength={maxLength}
          rows={10}
          className={cn(
            "w-full resize-y rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 font-mono text-sm leading-relaxed text-foreground outline-none focus:border-[var(--ring)] disabled:opacity-60",
            minHeightClassName,
          )}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            emitted.current = event.target.value;
            onChange(event.target.value);
            reportRawCaret(event.currentTarget);
          }}
          onSelect={(event) => reportRawCaret(event.currentTarget)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && onSubmitShortcut) {
              event.preventDefault();
              onSubmitShortcut();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className={cn(FRAME, disabled && "opacity-60")} data-invalid={invalid || undefined}>
      {editor ? (
        <MarkdownToolbar
          editor={editor}
          disabled={disabled}
          linkRequest={linkRequest}
          controlsId={contentId}
        />
      ) : (
        <div className="h-9 border-b border-border" aria-hidden />
      )}
      <div className="relative">
        {placeholder && isEmpty ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground"
          >
            {placeholder}
          </span>
        ) : null}
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className={cn("px-3 py-2", minHeightClassName)} aria-hidden />
        )}
      </div>
    </div>
  );
}

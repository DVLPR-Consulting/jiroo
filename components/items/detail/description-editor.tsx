"use client";

import {
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { updateItemAction } from "@/app/actions/items";
import { Button } from "@/components/ui/button";
import { ITEM_DESCRIPTION_MAX } from "@/lib/validation/item";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/markdown/markdown-editor";

const PROSE =
  "text-sm leading-relaxed text-foreground [&_a]:text-[var(--primary)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--muted)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-[var(--font-mono)] [&_code]:text-[0.85em] [&_h1]:t-h2 [&_h2]:t-h2 [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-[var(--radius)] [&_pre]:bg-[var(--muted)] [&_pre]:p-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5";

/** Click-to-edit surface (Jira): subtle hover frame and a text cursor. */
const EDIT_SURFACE =
  "-mx-2 block w-[calc(100%+1rem)] cursor-text rounded-[var(--radius)] border border-transparent px-2 py-1 text-left outline-none transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--muted)] focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/30";

/** Elements of the rendering that keep their own click behaviour. */
const OWN_CLICK = "a, button, input, label, select, textarea, summary";

/**
 * Number of non-whitespace characters before the clicked point, so the editor
 * can open with its caret there; null when the browser cannot tell.
 */
function visibleOffsetAt(region: HTMLElement, x: number, y: number): number | null {
  const doc = region.ownerDocument;
  let node: Node | null = null;
  let offset = 0;
  if ("caretPositionFromPoint" in doc && typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(x, y);
    if (position) ({ offsetNode: node, offset } = position);
  } else if ("caretRangeFromPoint" in doc && typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) ({ startContainer: node, startOffset: offset } = range);
  }
  if (!node || !region.contains(node)) return null;
  const before = doc.createRange();
  before.setStart(region, 0);
  before.setEnd(node, offset);
  return before.toString().replace(/\s/g, "").length;
}

export function DescriptionEditor({
  itemId,
  backlogKey,
  description,
  readOnly = false,
}: {
  itemId: string;
  backlogKey: string;
  description: string | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [caretOffset, setCaretOffset] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const counterId = useId();
  const errorId = useId();

  function start(visibleOffset: number | null = null) {
    setCaretOffset(visibleOffset);
    setValue(description ?? "");
    setError(null);
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
    setError(null);
  }
  function save() {
    const trimmed = value.trim();
    // An empty editor clears the description: send null (empty string would
    // trim to "" which the service stores as "", not null). The value is the
    // Markdown produced by the editor, or the stored text if left untouched.
    const next = trimmed === "" ? null : value;
    startTransition(async () => {
      const res = await updateItemAction({
        id: itemId,
        backlogKey,
        description: next,
      });
      if (!res.ok) {
        const fieldError =
          "fieldErrors" in res ? res.fieldErrors?.description?.[0] : undefined;
        setError(fieldError ?? res.error);
        editorRef.current?.focus();
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <MarkdownEditor
          ref={editorRef}
          autoFocus
          autoFocusVisibleOffset={caretOffset}
          label="Description"
          placeholder="Décrivez l’item…"
          invalid={Boolean(error)}
          describedBy={`${counterId}${error ? ` ${errorId}` : ""}`}
          maxLength={ITEM_DESCRIPTION_MAX}
          minHeightClassName="min-h-40"
          value={value}
          onChange={(next) => {
            setValue(next);
            setError(null);
          }}
          disabled={pending}
        />
        <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <span id={counterId}>
            {value.length.toLocaleString("fr-FR").replace(/\u202f/g, " ")} /{" "}
            {ITEM_DESCRIPTION_MAX.toLocaleString("fr-FR").replace(/\u202f/g, " ")}
          </span>
          {error && (
            <span id={errorId} role="alert" className="text-right text-[var(--danger)]">
              {error}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-[var(--radius)] bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-60"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-[var(--radius)] border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-[var(--muted)]"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  if (readOnly) {
    if (!description) {
      return <p className="t-sm text-muted-foreground">Aucune description.</p>;
    }
    return (
      <div className={PROSE}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
      </div>
    );
  }

  // Clicking the rendering opens the editor at the click (Jira), except on
  // links, checkboxes and other controls, or when the user selected text.
  function openFromClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (target instanceof Element && target.closest(OWN_CLICK)) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) {
      return;
    }
    start(visibleOffsetAt(event.currentTarget, event.clientX, event.clientY));
  }

  function openFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      start();
    }
  }

  if (!description) {
    return (
      <button
        type="button"
        onClick={() => start()}
        className={`${EDIT_SURFACE} t-sm py-2 text-muted-foreground hover:text-foreground`}
      >
        Ajouter une description
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="Modifier la description"
        title="Cliquer pour modifier"
        onClick={openFromClick}
        onKeyDown={openFromKeyboard}
        className={`${EDIT_SURFACE} ${PROSE}`}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => start()}
        className="self-start"
      >
        <Pencil aria-hidden />
        Éditer
      </Button>
    </div>
  );
}

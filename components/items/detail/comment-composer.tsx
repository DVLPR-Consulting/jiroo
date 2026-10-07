"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addCommentAction, editCommentAction } from "@/app/actions/comments";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/markdown/markdown-editor";
import { COMMENT_BODY_MAX } from "@/lib/items/comments";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Case/accent-insensitive normaliser (mirrors lib/items/filter.ts). */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Detect an active @-mention token at the end of the text before the caret.
 * Returns the partial name (after @) if active, otherwise null.
 */
function getMentionQuery(textBeforeCaret: string): string | null {
  const match = textBeforeCaret.match(/@([\p{L}\p{N}_]*)$/u);
  return match ? (match[1] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommentComposer({
  itemId,
  backlogKey,
  users,
  mode,
  initialBody,
  initialMentionIds,
  commentId,
  onDone,
}: {
  itemId: string;
  backlogKey: string;
  users: { id: string; name: string }[];
  mode: "create" | "edit";
  initialBody?: string;
  initialMentionIds?: string[];
  commentId?: string; // required when mode === "edit"
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [body, setBody] = useState(initialBody ?? "");
  const [mentionIds, setMentionIds] = useState<Set<string>>(
    new Set(initialMentionIds ?? []),
  );
  const [error, setError] = useState<string | null>(null);

  // @-mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);

  // Filtered candidates for the current @-token
  const mentionCandidates =
    mentionQuery !== null
      ? users.filter((u) =>
          normalize(u.name).includes(normalize(mentionQuery)),
        )
      : [];

  // ---------------------------------------------------------------------------
  // Select a mention candidate from the dropdown: replace the @<query> token
  // before the caret with @<Name> followed by a space.
  // ---------------------------------------------------------------------------

  function selectMention(user: { id: string; name: string }) {
    if (mentionQuery === null) return;
    editorRef.current?.replaceTextBeforeCaret(mentionQuery.length + 1, `@${user.name} `);
    setMentionIds((prev) => new Set([...prev, user.id]));
    setMentionQuery(null);
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;

    setError(null);
    startTransition(async () => {
      if (mode === "create") {
        const res = await addCommentAction({
          backlogKey,
          itemId,
          body: trimmed,
          mentionIds: [...mentionIds],
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setBody("");
        setMentionIds(new Set());
        setMentionQuery(null);
        router.refresh();
      } else {
        if (!commentId) return;
        const res = await editCommentAction({
          backlogKey,
          id: commentId,
          body: trimmed,
          mentionIds: [...mentionIds],
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onDone?.();
        router.refresh();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isDisabled = pending || body.trim() === "";

  return (
    <div className="flex flex-col gap-2">
      {/* Textarea + dropdown wrapper */}
      <div className="relative">
        <MarkdownEditor
          ref={editorRef}
          label={mode === "create" ? "Nouveau commentaire" : "Modifier le commentaire"}
          placeholder={
            mode === "create"
              ? "Écrire un commentaire… (Markdown, @ pour mentionner)"
              : undefined
          }
          maxLength={COMMENT_BODY_MAX}
          minHeightClassName={mode === "create" ? "min-h-24" : "min-h-32"}
          value={body}
          onChange={setBody}
          onCaretTextChange={(text) => setMentionQuery(getMentionQuery(text))}
          // Cmd/Ctrl+Enter submits; plain Enter adds a line.
          onSubmitShortcut={handleSubmit}
          disabled={pending}
        />

        {/* @-mention autocomplete dropdown */}
        {mentionQuery !== null && mentionCandidates.length > 0 && (
          <ul
            role="listbox"
            aria-label="Suggestions de mention"
            className="absolute left-0 top-full z-50 mt-0.5 max-h-48 w-56 overflow-y-auto rounded-[var(--radius)] border border-[var(--border-strong)] bg-popover py-1 shadow-md"
          >
            {mentionCandidates.map((u) => (
              <li key={u.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--muted)]"
                  // Use mousedown so the editor doesn't blur before the click fires
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMention(u);
                  }}
                >
                  {u.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Inline error */}
      {error && (
        <p className="t-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isDisabled}
          onClick={handleSubmit}
        >
          {mode === "create" ? "Commenter" : "Enregistrer"}
        </Button>

        {mode === "edit" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onDone?.()}
          >
            Annuler
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          ⌘ Entrée pour soumettre
        </span>
      </div>
    </div>
  );
}

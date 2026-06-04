"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addCommentAction, editCommentAction } from "@/app/actions/comments";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Case/accent-insensitive normaliser (mirrors lib/items/filter.ts). */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Detect an active @-mention token immediately before the caret.
 * Returns the partial name (after @) if active, otherwise null.
 */
function getMentionQuery(text: string, caretPos: number): string | null {
  const before = text.slice(0, caretPos);
  const match = before.match(/@([\p{L}\p{N}_]*)$/u);
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filtered candidates for the current @-token
  const mentionCandidates =
    mentionQuery !== null
      ? users.filter((u) =>
          normalize(u.name).includes(normalize(mentionQuery)),
        )
      : [];

  // ---------------------------------------------------------------------------
  // Textarea change — track caret to detect active @-token
  // ---------------------------------------------------------------------------

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);
    const caret = e.target.selectionStart ?? val.length;
    setMentionQuery(getMentionQuery(val, caret));
  }

  // Also update the mention query on cursor movement (click/arrow keys)
  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const target = e.currentTarget;
    const caret = target.selectionStart ?? target.value.length;
    setMentionQuery(getMentionQuery(target.value, caret));
  }

  // ---------------------------------------------------------------------------
  // Select a mention candidate from the dropdown
  // ---------------------------------------------------------------------------

  const selectMention = useCallback(
    (user: { id: string; name: string }) => {
      const ta = textareaRef.current;
      if (!ta) return;

      const caret = ta.selectionStart ?? body.length;
      const before = body.slice(0, caret);
      const after = body.slice(caret);

      // Replace the @<query> token with @<Name> followed by a space
      const replaced = before.replace(/@([\p{L}\p{N}_]*)$/u, `@${user.name} `);
      const newBody = replaced + after;

      setBody(newBody);
      setMentionIds((prev) => new Set([...prev, user.id]));
      setMentionQuery(null);

      // Restore focus and move caret after the inserted mention
      requestAnimationFrame(() => {
        ta.focus();
        const newCaret = replaced.length;
        ta.setSelectionRange(newCaret, newCaret);
      });
    },
    [body],
  );

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
  // Keyboard: Cmd/Ctrl+Enter → submit; regular Enter → newline (no trap)
  // ---------------------------------------------------------------------------

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    // All other keys (including plain Enter) pass through normally.
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isDisabled = pending || body.trim() === "";

  return (
    <div className="flex flex-col gap-2">
      {/* Textarea + dropdown wrapper */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          rows={mode === "create" ? 4 : 6}
          className="w-full resize-y rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:border-[var(--ring)] disabled:opacity-60"
          value={body}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === "create"
              ? "Écrire un commentaire… (Markdown, @ pour mentionner)"
              : undefined
          }
          disabled={pending}
          aria-label={mode === "create" ? "Nouveau commentaire" : "Modifier le commentaire"}
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
                  // Use mousedown so the textarea doesn't blur before the click fires
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

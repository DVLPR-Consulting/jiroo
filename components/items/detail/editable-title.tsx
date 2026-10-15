"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateItemAction } from "@/app/actions/items";
import { useShortcutHandler } from "@/components/shortcuts/keyboard-shortcuts-provider";
import { ITEM_TITLE_MAX } from "@/lib/validation/item";

export function EditableTitle({
  itemId,
  itemKey,
  backlogKey,
  title,
  readOnly = false,
}: {
  itemId: string;
  itemKey: string;
  backlogKey: string;
  title: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const counterId = useId();
  const hintId = useId();
  const errorId = useId();

  function start() {
    setValue(title);
    setError(null);
    setEditing(true);
  }
  // « e » (Jira: edit work item) starts renaming when the user may edit.
  useShortcutHandler("item.edit", !readOnly && !editing && start);
  function save() {
    const next = value.trim();
    if (next === "") return;
    if (next === title) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateItemAction({ id: itemId, backlogKey, title: next });
      if (!res.ok) {
        const fieldError =
          "fieldErrors" in res ? res.fieldErrors?.title?.[0] : undefined;
        setError(fieldError ?? res.error);
        inputRef.current?.focus();
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <input
          ref={inputRef}
          autoFocus
          aria-label="Titre de l’item"
          aria-invalid={Boolean(error)}
          aria-describedby={`${counterId}${error ? ` ${errorId}` : ""}`}
          maxLength={ITEM_TITLE_MAX}
          className="w-full rounded-[var(--radius)] border border-[var(--border-strong)] bg-card px-2 py-1 text-[26px] leading-tight font-semibold tracking-[-0.01em] text-foreground outline-none focus:border-[var(--ring)]"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onBlur={() => {
            if (!pending) save();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(false);
              setError(null);
            }
          }}
          disabled={pending}
        />
        <div className="flex items-start justify-between gap-3 px-1 text-xs text-muted-foreground">
          <span id={counterId}>{value.length} / {ITEM_TITLE_MAX}</span>
          {error && (
            <span id={errorId} role="alert" className="text-right text-[var(--danger)]">
              {error}
            </span>
          )}
        </div>
        {pending && <p className="px-1 text-xs text-muted-foreground">Enregistrement…</p>}
      </div>
    );
  }
  const headingClass = "m-0 text-[26px] leading-[1.25] font-semibold tracking-[-0.01em] text-foreground";
  if (readOnly) return <h1 className={`${headingClass} px-2`}>{title}</h1>;
  // Click the title to rename it (Jira): no pencil, a hover frame shows it is editable.
  return (
    <div>
      <h1 className={headingClass}>
        <button
          type="button"
          aria-describedby={hintId}
          title="Cliquer pour renommer"
          onClick={start}
          className="-mx-0 w-full cursor-text rounded-[var(--radius)] border border-transparent px-2 py-0.5 text-left outline-none hover:border-[var(--border-strong)] hover:bg-[var(--muted)] focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/30"
        >
          {title}
        </button>
      </h1>
      <span id={hintId} className="sr-only">
        Renommer {itemKey}
      </span>
      {error && (
        <p className="t-sm mt-1 px-2" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

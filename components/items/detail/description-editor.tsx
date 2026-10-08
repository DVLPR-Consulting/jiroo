"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { updateItemAction } from "@/app/actions/items";
import { useAutosave } from "@/lib/autosave/use-autosave";
import type { SaveResult } from "@/lib/autosave/scheduler";
import { ITEM_DESCRIPTION_MAX } from "@/lib/validation/item";
import { MarkdownEditor } from "@/components/markdown/markdown-editor";
import { cn } from "@/lib/utils";

/** Static rendering, for read-only raw content and while the editor loads. */
const PROSE =
  "text-sm leading-[1.7] text-foreground [&_a]:text-[var(--primary)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--muted)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-[var(--font-mono)] [&_code]:text-[0.85em] [&_h1]:mt-6 [&_h1]:mb-1.5 [&_h1]:text-[22px] [&_h1]:leading-[1.2] [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:mb-1 [&_h2]:text-[17px] [&_h2]:leading-[1.3] [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1.5 [&_pre]:overflow-auto [&_pre]:rounded-[var(--radius)] [&_pre]:bg-[var(--muted)] [&_pre]:p-3 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6 [&_table]:my-2 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2 [&>*:first-child]:mt-0";

/** Pause in typing before the description is saved. */
const AUTOSAVE_DELAY_MS = 900;
/** The character counter only shows near the limit. */
const COUNTER_FROM = Math.floor(ITEM_DESCRIPTION_MAX * 0.9);

const PLACEHOLDER = "Écrivez, ou tapez « / » pour insérer un bloc…";

function formatCount(count: number) {
  return count.toLocaleString("fr-FR").replace(/ /g, " ");
}

/** The service trims the description (and stores an empty one as null). */
const sameDescription = (a: string, b: string) => a.trim() === b.trim();

/**
 * Item description edited in place like a Notion page: always rendered by the
 * editor, saved automatically (pause in typing, blur, drawer closed or item
 * switched), read-only for users who cannot edit the item. Content the editor
 * cannot round-trip is edited as raw Markdown with an explicit save.
 */
export function DescriptionEditor({
  itemId,
  backlogKey,
  description,
  revision,
  readOnly = false,
}: {
  itemId: string;
  backlogKey: string;
  description: string | null;
  /** Server revision of `description` (the item's update time, in ms). */
  revision?: number;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const stored = description ?? "";
  const [value, setValue] = useState(stored);
  const [raw, setRaw] = useState(false);
  const [seen, setSeen] = useState({ description: stored, revision });
  const regionRef = useRef<HTMLDivElement>(null);
  const counterId = useId();
  const statusId = useId();

  const save = useCallback(
    async (next: string): Promise<SaveResult> => {
      try {
        const res = await updateItemAction({
          id: itemId,
          backlogKey,
          // An emptied editor clears the description.
          description: next.trim() === "" ? null : next,
        });
        if (!res.ok) {
          const fieldError = "fieldErrors" in res ? res.fieldErrors?.description?.[0] : undefined;
          return { ok: false, error: fieldError ?? res.error };
        }
        router.refresh();
        const updatedAt = res.item?.updatedAt;
        return { ok: true, revision: updatedAt ? new Date(updatedAt).getTime() : undefined };
      } catch {
        return { ok: false, error: "Le serveur est injoignable." };
      }
    },
    [itemId, backlogKey, router],
  );

  const autosave = useAutosave({
    initial: stored,
    revision,
    save,
    delay: AUTOSAVE_DELAY_MS,
    equals: sameDescription,
  });

  // A newer server state (refresh, another user, another tab) replaces the
  // text only when no local change is pending; a response older than our
  // last acknowledged save is ignored (see adopt). Our own saves come back
  // trimmed: they must not reset the editor under the caret.
  if (stored !== seen.description || revision !== seen.revision) {
    setSeen({ description: stored, revision });
    // Unsaved raw Markdown is not tracked by the scheduler: keep it too.
    const rawDirty = raw && !sameDescription(value, seen.description);
    if (!rawDirty && autosave.adopt(stored, revision) && !sameDescription(stored, value)) {
      setValue(stored);
    }
  }

  function onChange(next: string) {
    setValue(next);
    if (!raw) autosave.change(next);
  }

  if (readOnly && (raw || !stored)) {
    if (!stored) return <p className="t-sm text-muted-foreground">Aucune description.</p>;
    return (
      <div className={PROSE}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{stored}</ReactMarkdown>
      </div>
    );
  }

  const showCounter = !readOnly && value.length >= COUNTER_FROM;
  const failed = autosave.status === "error";
  const describedBy = [showCounter ? counterId : null, failed ? statusId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={regionRef}
        // Échap leaves the editor here; a second Échap closes the drawer.
        tabIndex={-1}
        className={cn(
          "-mx-2 rounded-[var(--radius)] px-2 py-1.5 outline-none transition-colors",
          !readOnly &&
            !raw &&
            "hover:bg-[var(--muted)]/60 focus-within:bg-transparent focus-within:hover:bg-transparent",
        )}
      >
        <MarkdownEditor
          variant="page"
          readOnly={readOnly}
          label="Description"
          placeholder={PLACEHOLDER}
          maxLength={ITEM_DESCRIPTION_MAX}
          minHeightClassName={readOnly ? "min-h-0" : "min-h-24"}
          invalid={failed}
          describedBy={describedBy || undefined}
          value={value}
          onChange={onChange}
          onBlur={() => {
            if (!raw) void autosave.flush();
          }}
          onEscape={() => regionRef.current?.focus()}
          onRawModeChange={setRaw}
          fallback={
            value ? (
              <div className={PROSE}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
              </div>
            ) : (
              <p className="min-h-24 text-sm leading-[1.7] text-muted-foreground">
                {readOnly ? null : PLACEHOLDER}
              </p>
            )
          }
        />
      </div>
      {!readOnly ? (
        <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span id={counterId}>
            {showCounter
              ? `${formatCount(value.length)} / ${formatCount(ITEM_DESCRIPTION_MAX)}`
              : null}
          </span>
          {raw ? (
            <RawActions
              busy={autosave.status === "saving"}
              dirty={!sameDescription(value, stored)}
              onSave={() => {
                autosave.change(value);
                void autosave.flush();
              }}
              onCancel={() => {
                autosave.discard();
                setValue(stored);
              }}
            />
          ) : null}
          <span id={statusId} aria-live="polite" className="ml-auto flex items-center gap-2">
            {autosave.status === "saving" ? "Enregistrement…" : null}
            {autosave.status === "saved" && !autosave.pending ? "Enregistré" : null}
            {failed ? (
              <>
                <span className="text-[var(--danger)]">
                  Échec de l’enregistrement{autosave.error ? ` : ${autosave.error}` : null}
                </span>
                <button
                  type="button"
                  onClick={() => void autosave.retry()}
                  className="rounded px-1.5 py-0.5 font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
                >
                  Réessayer
                </button>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Explicit save of the raw Markdown fallback (no autosave there). */
function RawActions({
  busy,
  dirty,
  onSave,
  onCancel,
}: {
  busy: boolean;
  dirty: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <span className="flex gap-2">
      <button
        type="button"
        onClick={onSave}
        disabled={busy || !dirty}
        className="rounded-[var(--radius)] bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-60"
      >
        Enregistrer
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy || !dirty}
        className="rounded-[var(--radius)] border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-[var(--muted)] disabled:opacity-60"
      >
        Annuler
      </button>
    </span>
  );
}

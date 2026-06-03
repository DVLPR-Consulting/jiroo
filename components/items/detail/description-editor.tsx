"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { updateItemAction } from "@/app/actions/items";

export function DescriptionEditor({
  itemId,
  backlogKey,
  description,
}: {
  itemId: string;
  backlogKey: string;
  description: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
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
    // Empty textarea clears the description: send null (empty string would
    // trim to "" which the service stores as "", not null).
    const next = trimmed === "" ? null : value;
    startTransition(async () => {
      const res = await updateItemAction({
        id: itemId,
        backlogKey,
        description: next,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          autoFocus
          rows={8}
          className="w-full resize-y rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:border-[var(--ring)]"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Description (Markdown supporté)…"
          disabled={pending}
        />
        {error && (
          <p className="t-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-[var(--radius)] bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-60"
          >
            Enregistrer
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

  if (!description) {
    return (
      <button
        type="button"
        onClick={start}
        className="t-sm rounded px-1 py-1 text-left text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground"
      >
        Ajouter une description
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm leading-relaxed text-foreground [&_a]:text-[var(--primary)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--muted)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-[var(--font-mono)] [&_code]:text-[0.85em] [&_h1]:t-h2 [&_h2]:t-h2 [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-[var(--radius)] [&_pre]:bg-[var(--muted)] [&_pre]:p-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
      </div>
      <button
        type="button"
        onClick={start}
        className="t-sm self-start rounded px-1 py-0.5 text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground"
      >
        Éditer
      </button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateItemAction } from "@/app/actions/items";

export function EditableTitle({
  itemId,
  backlogKey,
  title,
  readOnly = false,
}: {
  itemId: string;
  backlogKey: string;
  title: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setValue(title);
    setError(null);
    setEditing(true);
  }
  function save() {
    setEditing(false);
    const next = value.trim();
    if (next === "" || next === title) return;
    startTransition(async () => {
      const res = await updateItemAction({ id: itemId, backlogKey, title: next });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="w-full rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-[22px] font-semibold text-foreground outline-none focus:border-[var(--ring)]"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          else if (e.key === "Escape") setEditing(false);
        }}
        disabled={pending}
      />
    );
  }
  if (readOnly) return <h2 className="t-h1 px-1">{title}</h2>;
  return (
    <div>
      <h2
        className="t-h1 cursor-text rounded px-1 hover:bg-[var(--muted)]"
        title="Cliquer pour renommer"
        onClick={start}
      >
        {title}
      </h2>
      {error && (
        <p className="t-sm mt-1 px-1" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

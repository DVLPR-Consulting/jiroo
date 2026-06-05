"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { updateItemAction } from "@/app/actions/items";
import { createLabelAction } from "@/app/actions/labels";
import { PrioIcon } from "@/components/icons/prio-icon";
import { LabelPill } from "@/components/items/label-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ITEM_KINDS,
  ITEM_KIND_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  type ItemKind,
  type Priority,
} from "@/lib/design/constants";

type StatusLite = { id: string; name: string; color: string; category: string };
type UserLite = { id: string; name: string; email: string };
type LabelLite = { id: string; name: string; color: string };

type UpdatePatch = Omit<Parameters<typeof updateItemAction>[0], "id" | "backlogKey">;

// Shared driver: runs the action in a transition then refreshes; tracks
// pending + a transient error string surfaced by each editor.
function useFieldUpdate(itemId: string, backlogKey: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(patch: UpdatePatch) {
    setError(null);
    startTransition(async () => {
      const res = await updateItemAction({ id: itemId, backlogKey, ...patch });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return { pending, error, run };
}

function FieldError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="t-sm mt-1" style={{ color: "var(--danger)" }}>
      {error}
    </p>
  );
}

const selectClass =
  "w-full rounded-[var(--radius)] border border-border bg-[var(--surface)] px-2 py-1 text-sm text-foreground outline-none focus:border-[var(--ring)] disabled:opacity-60";

function asPriority(value: number): Priority {
  return Math.min(4, Math.max(0, value)) as Priority;
}

// yyyy-mm-dd in local time for an <input type="date"> value.
function toDateInputValue(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function StatusField({
  itemId,
  backlogKey,
  statusId,
  statuses,
}: {
  itemId: string;
  backlogKey: string;
  statusId: string;
  statuses: StatusLite[];
}) {
  const { pending, error, run } = useFieldUpdate(itemId, backlogKey);
  const selected = statuses.find((s) => s.id === statusId);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: selected?.color ?? "var(--border-strong)" }}
          aria-hidden
        />
        <select
          className={selectClass}
          value={statusId}
          disabled={pending}
          onChange={(e) => run({ statusId: e.target.value })}
          aria-label="Statut"
        >
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <FieldError error={error} />
    </div>
  );
}

export function PriorityField({
  itemId,
  backlogKey,
  priority,
}: {
  itemId: string;
  backlogKey: string;
  priority: number;
}) {
  const { pending, error, run } = useFieldUpdate(itemId, backlogKey);

  return (
    <div>
      <div className="flex items-center gap-2">
        <PrioIcon priority={asPriority(priority)} />
        <select
          className={selectClass}
          value={String(asPriority(priority))}
          disabled={pending}
          onChange={(e) => run({ priority: Number(e.target.value) })}
          aria-label="Priorité"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      <FieldError error={error} />
    </div>
  );
}

export function KindField({
  itemId,
  backlogKey,
  kind,
}: {
  itemId: string;
  backlogKey: string;
  kind: ItemKind;
}) {
  const { pending, error, run } = useFieldUpdate(itemId, backlogKey);

  return (
    <div>
      <select
        className={selectClass}
        value={kind}
        disabled={pending}
        onChange={(e) => run({ kind: e.target.value as ItemKind })}
        aria-label="Nature"
      >
        {ITEM_KINDS.map((k) => (
          <option key={k} value={k}>
            {ITEM_KIND_LABELS[k]}
          </option>
        ))}
      </select>
      <FieldError error={error} />
    </div>
  );
}

export function AssigneeField({
  itemId,
  backlogKey,
  assigneeId,
  users,
}: {
  itemId: string;
  backlogKey: string;
  assigneeId: string | null;
  users: UserLite[];
}) {
  const { pending, error, run } = useFieldUpdate(itemId, backlogKey);

  return (
    <div>
      <select
        className={selectClass}
        value={assigneeId ?? ""}
        disabled={pending}
        onChange={(e) => run({ assigneeId: e.target.value || null })}
        aria-label="Assigné"
      >
        <option value="">Non assigné</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <FieldError error={error} />
    </div>
  );
}

export function DueDateField({
  itemId,
  backlogKey,
  dueDate,
}: {
  itemId: string;
  backlogKey: string;
  dueDate: Date | string | null;
}) {
  const { pending, error, run } = useFieldUpdate(itemId, backlogKey);
  const value = toDateInputValue(dueDate);

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          className={selectClass}
          value={value}
          disabled={pending}
          onChange={(e) => run({ dueDate: e.target.value || null })}
          aria-label="Échéance"
        />
        {value && (
          <button
            type="button"
            onClick={() => run({ dueDate: null })}
            disabled={pending}
            className="shrink-0 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-[var(--muted)] disabled:opacity-60"
          >
            Effacer
          </button>
        )}
      </div>
      <FieldError error={error} />
    </div>
  );
}

// Normalise a string for case/accent-insensitive comparison.
function normalise(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function LabelsField({
  itemId,
  backlogKey,
  backlogId,
  itemLabelIds,
  backlogLabels,
}: {
  itemId: string;
  backlogKey: string;
  backlogId: string;
  itemLabelIds: string[];
  backlogLabels: LabelLite[];
}) {
  const { pending, error, run } = useFieldUpdate(itemId, backlogKey);
  const [query, setQuery] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();

  const selectedSet = new Set(itemLabelIds);
  const selected = backlogLabels.filter((l) => selectedSet.has(l.id));

  // Filter by query (case/accent-insensitive).
  const normQuery = normalise(query.trim());
  const filtered = normQuery
    ? backlogLabels.filter((l) => normalise(l.name).includes(normQuery))
    : backlogLabels;

  // Show the create option when there's a non-empty query that doesn't match
  // any existing label name exactly.
  const exactMatch = backlogLabels.some(
    (l) => normalise(l.name) === normQuery
  );
  const showCreate = normQuery.length > 0 && !exactMatch;

  function toggle(labelId: string) {
    const next = new Set(selectedSet);
    if (next.has(labelId)) next.delete(labelId);
    else next.add(labelId);
    run({ labelIds: Array.from(next) });
  }

  function handleCreate() {
    const name = query.trim();
    if (!name) return;
    setCreateError(null);
    startCreate(async () => {
      const res = await createLabelAction({ backlogKey, backlogId, name });
      if (!res.ok) {
        setCreateError(res.error);
        return;
      }
      // Assign the newly-created label immediately.
      const next = new Set(selectedSet);
      next.add(res.label.id);
      run({ labelIds: Array.from(next) });
      setQuery("");
    });
  }

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label="Labels"
            className="flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-[var(--radius)] border border-border bg-[var(--surface)] px-2 py-1 text-left text-sm outline-none hover:border-[var(--border-strong)] focus:border-[var(--ring)] disabled:opacity-60"
          >
            {selected.length > 0 ? (
              selected.map((l) => (
                <LabelPill key={l.id} name={l.name} color={l.color} />
              ))
            ) : (
              <span className="text-muted-foreground">Aucun label</span>
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          {/* Search / create input — rendered outside menuitem flow so Radix
              typeahead doesn't hijack keystrokes. */}
          <div className="px-1.5 pb-1 pt-1">
            <input
              className={selectClass}
              placeholder="Filtrer ou créer…"
              value={query}
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
              // Prevent Radix's roving focus / typeahead from stealing keys.
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>

          {filtered.length > 0 ? (
            filtered.map((l) => (
              <DropdownMenuCheckboxItem
                key={l.id}
                checked={selectedSet.has(l.id)}
                disabled={pending}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => toggle(l.id)}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: `var(${l.color})` }}
                  aria-hidden
                />
                {l.name}
              </DropdownMenuCheckboxItem>
            ))
          ) : (
            !showCreate && (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                Aucun label disponible
              </p>
            )
          )}

          {showCreate && (
            <>
              {filtered.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                disabled={creating || pending}
                onSelect={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
              >
                Créer «&nbsp;{query.trim()}&nbsp;»
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <FieldError error={error} />
      <FieldError error={createError} />
    </div>
  );
}

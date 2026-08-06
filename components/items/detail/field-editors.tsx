"use client";

import { useTransition, useState } from "react";
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
import { useOptimisticFieldUpdate } from "@/components/items/detail/use-optimistic-field-update";

type StatusLite = { id: string; name: string; color: string; category: string };
type UserLite = { id: string; name: string };
type LabelLite = { id: string; name: string; color: string };

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
  const { value, pending, error, update } = useOptimisticFieldUpdate({
    value: statusId,
    itemId,
    backlogKey,
    toPatch: (next) => ({ statusId: next }),
  });
  const selected = statuses.find((s) => s.id === value);

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
          value={value}
          disabled={pending}
          onChange={(e) => update(e.target.value)}
          aria-label="Statut"
          aria-busy={pending}
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
  const field = useOptimisticFieldUpdate({
    value: priority,
    itemId,
    backlogKey,
    toPatch: (next) => ({ priority: next }),
  });
  const selected = asPriority(field.value);

  return (
    <div>
      <div className="flex items-center gap-2">
        <PrioIcon priority={selected} />
        <select
          className={selectClass}
          value={String(selected)}
          disabled={field.pending}
          onChange={(e) => field.update(Number(e.target.value))}
          aria-label="Priorité"
          aria-busy={field.pending}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      <FieldError error={field.error} />
    </div>
  );
}

export function EstimateField({
  itemId,
  backlogKey,
  estimatePoints,
}: {
  itemId: string;
  backlogKey: string;
  estimatePoints: number | null;
}) {
  const field = useOptimisticFieldUpdate({
    value: estimatePoints,
    itemId,
    backlogKey,
    toPatch: (next) => ({ estimatePoints: next }),
  });
  const [draft, setDraft] = useState(
    estimatePoints === null ? "" : String(estimatePoints),
  );

  return (
    <div>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() === "") return;
          field.update(Number(draft));
        }}
      >
        <input
          type="number"
          min={0}
          max={999.99}
          step={0.01}
          value={draft}
          disabled={field.pending}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Points"
          aria-busy={field.pending}
          className={selectClass}
        />
        <button
          type="submit"
          disabled={field.pending || draft.trim() === ""}
          className="shrink-0 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-[var(--muted)] disabled:opacity-60"
        >
          Enregistrer
        </button>
        {field.value !== null && (
          <button
            type="button"
            aria-label="Effacer l’estimation"
            onClick={() => {
              setDraft("");
              field.update(null);
            }}
            disabled={field.pending}
            className="shrink-0 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-[var(--muted)] disabled:opacity-60"
          >
            Effacer
          </button>
        )}
      </form>
      <FieldError error={field.error} />
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
  const field = useOptimisticFieldUpdate({
    value: kind,
    itemId,
    backlogKey,
    toPatch: (next) => ({ kind: next }),
  });

  return (
    <div>
      <select
        className={selectClass}
        value={field.value}
        disabled={field.pending}
        onChange={(e) => field.update(e.target.value as ItemKind)}
        aria-label="Nature"
        aria-busy={field.pending}
      >
        {ITEM_KINDS.map((k) => (
          <option key={k} value={k}>
            {ITEM_KIND_LABELS[k]}
          </option>
        ))}
      </select>
      <FieldError error={field.error} />
    </div>
  );
}

export function AssigneeField({
  itemId,
  backlogKey,
  assigneeId,
  currentAssignee,
  users,
}: {
  itemId: string;
  backlogKey: string;
  assigneeId: string | null;
  currentAssignee?: UserLite;
  users: UserLite[];
}) {
  const field = useOptimisticFieldUpdate({
    value: assigneeId,
    itemId,
    backlogKey,
    toPatch: (next) => ({ assigneeId: next }),
  });

  return (
    <div>
      <select
        className={selectClass}
        value={field.value ?? ""}
        disabled={field.pending}
        onChange={(e) => field.update(e.target.value || null)}
        aria-label="Assigné"
        aria-busy={field.pending}
      >
        <option value="">Non assigné</option>
        {currentAssignee && !users.some((user) => user.id === currentAssignee.id) ? (
          <option value={currentAssignee.id} disabled>
            {currentAssignee.name}
          </option>
        ) : null}
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <FieldError error={field.error} />
    </div>
  );
}

export function ReporterField({
  itemId,
  backlogKey,
  reporterId,
  currentReporter,
  users,
}: {
  itemId: string;
  backlogKey: string;
  reporterId: string;
  currentReporter?: UserLite;
  users: UserLite[];
}) {
  const field = useOptimisticFieldUpdate({
    value: reporterId,
    itemId,
    backlogKey,
    toPatch: (next) => ({ reporterId: next }),
  });

  return (
    <div>
      <select
        className={selectClass}
        value={field.value}
        disabled={field.pending}
        onChange={(e) => field.update(e.target.value)}
        aria-label="Rapporteur"
        aria-busy={field.pending}
      >
        {currentReporter && !users.some((user) => user.id === currentReporter.id) ? (
          <option value={currentReporter.id} disabled>
            {currentReporter.name}
          </option>
        ) : null}
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <FieldError error={field.error} />
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
  const field = useOptimisticFieldUpdate({
    value: toDateInputValue(dueDate),
    itemId,
    backlogKey,
    toPatch: (next) => ({ dueDate: next || null }),
  });

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          className={selectClass}
          value={field.value}
          disabled={field.pending}
          onChange={(e) => field.update(e.target.value)}
          aria-label="Échéance"
          aria-busy={field.pending}
        />
        {field.value && (
          <button
            type="button"
            onClick={() => field.update("")}
            disabled={field.pending}
            className="shrink-0 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-[var(--muted)] disabled:opacity-60"
          >
            Effacer
          </button>
        )}
      </div>
      <FieldError error={field.error} />
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
  const field = useOptimisticFieldUpdate({
    value: itemLabelIds,
    itemId,
    backlogKey,
    toPatch: (next) => ({ labelIds: next }),
  });
  const [query, setQuery] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();

  const selectedSet = new Set(field.value);
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
    field.update(Array.from(next));
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
      field.update(Array.from(next));
      setQuery("");
    });
  }

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={field.pending}
            aria-label="Labels"
            aria-busy={field.pending}
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
                disabled={field.pending}
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
                disabled={creating || field.pending}
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
      <FieldError error={field.error} />
      <FieldError error={createError} />
    </div>
  );
}

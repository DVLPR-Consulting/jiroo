"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { updateItemAction } from "@/app/actions/items";
import { PrioIcon } from "@/components/icons/prio-icon";
import { StatusDot } from "@/components/icons/status-dot";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LABEL_HUES,
  PRIORITIES,
  PRIORITY_LABELS,
  type LabelHue,
  type Priority,
  type StatusId,
} from "@/lib/design/constants";

type StatusOption = {
  id: string;
  name: string;
  color: string;
  category: "todo" | "in_progress" | "done";
  order: number;
};

type UserOption = { id: string; name: string };
type UpdatePatch = Omit<Parameters<typeof updateItemAction>[0], "id" | "backlogKey">;

function asPriority(value: number): Priority {
  return Math.min(4, Math.max(0, value)) as Priority;
}

function hueFor(value: string): LabelHue {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return LABEL_HUES[Math.abs(hash) % LABEL_HUES.length]!;
}

function visualStatusId(status: StatusOption, statuses: StatusOption[]): StatusId {
  if (status.category === "todo") return "todo";
  if (status.category === "done") return "done";

  // Backlogs own the same fixed pair of in-progress statuses. Their UUIDs are
  // generated per backlog, so their deterministic domain order distinguishes
  // the first progress state (doing) from the second (review).
  const progressStatuses = statuses
    .filter((option) => option.category === "in_progress")
    .sort((a, b) => a.order - b.order);
  return progressStatuses.findIndex((option) => option.id === status.id) <= 0
    ? "doing"
    : "review";
}

function useInlineUpdate(itemId: string, backlogKey: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(patch: UpdatePatch, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await updateItemAction({ id: itemId, backlogKey, ...patch });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  return { error, pending, update };
}

function InlineError({ id, error }: { id: string; error: string | null }) {
  if (!error) return null;
  return (
    <span
      id={id}
      role="alert"
      className="absolute right-0 top-full z-50 mt-1 w-max max-w-56 rounded bg-[var(--danger)] px-2 py-1 text-xs text-white shadow-[var(--shadow-sm)]"
    >
      {error}
    </span>
  );
}

function EditorShell({ children }: { children: ReactNode }) {
  return <span className="relative inline-flex min-w-0">{children}</span>;
}

const triggerClass =
  "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60";
const readOnlyClass =
  "inline-flex min-h-7 max-w-full items-center gap-1.5 px-1.5 py-1 text-xs text-muted-foreground";

const contentClass = "min-w-40";

export function InlineStatus({
  itemId,
  backlogKey,
  statusId,
  statuses,
  readOnly = false,
}: {
  itemId: string;
  backlogKey: string;
  statusId: string;
  statuses: StatusOption[];
  readOnly?: boolean;
}) {
  const { error, pending, update } = useInlineUpdate(itemId, backlogKey);
  const errorId = useId();
  const selected = statuses.find((status) => status.id === statusId);

  if (readOnly) {
    return (
      <span className={readOnlyClass}>
        {selected && <StatusDot status={visualStatusId(selected, statuses)} />}
        <span className="truncate">{selected?.name ?? statusId}</span>
      </span>
    );
  }

  return (
    <EditorShell>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Statut : ${selected?.name ?? statusId}`}
            aria-describedby={error ? errorId : undefined}
            className={triggerClass}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {selected && <StatusDot status={visualStatusId(selected, statuses)} />}
            <span className="truncate">{selected?.name ?? statusId}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={contentClass}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {statuses.map((status) => (
            <DropdownMenuItem
              key={status.id}
              disabled={pending}
              aria-label={status.name}
              onSelect={() => update({ statusId: status.id })}
            >
              <StatusDot status={visualStatusId(status, statuses)} />
              {status.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <InlineError id={errorId} error={error} />
    </EditorShell>
  );
}

export function InlinePriority({
  itemId,
  backlogKey,
  priority,
  readOnly = false,
}: {
  itemId: string;
  backlogKey: string;
  priority: number;
  readOnly?: boolean;
}) {
  const { error, pending, update } = useInlineUpdate(itemId, backlogKey);
  const errorId = useId();
  const selected = asPriority(priority);

  if (readOnly) {
    return (
      <span className={readOnlyClass}>
        <PrioIcon priority={selected} />
      </span>
    );
  }

  return (
    <EditorShell>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Priorité : ${PRIORITY_LABELS[selected]}`}
            aria-describedby={error ? errorId : undefined}
            className={triggerClass}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <PrioIcon priority={selected} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={contentClass}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {PRIORITIES.map((option) => (
            <DropdownMenuItem
              key={option}
              disabled={pending}
              aria-label={PRIORITY_LABELS[option]}
              onSelect={() => update({ priority: option })}
            >
              <PrioIcon priority={option} />
              {PRIORITY_LABELS[option]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <InlineError id={errorId} error={error} />
    </EditorShell>
  );
}

export function InlineEstimate({
  itemId,
  backlogKey,
  estimatePoints,
  readOnly = false,
}: {
  itemId: string;
  backlogKey: string;
  estimatePoints: number | null;
  readOnly?: boolean;
}) {
  const { error, pending, update } = useInlineUpdate(itemId, backlogKey);
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(estimatePoints === null ? "" : String(estimatePoints));
  const label = estimatePoints === null ? "Non estimé" : `${estimatePoints} pt`;

  if (readOnly) {
    return <span className={readOnlyClass}>{label}</span>;
  }

  return (
    <EditorShell>
      <DropdownMenu
        open={open}
        onOpenChange={(open) => {
          setOpen(open);
          if (open) setDraft(estimatePoints === null ? "" : String(estimatePoints));
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Estimation : ${label}`}
            aria-describedby={error ? errorId : undefined}
            className={triggerClass}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {label}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 p-2"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim() === "") return;
              update({ estimatePoints: Number(draft) }, () => setOpen(false));
            }}
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
              Points
              <input
                type="number"
                min={0}
                max={999.99}
                step={0.01}
                value={draft}
                disabled={pending}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                className="w-full rounded border border-border bg-[var(--surface)] px-2 py-1 text-sm text-foreground outline-none focus:border-[var(--ring)]"
              />
            </label>
            <button
              type="submit"
              disabled={pending || draft.trim() === ""}
              aria-label="Enregistrer l’estimation"
              className="rounded bg-[var(--primary)] px-2 py-1 text-xs text-white disabled:opacity-60"
            >
              Enregistrer
            </button>
          </form>
          <div className="mt-2 grid grid-cols-6 gap-1" aria-label="Estimations rapides">
            {[1, 2, 3, 5, 8, 13].map((points) => (
              <DropdownMenuItem
                key={points}
                className="justify-center px-1"
                disabled={pending}
                onSelect={() => update({ estimatePoints: points }, () => setOpen(false))}
              >
                {points}
              </DropdownMenuItem>
            ))}
          </div>
          <button
            type="button"
            disabled={pending || estimatePoints === null}
            onClick={() => update({ estimatePoints: null }, () => setOpen(false))}
            className="mt-2 w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-[var(--muted)] disabled:opacity-60"
          >
            Effacer l’estimation
          </button>
        </DropdownMenuContent>
      </DropdownMenu>
      <InlineError id={errorId} error={error} />
    </EditorShell>
  );
}

export function InlineAssignee({
  itemId,
  backlogKey,
  assigneeId,
  assigneeName,
  users,
  readOnly = false,
}: {
  itemId: string;
  backlogKey: string;
  assigneeId: string | null;
  assigneeName?: string | null;
  users: UserOption[];
  readOnly?: boolean;
}) {
  const { error, pending, update } = useInlineUpdate(itemId, backlogKey);
  const errorId = useId();
  const selected =
    users.find((user) => user.id === assigneeId) ??
    (assigneeId && assigneeName ? { id: assigneeId, name: assigneeName } : undefined);
  const label = selected?.name ?? "Non assigné";

  if (readOnly) {
    return (
      <span className={readOnlyClass}>
        {selected ? (
          <InitialsAvatar name={selected.name} hue={hueFor(selected.id)} size={20} />
        ) : (
          <span
            aria-hidden
            className="size-5 rounded-full"
            style={{ border: "1.5px dashed var(--border-strong)" }}
          />
        )}
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <EditorShell>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Assigné : ${label}`}
            aria-describedby={error ? errorId : undefined}
            className={triggerClass}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {selected ? (
              <InitialsAvatar name={selected.name} hue={hueFor(selected.id)} size={20} />
            ) : (
              <span
                aria-hidden
                className="size-5 rounded-full"
                style={{ border: "1.5px dashed var(--border-strong)" }}
              />
            )}
            <span className="truncate">{label}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={contentClass}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DropdownMenuItem
            disabled={pending}
            aria-label="Non assigné"
            onSelect={() => update({ assigneeId: null })}
          >
            <span
              aria-hidden
              className="size-5 rounded-full"
              style={{ border: "1.5px dashed var(--border-strong)" }}
            />
            Non assigné
          </DropdownMenuItem>
          {users.map((user) => (
            <DropdownMenuItem
              key={user.id}
              disabled={pending}
              aria-label={user.name}
              onSelect={() => update({ assigneeId: user.id })}
            >
              <InitialsAvatar name={user.name} hue={hueFor(user.id)} size={20} />
              {user.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <InlineError id={errorId} error={error} />
    </EditorShell>
  );
}

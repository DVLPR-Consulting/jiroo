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
  category: string;
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

function useInlineUpdate(itemId: string, backlogKey: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(patch: UpdatePatch) {
    setError(null);
    startTransition(async () => {
      const result = await updateItemAction({ id: itemId, backlogKey, ...patch });
      if (!result.ok) {
        setError(result.error);
        return;
      }
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

const contentClass = "min-w-40";

export function InlineStatus({
  itemId,
  backlogKey,
  statusId,
  statuses,
}: {
  itemId: string;
  backlogKey: string;
  statusId: string;
  statuses: StatusOption[];
}) {
  const { error, pending, update } = useInlineUpdate(itemId, backlogKey);
  const errorId = useId();
  const selected = statuses.find((status) => status.id === statusId);

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
            <StatusDot status={statusId as StatusId} />
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
              <StatusDot status={status.id as StatusId} />
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
}: {
  itemId: string;
  backlogKey: string;
  priority: number;
}) {
  const { error, pending, update } = useInlineUpdate(itemId, backlogKey);
  const errorId = useId();
  const selected = asPriority(priority);

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

export function InlineAssignee({
  itemId,
  backlogKey,
  assigneeId,
  users,
}: {
  itemId: string;
  backlogKey: string;
  assigneeId: string | null;
  users: UserOption[];
}) {
  const { error, pending, update } = useInlineUpdate(itemId, backlogKey);
  const errorId = useId();
  const selected = users.find((user) => user.id === assigneeId);
  const label = selected?.name ?? "Non assigné";

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

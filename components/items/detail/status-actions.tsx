"use client";

import { useRef } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useOptimisticFieldUpdate } from "@/components/items/detail/use-optimistic-field-update";
import { useShortcutHandler } from "@/components/shortcuts/keyboard-shortcuts-provider";
import { nextStatus } from "@/lib/items/status-transition";

type StatusOption = { id: string; name: string; color: string; order: number };

function Dot({ color }: { color?: string }) {
  return (
    <span
      aria-hidden
      className="size-2 flex-none rounded-full"
      style={{ background: color ?? "var(--border-strong)" }}
    />
  );
}

/**
 * The drawer's status controls (Jira's status button and transition): a
 * status menu and, when the workflow has one, a button moving the item to
 * the next status. Both share one optimistic value.
 */
export function StatusActions({
  itemId,
  backlogKey,
  statusId,
  statuses,
  canTransition,
}: {
  itemId: string;
  backlogKey: string;
  statusId: string;
  statuses: StatusOption[];
  canTransition: boolean;
}) {
  const field = useOptimisticFieldUpdate({
    value: statusId,
    itemId,
    backlogKey,
    toPatch: (next) => ({ statusId: next }),
  });
  const selectRef = useRef<HTMLSelectElement>(null);
  useShortcutHandler(
    "item.status",
    canTransition &&
      (() => {
        const select = selectRef.current;
        if (!select || select.disabled) return;
        select.focus();
        try {
          select.showPicker?.();
        } catch {
          // Not allowed or not supported: the focused select opens with the keyboard.
        }
      }),
  );
  const current = statuses.find((status) => status.id === field.value);
  const next = canTransition ? nextStatus(statuses, field.value) : null;

  if (!canTransition) {
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--muted)] px-3 text-[13px] font-semibold">
        <Dot color={current?.color} />
        {current?.name ?? statusId}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <span className="relative inline-flex">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
            <Dot color={current?.color} />
          </span>
          <select
            ref={selectRef}
            aria-label="Statut"
            aria-busy={field.pending}
            disabled={field.pending}
            value={field.value}
            onChange={(event) => field.update(event.target.value)}
            className="h-9 cursor-pointer appearance-none rounded-[var(--radius)] border border-[var(--border-strong)] bg-card pr-8 pl-7 text-[13px] font-semibold text-foreground outline-none hover:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
          >
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2"
          />
        </span>
        {next && (
          <button
            type="button"
            disabled={field.pending}
            onClick={() => field.update(next.id)}
            aria-label={`Passer au statut ${next.name}`}
            title={`Passer au statut ${next.name}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13px] text-foreground hover:bg-[var(--muted)] disabled:opacity-60"
          >
            <Dot color={next.color} />
            {next.name}
            <ArrowRight aria-hidden className="size-3.5" />
          </button>
        )}
      </div>
      {field.error && (
        <p role="alert" className="text-xs text-[var(--danger)]">
          {field.error}
        </p>
      )}
    </div>
  );
}

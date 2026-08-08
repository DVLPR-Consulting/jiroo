"use client";

import Link from "next/link";
import { DensityToggle } from "@/components/theme/density-toggle";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { cn } from "@/lib/utils";

const TABS = [
  ["backlog", "Backlog"],
  ["board", "Board"],
  ["list", "Liste"],
  ["tree", "Arbre"],
] as const;

export function ViewBar({
  view,
  backlogKey,
  groupControlSlot,
  viewActionsSlot,
  workflowSlot,
  newItemSlot,
}: {
  view: string;
  backlogKey?: string;
  /** Rendered right after the tabs group, before saved-view actions. */
  groupControlSlot?: React.ReactNode;
  /** Rendered after grouping, before the ml-auto cluster. */
  viewActionsSlot?: React.ReactNode;
  /** Backlog workflow management, shown only when the caller authorizes it. */
  workflowSlot?: React.ReactNode;
  newItemSlot?: React.ReactNode;
}) {
  const viewUrl = useViewUrlState();

  return (
    <div className="flex min-h-[46px] flex-wrap items-center gap-3 border-b border-border px-4 py-2">
      <div className="inline-flex shrink-0 rounded-md border border-border p-0.5">
        {TABS.map(([v, label]) => {
          const href = viewUrl.href((params) => params.set("view", v));
          const active = view === v;
          return (
            <Link
              key={v}
              href={href}
              onNavigate={(event) => {
                event.preventDefault();
                viewUrl.push((latest) => latest.set("view", v));
              }}
              className={cn(
                "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-[var(--accent-subtle)] text-[var(--accent-subtle-fg)]"
                  : "text-[var(--subtle-foreground)] hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
        {backlogKey ? (
          <>
            <Link
              href={`/b/${backlogKey}/releases`}
              className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-[var(--subtle-foreground)] transition-colors hover:text-foreground"
            >
              Releases
            </Link>
            <Link
              href={`/b/${backlogKey}/reports`}
              className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-[var(--subtle-foreground)] transition-colors hover:text-foreground"
            >
              Rapports
            </Link>
          </>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {groupControlSlot}
        {viewActionsSlot}
      </div>
      <div
        data-slot="primary-actions"
        className="ml-auto flex shrink-0 items-center gap-3"
      >
        {workflowSlot}
        <DensityToggle />
        {newItemSlot}
      </div>
    </div>
  );
}

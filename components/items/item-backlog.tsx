"use client";

import Link from "next/link";
import { Inbox, SearchX } from "lucide-react";
import { KindIcon } from "@/components/icons/kind-icon";
import { PrioIcon } from "@/components/icons/prio-icon";
import { TypeIcon } from "@/components/icons/type-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import { InlineEstimate } from "@/components/items/inline-item-field";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  type ItemKind,
  type Priority,
} from "@/lib/design/constants";

type StatusOption = {
  id: string;
  name: string;
  color: string;
  category: "todo" | "in_progress" | "done";
  order: number;
};

type UserOption = { id: string; name: string };

export type BacklogItem = {
  id: string;
  key: string;
  title: string;
  type: "tache";
  kind: ItemKind;
  statusId: string;
  priority: number;
  estimatePoints: number | null;
  assigneeId: string | null;
  assigneeName: string | null;
  rank: string;
  blocked: boolean;
};

type BacklogGroup = {
  key: string;
  label: string;
  items: BacklogItem[];
};

const HEADER_CLASS =
  "border-b border-border bg-[var(--surface-2)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const CELL_CLASS = "border-b border-border px-3 py-1.5 text-sm";

const pointFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
});

function asPriority(value: number): Priority {
  return PRIORITIES.includes(value as Priority) ? (value as Priority) : 0;
}

function BacklogRow({
  item,
  statuses,
  users,
  backlogKey,
  selectedKey,
  canWrite,
}: {
  item: BacklogItem;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  selectedKey?: string;
  canWrite: boolean;
}) {
  const viewUrl = useViewUrlState();
  const status = statuses.find((option) => option.id === item.statusId);
  const priority = asPriority(item.priority);
  const assigneeName =
    item.assigneeName ??
    users.find((user) => user.id === item.assigneeId)?.name ??
    "Non assigné";

  function openItem() {
    viewUrl.push((params) => params.set("item", item.key));
  }

  return (
    <tr
      tabIndex={0}
      aria-label={`${item.key} — ${item.title}`}
      onClick={openItem}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openItem();
        }
      }}
      className={`cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] ${
        selectedKey === item.key ? "bg-[var(--accent-subtle)]" : ""
      }`}
      style={{ height: "var(--row-h)" }}
    >
      <td className={`${CELL_CLASS} whitespace-nowrap`}>
        <span className="inline-flex items-center gap-1.5">
          <TypeIcon type={item.type} />
          <ItemKey value={item.key} />
        </span>
      </td>
      <td className={`${CELL_CLASS} min-w-0`}>
        <span className="flex min-w-0 items-center gap-1.5">
          <KindIcon kind={item.kind} />
          <span className="truncate font-medium">{item.title}</span>
          {item.blocked ? (
            <span
              className="inline-flex flex-none items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{
                color: "var(--danger)",
                background:
                  "color-mix(in oklch, var(--danger) 14%, transparent)",
              }}
            >
              bloqué
            </span>
          ) : null}
        </span>
      </td>
      <td className={CELL_CLASS}>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: status?.color ?? "var(--muted-foreground)" }}
          />
          <span className="truncate">{status?.name ?? item.statusId}</span>
        </span>
      </td>
      <td className={CELL_CLASS}>
        <span className="inline-flex items-center gap-1.5">
          <PrioIcon priority={priority} />
          <span>{PRIORITY_LABELS[priority]}</span>
        </span>
      </td>
      <td
        className={CELL_CLASS}
        onClick={(event) => event.stopPropagation()}
      >
        <InlineEstimate
          itemId={item.id}
          backlogKey={backlogKey}
          estimatePoints={item.estimatePoints}
          readOnly={!canWrite}
        />
      </td>
      <td className={CELL_CLASS}>
        <span className="truncate">{assigneeName}</span>
      </td>
    </tr>
  );
}

export function ItemBacklog({
  groups,
  grouped,
  statuses,
  users,
  backlogKey,
  selectedKey,
  filtersActive = false,
  hasItems,
  clearFiltersHref,
  canWrite = true,
}: {
  groups: BacklogGroup[];
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  selectedKey?: string;
  filtersActive?: boolean;
  hasItems?: boolean;
  clearFiltersHref?: string;
  canWrite?: boolean;
}) {
  const visibleItems = groups.flatMap((group) => group.items);
  const totalPoints = visibleItems.reduce(
    (total, item) => total + (item.estimatePoints ?? 0),
    0,
  );
  const unestimatedCount = visibleItems.filter(
    (item) => item.estimatePoints === null,
  ).length;
  const showNoResults = filtersActive && (hasItems ?? visibleItems.length > 0);

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="backlog-heading">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <h2 id="backlog-heading" className="t-h2">
          Backlog
        </h2>
        <span className="text-xs text-muted-foreground">
          {visibleItems.length} {visibleItems.length === 1 ? "item" : "items"}
        </span>
        <span className="text-xs text-muted-foreground">
          {pointFormatter.format(totalPoints)} {totalPoints === 1 ? "point" : "points"}
        </span>
        <span className="text-xs text-muted-foreground">
          {unestimatedCount} non estimé{unestimatedCount > 1 ? "s" : ""}
        </span>
      </header>

      {visibleItems.length === 0 ? (
        <div className="grid flex-1 place-items-center p-10">
          <EmptyState
            icon={
              showNoResults ? (
                <SearchX className="size-5" />
              ) : (
                <Inbox className="size-5" />
              )
            }
            title={showNoResults ? "Aucun résultat" : "Backlog vide"}
            description={
              showNoResults
                ? "Aucune tâche du backlog ne correspond aux filtres actifs."
                : "Créez une tâche pour commencer à planifier ce backlog."
            }
            action={
              showNoResults && clearFiltersHref ? (
                <Link
                  href={clearFiltersHref}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Effacer les filtres
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-separate border-spacing-0">
            <colgroup>
              <col className="w-32" />
              <col />
              <col className="w-40" />
              <col className="w-28" />
              <col className="w-24" />
              <col className="w-44" />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr>
                <th scope="col" className={HEADER_CLASS}>Clé</th>
                <th scope="col" className={HEADER_CLASS}>Titre</th>
                <th scope="col" className={HEADER_CLASS}>Statut</th>
                <th scope="col" className={HEADER_CLASS}>Priorité</th>
                <th scope="col" className={HEADER_CLASS}>Points</th>
                <th scope="col" className={HEADER_CLASS}>Assigné</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.key || "backlog"}>
                {grouped ? (
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={6}
                      className="border-b border-border bg-[var(--surface-2)] px-3 py-2 text-left text-xs font-semibold"
                    >
                      {group.label} · {group.items.length}
                    </th>
                  </tr>
                ) : null}
                {group.items.map((item) => (
                  <BacklogRow
                    key={item.id}
                    item={item}
                    statuses={statuses}
                    users={users}
                    backlogKey={backlogKey}
                    selectedKey={selectedKey}
                    canWrite={canWrite}
                  />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
}

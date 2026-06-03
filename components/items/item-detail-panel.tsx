"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { TypeIcon } from "@/components/icons/type-icon";
import { PrioIcon } from "@/components/icons/prio-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActivityLog } from "@/components/items/detail/activity-log";
import {
  ITEM_TYPE_LABELS,
  PRIORITY_LABELS,
  type Priority,
} from "@/lib/design/constants";
import type {
  activities as activitiesTable,
  items as itemsTable,
  labels as labelsTable,
} from "@/lib/db/schema/domain";

type ItemRow = typeof itemsTable.$inferSelect;
type ActivityRow = typeof activitiesTable.$inferSelect;
type LabelRow = typeof labelsTable.$inferSelect;
type UserLite = { id: string; name: string; email: string };
type StatusLite = { id: string; name: string; color: string; category: string };

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dueFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

function asPriority(value: number): Priority {
  return Math.min(4, Math.max(0, value)) as Priority;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function ItemDetailPanel({
  detail,
  activities,
  itemLabelIds,
  backlogLabels,
  users,
  statuses,
  backlogKey,
}: {
  detail: ItemRow;
  activities: ActivityRow[];
  itemLabelIds: string[];
  backlogLabels: LabelRow[];
  users: UserLite[];
  statuses: StatusLite[];
  backlogKey: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"detail" | "activity">("detail");

  const close = () => router.push(`/b/${backlogKey}`);

  const userById = new Map(users.map((u) => [u.id, u]));
  const status = statuses.find((s) => s.id === detail.statusId);
  const assignee = detail.assigneeId ? userById.get(detail.assigneeId) : undefined;
  const reporter = detail.reporterId ? userById.get(detail.reporterId) : undefined;
  const labelSet = new Set(itemLabelIds);
  const itemLabels = backlogLabels.filter((l) => labelSet.has(l.id));

  return (
    <div
      className="fixed inset-0 z-50 flex animate-in fade-in-0 justify-end bg-black/30 duration-150"
      onClick={close}
    >
      <aside
        className="h-full w-[620px] max-w-[92vw] animate-in slide-in-from-right overflow-auto border-l border-border bg-[var(--surface)] shadow-lg duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <TypeIcon type={detail.type} />
          <ItemKey value={detail.key} />
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Actions"
                  className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-[var(--muted)]"
                >
                  …
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" />
            </DropdownMenu>
            <button
              type="button"
              aria-label="Fermer"
              onClick={close}
              className="rounded p-1 text-muted-foreground hover:bg-[var(--muted)]"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* Body: 2-column grid */}
        <div className="grid grid-cols-[1fr_220px]">
          {/* Main column */}
          <div className="flex min-w-0 flex-col gap-4 p-5">
            <h2 className="t-h1">{detail.title}</h2>

            <div className="flex gap-1 border-b border-border">
              <button
                type="button"
                onClick={() => setTab("detail")}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  tab === "detail"
                    ? "border-[var(--primary)] font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Détail
              </button>
              <button
                type="button"
                onClick={() => setTab("activity")}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  tab === "activity"
                    ? "border-[var(--primary)] font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Activité
              </button>
            </div>

            {tab === "detail" ? (
              detail.description ? (
                <pre className="t-sm whitespace-pre-wrap font-sans text-foreground">
                  {detail.description}
                </pre>
              ) : (
                <p className="t-sm text-muted-foreground">Aucune description</p>
              )
            ) : (
              <ActivityLog activities={activities} users={users} statuses={statuses} />
            )}
          </div>

          {/* Side column */}
          <div className="flex flex-col gap-4 border-l border-border bg-[var(--surface-2)] p-5">
            <Field label="Statut">
              {status ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: status.color }}
                    aria-hidden
                  />
                  {status.name}
                </span>
              ) : (
                "—"
              )}
            </Field>

            <Field label="Priorité">
              <span className="inline-flex items-center gap-1.5">
                <PrioIcon priority={asPriority(detail.priority)} />
                {PRIORITY_LABELS[asPriority(detail.priority)]}
              </span>
            </Field>

            <Field label="Assigné">{assignee?.name ?? "Non assigné"}</Field>

            <Field label="Rapporteur">{reporter?.name ?? "—"}</Field>

            <Field label="Labels">
              {itemLabels.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {itemLabels.map((l) => (
                    <span
                      key={l.id}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                      style={{ background: `${l.color}22`, color: l.color }}
                    >
                      {l.name}
                    </span>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </Field>

            <Field label="Échéance">
              {detail.dueDate ? dueFmt.format(new Date(detail.dueDate)) : "—"}
            </Field>

            <div className="mt-2 flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>{ITEM_TYPE_LABELS[detail.type]}</span>
              <span>Créé le {dateFmt.format(new Date(detail.createdAt))}</span>
              <span>Maj le {dateFmt.format(new Date(detail.updatedAt))}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

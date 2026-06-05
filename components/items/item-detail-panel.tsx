"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { TypeIcon } from "@/components/icons/type-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { softDeleteItemAction } from "@/app/actions/items";
import { ActivityLog } from "@/components/items/detail/activity-log";
import { CommentThread } from "@/components/items/detail/comment-thread";
import { EditableTitle } from "@/components/items/detail/editable-title";
import { DescriptionEditor } from "@/components/items/detail/description-editor";
import {
  StatusField,
  PriorityField,
  KindField,
  AssigneeField,
  DueDateField,
  LabelsField,
} from "@/components/items/detail/field-editors";
import { ITEM_TYPE_LABELS } from "@/lib/design/constants";
import type { ItemType } from "@/lib/design/constants";
import type { CommentRow } from "@/lib/services/comments";
import type { LinkWithOther } from "@/lib/services/links";
import type {
  activities as activitiesTable,
  items as itemsTable,
  labels as labelsTable,
} from "@/lib/db/schema/domain";
import { LinksSection } from "@/components/items/detail/links-section";

type ItemRow = typeof itemsTable.$inferSelect;
type ActivityRow = typeof activitiesTable.$inferSelect;
type LabelRow = typeof labelsTable.$inferSelect;
type UserLite = { id: string; name: string; email: string };
type StatusLite = { id: string; name: string; color: string; category: string };

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
  comments,
  currentUserId,
  itemLabelIds,
  backlogLabels,
  users,
  statuses,
  backlogKey,
  links,
  candidates,
}: {
  detail: ItemRow;
  activities: ActivityRow[];
  comments: CommentRow[];
  currentUserId: string;
  itemLabelIds: string[];
  backlogLabels: LabelRow[];
  users: UserLite[];
  statuses: StatusLite[];
  backlogKey: string;
  links: LinkWithOther[];
  candidates: { id: string; key: string; title: string; type: ItemType }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"detail" | "comments" | "activity">("detail");
  const [deleting, startDelete] = useTransition();

  const close = () => router.push(`/b/${backlogKey}`);

  const handleDelete = () => {
    if (!window.confirm("Supprimer cet item et ses sous-items ?")) return;
    startDelete(async () => {
      await softDeleteItemAction({ id: detail.id, backlogKey });
      router.push(`/b/${backlogKey}`);
    });
  };

  const userById = new Map(users.map((u) => [u.id, u]));
  const reporter = detail.reporterId ? userById.get(detail.reporterId) : undefined;

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
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={deleting}
                  onSelect={(e) => {
                    e.preventDefault();
                    handleDelete();
                  }}
                  className="text-[var(--danger)] focus:text-[var(--danger)]"
                >
                  <Trash2 className="size-4" />
                  {deleting ? "Suppression…" : "Supprimer l'item"}
                </DropdownMenuItem>
              </DropdownMenuContent>
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
            <EditableTitle itemId={detail.id} backlogKey={backlogKey} title={detail.title} />

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
                onClick={() => setTab("comments")}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  tab === "comments"
                    ? "border-[var(--primary)] font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Commentaires
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

            {tab === "detail" && (
              <DescriptionEditor
                itemId={detail.id}
                backlogKey={backlogKey}
                description={detail.description}
              />
            )}
            {tab === "comments" && (
              <CommentThread
                itemId={detail.id}
                backlogKey={backlogKey}
                comments={comments}
                users={users.map((u) => ({ id: u.id, name: u.name }))}
                currentUserId={currentUserId}
              />
            )}
            {tab === "activity" && (
              <ActivityLog activities={activities} users={users} statuses={statuses} />
            )}
          </div>

          {/* Side column */}
          <div className="flex flex-col gap-4 border-l border-border bg-[var(--surface-2)] p-5">
            <Field label="Statut">
              <StatusField
                itemId={detail.id}
                backlogKey={backlogKey}
                statusId={detail.statusId}
                statuses={statuses}
              />
            </Field>

            <Field label="Priorité">
              <PriorityField
                itemId={detail.id}
                backlogKey={backlogKey}
                priority={detail.priority}
              />
            </Field>

            <Field label="Nature">
              <KindField
                itemId={detail.id}
                backlogKey={backlogKey}
                kind={detail.kind}
              />
            </Field>

            <Field label="Assigné">
              <AssigneeField
                itemId={detail.id}
                backlogKey={backlogKey}
                assigneeId={detail.assigneeId}
                users={users}
              />
            </Field>

            <Field label="Rapporteur">{reporter?.name ?? "—"}</Field>

            <Field label="Labels">
              <LabelsField
                itemId={detail.id}
                backlogKey={backlogKey}
                backlogId={detail.backlogId}
                itemLabelIds={itemLabelIds}
                backlogLabels={backlogLabels}
              />
            </Field>

            <Field label="Échéance">
              <DueDateField
                itemId={detail.id}
                backlogKey={backlogKey}
                dueDate={detail.dueDate}
              />
            </Field>

            <Field label="Liens">
              <LinksSection
                itemId={detail.id}
                backlogKey={backlogKey}
                links={links}
                candidates={candidates}
              />
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

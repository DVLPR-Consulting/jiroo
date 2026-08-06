"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Trash2, X } from "lucide-react";
import { TypeIcon } from "@/components/icons/type-icon";
import { PrioIcon } from "@/components/icons/prio-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import { LabelPill } from "@/components/items/label-pill";
import { useViewUrlState } from "@/components/shell/view-url-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  reparentItemAction,
  restoreItemAction,
  softDeleteItemAction,
} from "@/app/actions/items";
import { moveSprintItemAction } from "@/app/actions/sprints";
import { ActivityLog } from "@/components/items/detail/activity-log";
import { CommentThread } from "@/components/items/detail/comment-thread";
import { EditableTitle } from "@/components/items/detail/editable-title";
import { DescriptionEditor } from "@/components/items/detail/description-editor";
import {
  StatusField,
  PriorityField,
  EstimateField,
  KindField,
  AssigneeField,
  ReporterField,
  DueDateField,
  LabelsField,
} from "@/components/items/detail/field-editors";
import {
  ITEM_KIND_LABELS,
  ITEM_TYPE_LABELS,
  PRIORITY_LABELS,
  type ItemType,
  type Priority,
} from "@/lib/design/constants";
import type { CommentRow } from "@/lib/services/comments";
import type { LinkWithOther } from "@/lib/services/links";
import type {
  activities as activitiesTable,
  items as itemsTable,
  labels as labelsTable,
} from "@/lib/db/schema/domain";
import { LinksSection } from "@/components/items/detail/links-section";
import { DevRefsSection } from "@/components/items/detail/dev-refs-section";
import { toast } from "@/lib/toast";
import type { ItemCapabilities, PlanningCapabilities } from "@/lib/auth/capabilities";

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
  refs,
  parent,
  sprints = [],
  sprintId = null,
  canEditItems = true,
  canTransitionItems = true,
  canAssignItems = true,
  itemCapabilities,
  planningCapabilities,
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
  refs: { id: string; url: string; kind: string; createdAt: Date | string }[];
  parent?: { key: string; title: string };
  sprints?: { id: string; name: string }[];
  sprintId?: string | null;
  canEditItems?: boolean;
  canTransitionItems?: boolean;
  canAssignItems?: boolean;
  itemCapabilities?: ItemCapabilities;
  planningCapabilities?: PlanningCapabilities;
}) {
  const canEdit = itemCapabilities?.edit ?? canEditItems;
  const canTransition = itemCapabilities?.transition ?? (canEditItems && canTransitionItems);
  const canAssign = itemCapabilities?.assign ?? (canEditItems && canAssignItems);
  const canDelete = itemCapabilities?.delete ?? canEditItems;
  const canRestore = itemCapabilities?.restore ?? canEditItems;
  const canLink = itemCapabilities?.link ?? canEditItems;
  const router = useRouter();
  const viewUrl = useViewUrlState();
  const [open, setOpen] = useState(true);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
      ? document.activeElement
      : null,
  );
  const [tab, setTab] = useState<"detail" | "comments" | "activity">("detail");
  const [deleting, startDelete] = useTransition();
  const [planningPending, startPlanning] = useTransition();
  const [selectedParentId, setSelectedParentId] = useState(detail.parentId);
  const [selectedSprintId, setSelectedSprintId] = useState(sprintId);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const status = statuses.find((option) => option.id === detail.statusId);
  const priority = Math.min(4, Math.max(0, detail.priority)) as Priority;
  const assignee = users.find((option) => option.id === detail.assigneeId);
  const reporter = users.find((option) => option.id === detail.reporterId);
  const selectedLabelIds = new Set(itemLabelIds);
  const selectedLabels = backlogLabels.filter((label) => selectedLabelIds.has(label.id));
  const parentType: Partial<Record<ItemType, ItemType>> = {
    epic: "composant",
    tache: "epic",
    soustache: "tache",
  };
  const parentCandidates = candidates.filter(
    (candidate) => candidate.type === parentType[detail.type],
  );
  const selectedSprint = sprints.find((sprint) => sprint.id === selectedSprintId);

  const close = () => viewUrl.push((params) => params.delete("item"));

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Lien copié.");
    } catch {
      toast.error("Impossible de copier le lien.");
    }
  };

  const handleDelete = () => {
    if (!window.confirm("Supprimer cet item et ses sous-items ?")) return;
    startDelete(async () => {
      const result = await softDeleteItemAction({ id: detail.id, backlogKey });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      viewUrl.push((params) => params.delete("item"));
      toast.success("Item supprimé.", canRestore ? {
        action: {
          label: "Annuler",
          run: async () => {
            const undoResult = await restoreItemAction({ id: detail.id, backlogKey });
            if (!undoResult.ok) throw new Error(undoResult.error);
            router.refresh();
          },
        },
      } : undefined);
    });
  };

  const handleParentChange = (newParentId: string | null) => {
    const previousParentId = selectedParentId;
    setSelectedParentId(newParentId);
    setPlanningError(null);
    startPlanning(async () => {
      try {
        const result = await reparentItemAction({
          backlogKey,
          id: detail.id,
          newParentId,
        });
        if (!result.ok) {
          setSelectedParentId(previousParentId);
          setPlanningError(result.error);
          toast.error(result.error);
          return;
        }
        router.refresh();
      } catch {
        const error = "Impossible de modifier la planification.";
        setSelectedParentId(previousParentId);
        setPlanningError(error);
        toast.error(error);
      }
    });
  };

  const handleSprintChange = (newSprintId: string | null) => {
    const previousSprintId = selectedSprintId;
    setSelectedSprintId(newSprintId);
    setPlanningError(null);
    startPlanning(async () => {
      try {
        const result = await moveSprintItemAction({
          backlogKey,
          backlogId: detail.backlogId,
          itemId: detail.id,
          sprintId: newSprintId,
          beforeId: null,
          afterId: null,
        });
        if (!result.ok) {
          setSelectedSprintId(previousSprintId);
          setPlanningError(result.error);
          toast.error(result.error);
          return;
        }
        router.refresh();
      } catch {
        const error = "Impossible de modifier la planification.";
        setSelectedSprintId(previousSprintId);
        setPlanningError(error);
        toast.error(error);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) close();
      }}
    >
      <DialogContent
        variant="sheet-right"
        showCloseButton={false}
        aria-describedby={undefined}
        className="bg-[var(--surface)] shadow-lg"
        onCloseAutoFocus={(event) => {
          const returnTarget = returnFocusRef.current;
          if (returnTarget?.isConnected) {
            event.preventDefault();
            returnTarget.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.matches('[aria-label="Titre de l’item"]')
          ) {
            event.preventDefault();
          }
        }}
      >
        <DialogTitle className="sr-only">
          {detail.key} — {detail.title}
        </DialogTitle>
        {/* Header */}
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <TypeIcon type={detail.type} />
          <nav
            aria-label="Fil d’Ariane"
            className="flex min-w-0 items-center gap-1.5 text-sm"
          >
            {parent && (
              <>
                <span className="truncate" title={parent.title}>
                  <ItemKey value={parent.key} />
                </span>
                <span className="text-muted-foreground" aria-hidden>
                  {" / "}
                </span>
              </>
            )}
            <ItemKey value={detail.key} />
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-[var(--muted)]"
            >
              <Copy className="size-4" aria-hidden />
              Copier le lien
            </button>
            {canDelete && (
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
            )}
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Fermer"
                className="rounded p-1 text-muted-foreground hover:bg-[var(--muted)]"
              >
                <X className="size-4" />
              </button>
            </DialogClose>
          </div>
        </header>

        {/* Body: 2-column grid */}
        <div
          data-testid="item-detail-grid"
          className="grid grid-cols-1 md:grid-cols-[1fr_220px]"
        >
          {/* Main column */}
          <div className="flex min-w-0 flex-col gap-4 p-5">
            <EditableTitle
              itemId={detail.id}
              itemKey={detail.key}
              backlogKey={backlogKey}
              title={detail.title}
              readOnly={!canEdit}
            />

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
                readOnly={!canEdit}
              />
            )}
            {tab === "comments" && (
              <CommentThread
                itemId={detail.id}
                backlogKey={backlogKey}
                comments={comments}
                users={users.map((u) => ({ id: u.id, name: u.name }))}
                currentUserId={currentUserId}
                capabilities={{
                  add: itemCapabilities?.addComments ?? canEditItems,
                  editOwn: itemCapabilities?.editOwnComments ?? canEditItems,
                  deleteOwn: itemCapabilities?.deleteOwnComments ?? canEditItems,
                  deleteAll: itemCapabilities?.deleteAllComments ?? canEditItems,
                }}
              />
            )}
            {tab === "activity" && (
              <ActivityLog activities={activities} users={users} statuses={statuses} />
            )}
          </div>

          {/* Side column */}
          <div className="flex flex-col gap-4 border-t border-border bg-[var(--surface-2)] p-5 md:border-t-0 md:border-l">
            <Field label="Statut">
              {canTransition ? (
                <StatusField
                  itemId={detail.id}
                  backlogKey={backlogKey}
                  statusId={detail.statusId}
                  statuses={statuses}
                />
              ) : (
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: status?.color ?? "var(--border-strong)" }}
                  />
                  {status?.name ?? detail.statusId}
                </span>
              )}
            </Field>

            <Field label="Priorité">
              {canEdit ? (
                <PriorityField
                  itemId={detail.id}
                  backlogKey={backlogKey}
                  priority={detail.priority}
                />
              ) : (
                <span className="inline-flex items-center gap-2">
                  <PrioIcon priority={priority} />
                  {PRIORITY_LABELS[priority]}
                </span>
              )}
            </Field>

            {detail.type === "tache" && (
              <Field label="Points">
                {canEdit ? (
                  <EstimateField
                    itemId={detail.id}
                    backlogKey={backlogKey}
                    estimatePoints={detail.estimatePoints}
                  />
                ) : detail.estimatePoints === null ? (
                  "Non estimé"
                ) : (
                  `${detail.estimatePoints} pts`
                )}
              </Field>
            )}

            <Field label="Nature">
              {canEdit ? (
                <KindField
                  itemId={detail.id}
                  backlogKey={backlogKey}
                  kind={detail.kind}
                />
              ) : ITEM_KIND_LABELS[detail.kind]}
            </Field>

            {detail.type !== "composant" && (
              <Field label="Parent">
                {planningCapabilities?.reparent ? (
                  <select
                    aria-label="Parent"
                    aria-busy={planningPending}
                    disabled={planningPending}
                    value={selectedParentId ?? ""}
                    onChange={(event) => handleParentChange(event.target.value || null)}
                    className="w-full rounded border border-border bg-[var(--surface)] px-2 py-1 text-sm"
                  >
                    <option value="">Aucun parent</option>
                    {parentCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.key} — {candidate.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  parentCandidates.find((candidate) => candidate.id === selectedParentId)?.title ??
                  parent?.title ??
                  "Aucun parent"
                )}
              </Field>
            )}

            {detail.type === "tache" && (
              <Field label="Sprint">
                {planningCapabilities?.assignSprint ? (
                  <select
                    aria-label="Sprint"
                    aria-busy={planningPending}
                    disabled={planningPending}
                    value={selectedSprintId ?? ""}
                    onChange={(event) => handleSprintChange(event.target.value || null)}
                    className="w-full rounded border border-border bg-[var(--surface)] px-2 py-1 text-sm"
                  >
                    <option value="">Backlog</option>
                    {sprints.map((sprint) => (
                      <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
                    ))}
                  </select>
                ) : selectedSprint?.name ?? "Backlog"}
              </Field>
            )}

            {planningError && (
              <p role="alert" className="text-xs text-destructive">{planningError}</p>
            )}

            <Field label="Assigné">
              {canAssign ? (
                <AssigneeField
                  itemId={detail.id}
                  backlogKey={backlogKey}
                  assigneeId={detail.assigneeId}
                  users={users}
                />
              ) : assignee?.name ?? "Non assigné"}
            </Field>

            <Field label="Rapporteur">
              {canEdit ? (
                <ReporterField
                  itemId={detail.id}
                  backlogKey={backlogKey}
                  reporterId={detail.reporterId}
                  users={users}
                />
              ) : reporter?.name ?? "—"}
            </Field>

            <Field label="Labels">
              {canEdit ? (
                <LabelsField
                  itemId={detail.id}
                  backlogKey={backlogKey}
                  backlogId={detail.backlogId}
                  itemLabelIds={itemLabelIds}
                  backlogLabels={backlogLabels}
                />
              ) : selectedLabels.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {selectedLabels.map((label) => (
                    <LabelPill key={label.id} name={label.name} color={label.color} />
                  ))}
                </span>
              ) : (
                "Aucun label"
              )}
            </Field>

            <Field label="Échéance">
              {canEdit ? (
                <DueDateField
                  itemId={detail.id}
                  backlogKey={backlogKey}
                  dueDate={detail.dueDate}
                />
              ) : detail.dueDate ? (
                dateFmt.format(new Date(detail.dueDate))
              ) : (
                "—"
              )}
            </Field>

            <Field label="Liens">
              <LinksSection
                itemId={detail.id}
                backlogKey={backlogKey}
                links={links}
                candidates={candidates}
                canLink={canLink}
              />
            </Field>

            <Field label="Développement">
              <DevRefsSection
                itemId={detail.id}
                backlogKey={backlogKey}
                refs={refs}
                canLink={canLink}
              />
            </Field>

            <div className="mt-2 flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>{ITEM_TYPE_LABELS[detail.type]}</span>
              <span>Créé le {dateFmt.format(new Date(detail.createdAt))}</span>
              <span>Maj le {dateFmt.format(new Date(detail.updatedAt))}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

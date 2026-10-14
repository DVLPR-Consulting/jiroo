"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  GitBranch,
  Link2,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { TypeIcon } from "@/components/icons/type-icon";
import { ItemRow } from "@/components/items/item-row";
import { PrioIcon } from "@/components/icons/prio-icon";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { LabelPill } from "@/components/items/label-pill";
import {
  FixVersionPicker,
  type FixVersionOption,
} from "@/components/items/fix-version-picker";
import { NewItemButton, type NewItemButtonProps } from "@/components/items/new-item-dialog";
import type { Filters } from "@/lib/items/filter";
import { useOptimisticFieldUpdate } from "@/components/items/detail/use-optimistic-field-update";
import { useListNeighbors } from "@/components/items/detail/use-list-neighbors";
import { useViewUrlState } from "@/components/shell/view-url-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DialogClose, DialogTitle } from "@/components/ui/dialog";
import {
  reparentItemAction,
  restoreItemAction,
  softDeleteItemAction,
} from "@/app/actions/items";
import { moveSprintItemAction } from "@/app/actions/sprints";
import { ActivityFeed } from "@/components/items/detail/activity-feed";
import { CollapsiblePanel } from "@/components/items/detail/collapsible-panel";
import { DetailField } from "@/components/items/detail/detail-field";
import { EditableTitle } from "@/components/items/detail/editable-title";
import { DescriptionEditor } from "@/components/items/detail/description-editor";
import { StatusActions } from "@/components/items/detail/status-actions";
import {
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
  PRIORITY_LABELS,
  type ItemType,
  type Priority,
} from "@/lib/design/constants";
import type { ActivityFilter } from "@/lib/items/activity-feed";
import type { HistoryLookup } from "@/lib/items/activity-history";
import { itemBranchName } from "@/lib/items/branch-name";
import type { CommentRow } from "@/lib/services/comments";
import type { LinkWithOther } from "@/lib/services/links";
import type {
  activities as activitiesTable,
  items as itemsTable,
  labels as labelsTable,
} from "@/lib/db/schema/domain";
import { LinksSection } from "@/components/items/detail/links-section";
import { DevRefsSection } from "@/components/items/detail/dev-refs-section";
import type { DevRef } from "@/lib/items/dev-refs";
import { toast } from "@/lib/toast";
import { useShortcutHandler } from "@/components/shortcuts/keyboard-shortcuts-provider";
import type {
  ItemCapabilities,
  PlanningCapabilities,
  ReleaseCapabilities,
} from "@/lib/auth/capabilities";
import { pointsLabel } from "@/lib/format/plural";
import { cn } from "@/lib/utils";

type ItemRow = typeof itemsTable.$inferSelect;
type ActivityRow = typeof activitiesTable.$inferSelect;
const EMPTY_FIX_VERSIONS: FixVersionOption[] = [];
const EMPTY_CHILDREN: ChildItem[] = [];
type LabelRow = typeof labelsTable.$inferSelect;
type UserLite = { id: string; name: string };
type StatusLite = { id: string; name: string; color: string; category: string; order?: number };
type ChildItem = { id: string; key: string; title: string; type: ItemType; statusId: string };

function statusCategory(value: string): "todo" | "in_progress" | "done" | null {
  return value === "todo" || value === "in_progress" || value === "done" ? value : null;
}

/** Data the « Nouvel item » dialog needs, shared with the views. */
export type DetailCreateDialog = Pick<
  NewItemButtonProps,
  "backlogId" | "items" | "statuses" | "canScheduleItems" | "releaseOptions" | "fieldOptions"
>;

/** The hierarchy one level down (lib/tree/hierarchy.ts), with Jira-like wording. */
const CHILD_OF: Partial<
  Record<ItemType, { type: ItemType; section: string; create: string; label: string }>
> = {
  composant: { type: "epic", section: "Epics", create: "Créer un epic", label: "Epic" },
  epic: { type: "tache", section: "Tâches", create: "Créer une tâche", label: "Tâche" },
  tache: { type: "soustache", section: "Sous-tâches", create: "Créer une sous-tâche", label: "Sous-tâche" },
};

const PARENT_TYPE: Partial<Record<ItemType, ItemType>> = {
  epic: "composant",
  tache: "epic",
  soustache: "tache",
};

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dueDateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" });

const ICON_BUTTON =
  "flex size-8 items-center justify-center rounded-[var(--radius)] text-muted-foreground outline-none hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-40";
const ACTION_BUTTON =
  "flex h-8 items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13px] text-foreground outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
const DASHED_BUTTON =
  "flex h-10 w-full items-center rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3.5 text-left text-[13.5px] text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground";
const SELECT =
  "w-full rounded-[var(--radius)] border border-border bg-[var(--surface)] px-2 py-1 text-sm";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

async function copyText(text: string, success: string, failure: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error(failure);
  }
}

/** Detail header and body; rendered inside `ItemDetailSheet`, which owns the dialog. */
export function ItemDetailPanel({
  detail,
  activities,
  comments,
  currentUserId,
  itemLabelIds,
  backlogLabels,
  users,
  assigneeCandidates,
  reporterCandidates,
  statuses,
  backlogKey,
  links,
  candidates,
  refs,
  parent,
  childItems = EMPTY_CHILDREN,
  createDialog,
  sprints = [],
  sprintId = null,
  canEditItems = true,
  canTransitionItems = true,
  canAssignItems = true,
  itemCapabilities,
  planningCapabilities,
  releaseCapabilities,
  fixVersions = EMPTY_FIX_VERSIONS,
  releaseOptions = EMPTY_FIX_VERSIONS,
  viewFilters,
}: {
  detail: ItemRow;
  activities: ActivityRow[];
  comments: CommentRow[];
  currentUserId: string;
  itemLabelIds: string[];
  backlogLabels: LabelRow[];
  users: UserLite[];
  assigneeCandidates: UserLite[];
  reporterCandidates: UserLite[];
  statuses: StatusLite[];
  backlogKey: string;
  links: LinkWithOther[];
  candidates: { id: string; key: string; title: string; type: ItemType }[];
  refs: DevRef[];
  parent?: { key: string; title: string; type?: ItemType };
  childItems?: ChildItem[];
  createDialog?: DetailCreateDialog;
  sprints?: { id: string; name: string }[];
  sprintId?: string | null;
  canEditItems?: boolean;
  canTransitionItems?: boolean;
  canAssignItems?: boolean;
  itemCapabilities?: ItemCapabilities;
  planningCapabilities?: PlanningCapabilities;
  releaseCapabilities?: ReleaseCapabilities;
  fixVersions?: FixVersionOption[];
  releaseOptions?: FixVersionOption[];
  /** The filters of the view behind the drawer (JIR-92), for child creation's message. */
  viewFilters?: Filters;
}) {
  const canEdit = itemCapabilities?.edit ?? canEditItems;
  const canTransition = itemCapabilities?.transition ?? (canEditItems && canTransitionItems);
  const canAssign = itemCapabilities?.assign ?? (canEditItems && canAssignItems);
  const canDelete = itemCapabilities?.delete ?? canEditItems;
  const canRestore = itemCapabilities?.restore ?? canEditItems;
  const canLink = itemCapabilities?.link ?? canEditItems;
  const canComment = itemCapabilities?.addComments ?? canEditItems;
  const canCreateChild =
    (itemCapabilities?.create ?? false) &&
    createDialog !== undefined &&
    createDialog.canScheduleItems !== false;
  const router = useRouter();
  const viewUrl = useViewUrlState();
  const mainRef = useRef<HTMLDivElement>(null);

  // ---- Activity and « m » (Jira: add a comment) -------------------------
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  useShortcutHandler(
    "item.comment",
    canComment &&
      (() => {
        if (activityFilter === "history") setActivityFilter("comments");
        setComposerFocusRequest((request) => request + 1);
      }),
  );
  useEffect(() => {
    if (composerFocusRequest === 0) return;
    // The rich-text composer is lazy-loaded: retry for a short while until
    // its editable surface (or the raw Markdown textarea) is mounted.
    const selector =
      '[contenteditable="true"][aria-label="Nouveau commentaire"], textarea[aria-label="Nouveau commentaire"]';
    let frame = 0;
    const startedAt = Date.now();
    const tryFocus = () => {
      const composer = mainRef.current?.querySelector<HTMLElement>(selector);
      if (composer) {
        composer.focus();
        composer.scrollIntoView?.({ block: "nearest" });
      } else if (Date.now() - startedAt < 3000) frame = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(frame);
  }, [composerFocusRequest]);

  // ---- Previous / next item of the view (K / J) --------------------------
  const neighbors = useListNeighbors(detail.key);
  const openItem = (key: string) => viewUrl.push((params) => params.set("item", key));
  useShortcutHandler("item.previous", neighbors.previous !== null && (() => openItem(neighbors.previous!)));
  useShortcutHandler("item.next", neighbors.next !== null && (() => openItem(neighbors.next!)));

  // ---- Links « Lier un item » --------------------------------------------
  const [linkRequest, setLinkRequest] = useState(0);
  const linksRef = useRef<HTMLDivElement>(null);

  const [deleting, startDelete] = useTransition();
  const [planningPending, startPlanning] = useTransition();
  const [selectedParentId, setSelectedParentId] = useState(detail.parentId);
  const [selectedSprintId, setSelectedSprintId] = useState(sprintId);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const priority = Math.min(4, Math.max(0, detail.priority)) as Priority;
  const reporter = users.find((option) => option.id === detail.reporterId);
  const selectedLabelIds = new Set(itemLabelIds);
  const selectedLabels = backlogLabels.filter((label) => selectedLabelIds.has(label.id));
  const parentCandidates = candidates.filter(
    (candidate) => candidate.type === PARENT_TYPE[detail.type],
  );
  const selectedParent = candidates.find((candidate) => candidate.id === selectedParentId);
  const selectedSprint = sprints.find((sprint) => sprint.id === selectedSprintId);
  const statusOptions = useMemo(
    () => statuses.map((status, index) => ({ ...status, order: status.order ?? index })),
    [statuses],
  );
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const child = CHILD_OF[detail.type];
  const branchName = itemBranchName(detail.key, detail.title);

  // « M'assigner » and « i » share the assignee's optimistic value.
  const assigneeField = useOptimisticFieldUpdate({
    value: detail.assigneeId,
    itemId: detail.id,
    backlogKey,
    toPatch: (next) => ({ assigneeId: next }),
  });
  const assignee =
    users.find((option) => option.id === assigneeField.value) ??
    assigneeCandidates.find((option) => option.id === assigneeField.value);
  const canAssignToMe =
    canAssign &&
    assigneeCandidates.some((candidate) => candidate.id === currentUserId) &&
    assigneeField.value !== currentUserId;
  const assignToMe = () => {
    if (!assigneeField.pending) assigneeField.update(currentUserId);
  };
  useShortcutHandler("item.assignToMe", canAssignToMe && assignToMe);

  const fixVersionIds = useMemo(
    () => fixVersions.map((version) => version.id),
    [fixVersions],
  );
  const fixVersionField = useOptimisticFieldUpdate({
    value: fixVersionIds,
    itemId: detail.id,
    backlogKey,
    toPatch: (next) => ({ fixVersionIds: next }),
    onSuccess: () => toast.success("Fix versions mises à jour."),
  });
  // The backlog's version options carry the manual order and fresh metadata;
  // assigned versions missing from them (e.g. archived) are appended for display.
  const fixVersionOptions = useMemo(() => {
    const known = new Set(releaseOptions.map((version) => version.id));
    return [...releaseOptions, ...fixVersions.filter((version) => !known.has(version.id))];
  }, [fixVersions, releaseOptions]);

  const historyLookup = useMemo<HistoryLookup>(() => {
    const statusName = new Map(statuses.map((status) => [status.id, status.name]));
    const userName = new Map(users.map((user) => [user.id, user.name]));
    const labelName = new Map(backlogLabels.map((label) => [label.id, label.name]));
    const itemKey = new Map(candidates.map((candidate) => [candidate.id, candidate.key]));
    return {
      status: (id) => statusName.get(id),
      user: (id) => userName.get(id),
      label: (id) => labelName.get(id),
      item: (id) => itemKey.get(id),
    };
  }, [backlogLabels, candidates, statuses, users]);

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

  const requestLink = () => {
    setLinkRequest((request) => request + 1);
    linksRef.current?.scrollIntoView?.({ block: "nearest" });
  };

  // The opened item is the child's parent: make sure it is a candidate even
  // when the view's filter (e.g. a Fix version) left it out of the list.
  const childDialogItems = useMemo(() => {
    const dialogItems = createDialog?.items ?? [];
    return dialogItems.some((item) => item.id === detail.id)
      ? dialogItems
      : [...dialogItems, { id: detail.id, key: detail.key, type: detail.type, title: detail.title }];
  }, [createDialog?.items, detail.id, detail.key, detail.title, detail.type]);

  const createChildButton = (trigger: React.ReactNode) =>
    child && createDialog ? (
      <NewItemButton
        backlogKey={backlogKey}
        {...createDialog}
        items={childDialogItems}
        initialType={child.type}
        initialParentId={detail.id}
        viewFilters={viewFilters}
        trigger={trigger}
      />
    ) : null;

  const itemLinkProps = (key: string) => ({
    href: viewUrl.href((params) => params.set("item", key)),
    onNavigate: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      openItem(key);
    },
  });

  return (
    <>
      <DialogTitle className="sr-only">
        {detail.key} — {detail.title}
      </DialogTitle>
      {/* Header (56 px): typed breadcrumb, then the item actions. */}
      <header className="flex h-14 flex-none items-center justify-between gap-3 border-b border-border pr-3 pl-4 sm:pl-6">
        <nav
          aria-label="Fil d’Ariane"
          className="flex min-w-0 items-center gap-2 font-mono text-[12.5px]"
        >
          {parent && (
            <>
              <Link
                {...itemLinkProps(parent.key)}
                title={parent.title}
                className="flex flex-none items-center gap-1.5 whitespace-nowrap text-muted-foreground hover:text-foreground hover:underline"
              >
                {parent.type && <TypeIcon type={parent.type} />}
                {parent.key}
              </Link>
              <span className="text-[var(--subtle-foreground)]" aria-hidden>
                /
              </span>
            </>
          )}
          <span className="flex min-w-0 items-center gap-1.5 font-semibold whitespace-nowrap text-foreground">
            <TypeIcon type={detail.type} />
            {detail.key}
          </span>
        </nav>
        <div className="flex flex-none items-center gap-0.5">
          <button
            type="button"
            aria-label="Copier le lien"
            title="Copier le lien"
            onClick={() =>
              copyText(window.location.href, "Lien copié.", "Impossible de copier le lien.")
            }
            className={ICON_BUTTON}
          >
            <Link2 className="size-4" aria-hidden />
          </button>
          {canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Plus d’actions" title="Plus d’actions" className={ICON_BUTTON}>
                  <MoreHorizontal className="size-4" aria-hidden />
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
          {neighbors.inList && (
            <>
              <span aria-hidden className="mx-1.5 h-5 w-px bg-border" />
              <button
                type="button"
                aria-label="Item précédent (K)"
                title="Item précédent (K)"
                disabled={neighbors.previous === null}
                onClick={() => neighbors.previous && openItem(neighbors.previous)}
                className={ICON_BUTTON}
              >
                <ChevronUp className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Item suivant (J)"
                title="Item suivant (J)"
                disabled={neighbors.next === null}
                onClick={() => neighbors.next && openItem(neighbors.next)}
                className={ICON_BUTTON}
              >
                <ChevronDown className="size-4" aria-hidden />
              </button>
            </>
          )}
          <DialogClose asChild>
            <button type="button" aria-label="Fermer (Échap)" title="Fermer (Échap)" className={ICON_BUTTON}>
              <X className="size-4" aria-hidden />
            </button>
          </DialogClose>
        </div>
      </header>

      {/* Body: the side column stacks under the main one until the drawer is
          about 900 px wide; side by side, each column scrolls on its own. */}
      <div className="@container flex min-h-0 flex-1 flex-col">
        <div
          data-testid="item-detail-grid"
          className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto @min-[900px]:grid-cols-[minmax(0,1fr)_340px] @min-[900px]:grid-rows-1 @min-[900px]:overflow-hidden"
        >
          {/* Main column */}
          <div
            ref={mainRef}
            data-testid="item-detail-main"
            className="flex min-w-0 flex-col gap-7 px-4 pt-6 pb-8 sm:px-8 @min-[900px]:overflow-y-auto"
          >
            <div className="flex flex-col gap-3.5">
              <EditableTitle
                itemId={detail.id}
                itemKey={detail.key}
                backlogKey={backlogKey}
                title={detail.title}
                readOnly={!canEdit}
              />
              {((canCreateChild && child) || canLink) && (
                <div className="flex flex-wrap gap-2 px-2">
                  {canCreateChild && child &&
                    createChildButton(
                      <button type="button" aria-label={child.create} className={ACTION_BUTTON}>
                        <Plus className="size-4" aria-hidden />
                        {child.label}
                      </button>,
                    )}
                  {canLink && (
                    <button type="button" onClick={requestLink} className={ACTION_BUTTON}>
                      <Link2 className="size-4" aria-hidden />
                      Lier un item
                    </button>
                  )}
                </div>
              )}
            </div>

            <Section title="Description">
              <DescriptionEditor
                key={`${currentUserId}:${detail.id}`}
                itemId={detail.id}
                currentUserId={currentUserId}
                backlogKey={backlogKey}
                description={detail.description}
                revision={new Date(detail.updatedAt).getTime()}
                readOnly={!canEdit}
              />
            </Section>

            {child && (
              <Section title={child.section}>
                {childItems.length > 0 ? (
                  <ul className="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-border">
                    {childItems.map((item) => {
                      const status = statusById.get(item.statusId);
                      // The Backlog row (JIR-93), read-only in the drawer.
                      return (
                        <ItemRow
                          key={item.id}
                          as="li"
                          {...itemLinkProps(item.key)}
                          item={{
                            id: item.id,
                            key: item.key,
                            title: item.title,
                            type: item.type,
                            status: status
                              ? { name: status.name, category: statusCategory(status.category) }
                              : null,
                          }}
                        />
                      );
                    })}
                  </ul>
                ) : !canCreateChild ? (
                  <p className="text-sm text-muted-foreground">Aucun enfant.</p>
                ) : null}
                {canCreateChild &&
                  createChildButton(
                    <button type="button" className={DASHED_BUTTON}>
                      + {child.create}
                    </button>,
                  )}
              </Section>
            )}

            <div ref={linksRef}>
              <Section title="Items liés">
                <LinksSection
                  itemId={detail.id}
                  backlogKey={backlogKey}
                  links={links}
                  candidates={candidates}
                  canLink={canLink}
                  openRequest={linkRequest}
                />
              </Section>
            </div>

            <ActivityFeed
              itemId={detail.id}
              backlogKey={backlogKey}
              comments={comments}
              activities={activities}
              users={users.map((u) => ({ id: u.id, name: u.name }))}
              currentUserId={currentUserId}
              capabilities={{
                add: canComment,
                editOwn: itemCapabilities?.editOwnComments ?? canEditItems,
                deleteOwn: itemCapabilities?.deleteOwnComments ?? canEditItems,
                deleteAll: itemCapabilities?.deleteAllComments ?? canEditItems,
              }}
              lookup={historyLookup}
              filter={activityFilter}
              onFilterChange={setActivityFilter}
            />
          </div>

          {/* Side column (Jira's Details): min-w-0 keeps wide controls inside. */}
          <aside
            aria-label="Propriétés"
            data-testid="item-detail-properties"
            className="flex min-w-0 flex-col gap-4 border-t border-border bg-[var(--surface-2)] px-4 py-5 sm:px-5 @min-[900px]:overflow-y-auto @min-[900px]:border-t-0 @min-[900px]:border-l"
          >
            <StatusActions
              itemId={detail.id}
              backlogKey={backlogKey}
              statusId={detail.statusId}
              statuses={statusOptions}
              canTransition={canTransition}
            />

            <CollapsiblePanel id="details" title="Détails">
              <dl className="m-0 grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-1 gap-y-0.5 px-1.5 py-2 text-[13.5px]">
                <DetailField
                  label="Assigné"
                  emptyText="Non assigné"
                  value={
                    assignee ? (
                      <>
                        <span aria-hidden>
                          <InitialsAvatar name={assignee.name} hue={3} size={22} />
                        </span>
                        <span className="truncate">{assignee.name}</span>
                      </>
                    ) : null
                  }
                  shortcut="item.assign"
                  editor={
                    canAssign ? (
                      <AssigneeField
                        itemId={detail.id}
                        backlogKey={backlogKey}
                        assigneeId={assigneeField.value}
                        currentAssignee={assignee}
                        users={assigneeCandidates}
                        currentUserId={currentUserId}
                      />
                    ) : undefined
                  }
                  after={
                    <>
                      {canAssignToMe && (
                        <button
                          type="button"
                          onClick={assignToMe}
                          disabled={assigneeField.pending}
                          className="self-start px-1.5 text-[12.5px] text-[var(--primary)] hover:text-[var(--primary-hover)] hover:underline disabled:opacity-60"
                        >
                          M’assigner
                        </button>
                      )}
                      {assigneeField.error && (
                        <p role="alert" className="px-1.5 text-xs text-[var(--danger)]">
                          {assigneeField.error}
                        </p>
                      )}
                    </>
                  }
                />

                <DetailField
                  label="Rapporteur"
                  value={reporter ? (
                    <>
                      <span aria-hidden>
                        <InitialsAvatar name={reporter.name} hue={3} size={22} />
                      </span>
                      <span className="truncate">{reporter.name}</span>
                    </>
                  ) : null}
                  editor={canEdit ? (
                    <ReporterField
                      itemId={detail.id}
                      backlogKey={backlogKey}
                      reporterId={detail.reporterId}
                      currentReporter={reporter}
                      users={reporterCandidates}
                    />
                  ) : undefined}
                />

                <DetailField
                  label="Priorité"
                  emptyText="Aucune"
                  value={priority === 0 ? null : (
                    <>
                      <PrioIcon priority={priority} />
                      {PRIORITY_LABELS[priority]}
                    </>
                  )}
                  editor={canEdit ? (
                    <PriorityField itemId={detail.id} backlogKey={backlogKey} priority={detail.priority} />
                  ) : undefined}
                />

                {detail.type === "tache" && (
                  <DetailField
                    label="Points"
                    value={detail.estimatePoints === null ? null : pointsLabel(detail.estimatePoints)}
                    editor={canEdit ? (
                      <EstimateField
                        itemId={detail.id}
                        backlogKey={backlogKey}
                        estimatePoints={detail.estimatePoints}
                      />
                    ) : undefined}
                  />
                )}

                {detail.type === "tache" && (
                  <DetailField
                    label="Sprint"
                    value={selectedSprint?.name ?? "Backlog"}
                    editor={planningCapabilities?.assignSprint ? (
                      <select
                        aria-label="Sprint"
                        aria-busy={planningPending}
                        disabled={planningPending}
                        value={selectedSprintId ?? ""}
                        onChange={(event) => handleSprintChange(event.target.value || null)}
                        className={SELECT}
                      >
                        <option value="">Backlog</option>
                        {sprints.map((sprint) => (
                          <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
                        ))}
                      </select>
                    ) : undefined}
                  />
                )}

                {detail.type !== "composant" && (
                  <DetailField
                    label="Parent"
                    editTrigger="icon"
                    value={(() => {
                      const shown = selectedParent ?? (parent ? { ...parent, type: parent.type ?? PARENT_TYPE[detail.type]! } : null);
                      return shown ? (
                        <Link
                          {...itemLinkProps(shown.key)}
                          className="flex min-w-0 items-center gap-2 text-[var(--primary)] hover:text-[var(--primary-hover)] hover:underline"
                        >
                          <TypeIcon type={shown.type} size={14} />
                          <span className="truncate">{shown.key} {shown.title}</span>
                        </Link>
                      ) : null;
                    })()}
                    editor={planningCapabilities?.reparent ? (
                      <select
                        aria-label="Parent"
                        aria-busy={planningPending}
                        disabled={planningPending}
                        value={selectedParentId ?? ""}
                        onChange={(event) => handleParentChange(event.target.value || null)}
                        className={SELECT}
                      >
                        <option value="">Aucun parent</option>
                        {parentCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.key} — {candidate.title}
                          </option>
                        ))}
                      </select>
                    ) : undefined}
                  />
                )}

                <DetailField
                  label="Nature"
                  emptyText="Aucune"
                  value={ITEM_KIND_LABELS[detail.kind]}
                  editor={canEdit ? (
                    <KindField itemId={detail.id} backlogKey={backlogKey} kind={detail.kind} />
                  ) : undefined}
                />

                <div className="contents" data-testid="item-detail-field">
                  <dt className="px-2 py-2 text-muted-foreground">Labels</dt>
                  <dd className="m-0 min-w-0 px-1 py-1">
                    {canEdit ? (
                      <LabelsField
                        itemId={detail.id}
                        backlogKey={backlogKey}
                        backlogId={detail.backlogId}
                        itemLabelIds={itemLabelIds}
                        backlogLabels={backlogLabels}
                      />
                    ) : selectedLabels.length > 0 ? (
                      <span className="flex flex-wrap gap-1 px-1.5 py-1">
                        {selectedLabels.map((label) => (
                          <LabelPill key={label.id} name={label.name} color={label.color} />
                        ))}
                      </span>
                    ) : (
                      <span className="block px-1.5 py-1 text-muted-foreground">Aucun</span>
                    )}
                  </dd>
                </div>

                <div className="contents" data-testid="item-detail-field">
                  <dt className="px-2 py-2 text-muted-foreground">Fix versions</dt>
                  <dd className="m-0 min-w-0 px-1 py-1">
                    {!releaseCapabilities?.assignItems && fixVersionField.value.length === 0 ? (
                      <span className="block px-1.5 py-1 text-muted-foreground">Aucune</span>
                    ) : (
                      <FixVersionPicker
                        value={fixVersionField.value}
                        options={fixVersionOptions}
                        disabled={!releaseCapabilities?.assignItems || fixVersionField.pending}
                        onChange={fixVersionField.update}
                      />
                    )}
                    {fixVersionField.error ? (
                      <p role="alert" className="mt-1 text-xs text-destructive">
                        {fixVersionField.error}
                      </p>
                    ) : null}
                  </dd>
                </div>

                <DetailField
                  label="Échéance"
                  emptyText="Aucune"
                  value={detail.dueDate ? dueDateFmt.format(new Date(detail.dueDate)) : null}
                  editor={canEdit ? (
                    <DueDateField itemId={detail.id} backlogKey={backlogKey} dueDate={detail.dueDate} />
                  ) : undefined}
                />
              </dl>
              {planningError && (
                <p role="alert" className="px-3.5 pb-3 text-xs text-destructive">{planningError}</p>
              )}
            </CollapsiblePanel>

            <CollapsiblePanel id="development" title="Développement">
              <div className="flex flex-col gap-1 p-2.5">
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      branchName,
                      `Nom de branche copié : ${branchName}`,
                      "Impossible de copier le nom de branche.",
                    )
                  }
                  className="flex h-9 min-w-0 items-center gap-2.5 rounded-[var(--radius)] px-2 text-left text-[13.5px] hover:bg-[var(--muted)]"
                >
                  <GitBranch className="size-4 flex-none" aria-hidden />
                  <span className="flex-none">Copier le nom de branche</span>
                  <span
                    className="ml-auto min-w-0 truncate font-mono text-[11.5px] text-muted-foreground"
                    title={branchName}
                  >
                    {branchName}
                  </span>
                </button>
                <DevRefsSection
                  itemId={detail.id}
                  backlogKey={backlogKey}
                  refs={refs}
                  canLink={canLink}
                />
              </div>
            </CollapsiblePanel>

            <div className={cn("mt-auto flex flex-col gap-1 px-1 pt-1 text-[12.5px] text-muted-foreground")}>
              <span>Créé le {dateTimeFmt.format(new Date(detail.createdAt))}</span>
              <span>Mis à jour le {dateTimeFmt.format(new Date(detail.updatedAt))}</span>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

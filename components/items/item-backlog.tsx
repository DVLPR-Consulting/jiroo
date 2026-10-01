"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Inbox, SearchX } from "lucide-react";
import { rankBacklogItemAction } from "@/app/actions/items";
import {
  moveSprintItemAction as defaultMoveSprintItemAction,
  reorderSprintAction as defaultReorderSprintAction,
} from "@/app/actions/sprints";
import { KindIcon } from "@/components/icons/kind-icon";
import { PrioIcon } from "@/components/icons/prio-icon";
import { TypeIcon } from "@/components/icons/type-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import { BulkItemToolbar } from "@/components/items/bulk-item-toolbar";
import {
  FixVersionChips,
  type FixVersionOption,
} from "@/components/items/fix-version-picker";
import { InlineEstimate } from "@/components/items/inline-item-field";
import {
  NewItemButton,
  type NewItemButtonProps,
} from "@/components/items/new-item-dialog";
import {
  CreateSprintButton,
  EditSprintDialog,
} from "@/components/sprints/sprint-form-dialog";
import {
  CompleteSprintDialog,
  StartSprintDialog,
} from "@/components/sprints/sprint-lifecycle-dialogs";
import { SprintSectionHeader } from "@/components/sprints/sprint-section-header";
import { Button } from "@/components/ui/button";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  BulkItemCapabilities,
  ItemCapabilities,
  PlanningCapabilities,
  ReleaseCapabilities,
} from "@/lib/auth/capabilities";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  type ItemKind,
  type Priority,
} from "@/lib/design/constants";
import {
  emptySelection,
  reconcileSelection,
  selectAllVisible,
  toggleItemSelection,
} from "@/lib/items/selection";
import { sprintBacklogCollisionDetection } from "@/lib/items/sprint-dnd";
import type {
  SprintMetrics,
  SprintPlanningSection,
  SprintSummary,
} from "@/lib/items/sprint-planning";
import {
  calculateSprintMetrics,
  type RecentVelocityContext,
} from "@/lib/items/sprint-planning";

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
  fixVersions?: FixVersionOption[];
};

type BacklogGroup = {
  key: string;
  label: string;
  items: BacklogItem[];
};

type RankItemAction = (input: {
  backlogKey: string;
  backlogId: string;
  id: string;
  beforeId: string | null;
  afterId: string | null;
}) => Promise<
  | { ok: true; item: unknown }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
>;

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
  canSelectItems,
  canEditItems,
  canScheduleItems,
  manualOrder,
  mutationPending,
  bulkSelected,
  onToggleSelection,
}: {
  item: BacklogItem;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  selectedKey?: string;
  canSelectItems: boolean;
  canEditItems: boolean;
  canScheduleItems: boolean;
  manualOrder: boolean;
  mutationPending: boolean;
  bulkSelected: boolean;
  onToggleSelection: (id: string, extendRange: boolean) => void;
}) {
  const viewUrl = useViewUrlState();
  const status = statuses.find((option) => option.id === item.statusId);
  const priority = asPriority(item.priority);
  const assigneeName =
    item.assigneeName ??
    users.find((user) => user.id === item.assigneeId)?.name ??
    "Non assigné";
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { key: item.key, title: item.title },
    disabled: !canScheduleItems || !manualOrder || mutationPending,
  });

  function openItem() {
    viewUrl.push((params) => params.set("item", item.key));
  }

  return (
    <tr
      ref={setNodeRef}
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
        selectedKey === item.key || bulkSelected ? "bg-[var(--accent-subtle)]" : ""
      }`}
      style={{
        height: "var(--row-h)",
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
    >
      {canSelectItems ? (
        <td
          className={`${CELL_CLASS} px-2 text-center`}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={bulkSelected}
            onChange={() => undefined}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelection(item.id, event.shiftKey);
            }}
            aria-label={`Sélectionner ${item.key}`}
            className="size-4 cursor-pointer accent-[var(--primary)]"
          />
        </td>
      ) : null}
      <td
        className={`${CELL_CLASS} px-1`}
        onClick={(event) => event.stopPropagation()}
      >
        {manualOrder && canScheduleItems ? (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            aria-label={`Déplacer ${item.key}`}
            data-rank-handle={item.id}
            disabled={mutationPending}
            className="inline-flex size-7 cursor-grab items-center justify-center rounded text-muted-foreground outline-none hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GripVertical aria-hidden size={15} />
          </button>
        ) : null}
      </td>
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
          readOnly={!canEditItems}
        />
      </td>
      <td className={CELL_CLASS}>
        <FixVersionChips versions={item.fixVersions ?? []} />
      </td>
      <td className={CELL_CLASS}>
        <span className="truncate">{assigneeName}</span>
      </td>
    </tr>
  );
}

function LegacyItemBacklog({
  groups,
  grouped,
  statuses,
  users,
  backlogKey,
  backlogId,
  selectedKey,
  filtersActive = false,
  hasItems,
  clearFiltersHref,
  canEditItems = true,
  canTransitionItems = true,
  canAssignItems = true,
  canScheduleItems = true,
  canBulkChangeItems = true,
  bulkCapabilities,
  releaseOptions = [],
  releaseCapabilities,
  manualOrder = false,
  rankItemAction = rankBacklogItemAction,
}: {
  groups: BacklogGroup[];
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  backlogId: string;
  selectedKey?: string;
  filtersActive?: boolean;
  hasItems?: boolean;
  clearFiltersHref?: string;
  canCreateItems?: boolean;
  canEditItems?: boolean;
  canTransitionItems?: boolean;
  canAssignItems?: boolean;
  canScheduleItems?: boolean;
  canManageSprints?: boolean;
  canBulkChangeItems?: boolean;
  itemCapabilities?: ItemCapabilities;
  planningCapabilities?: PlanningCapabilities;
  bulkCapabilities?: BulkItemCapabilities;
  releaseOptions?: FixVersionOption[];
  releaseCapabilities?: ReleaseCapabilities;
  manualOrder?: boolean;
  rankItemAction?: RankItemAction;
}) {
  const router = useRouter();
  const visibleItems = useMemo(
    () => groups.flatMap((group) => group.items),
    [groups],
  );
  const [orderedItems, setOrderedItems] = useState(visibleItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);
  const [selection, setSelection] = useState(emptySelection);
  const [selectionScope, setSelectionScope] = useState<string | null>(null);
  const snapshot = useRef<BacklogItem[] | null>(null);
  const lastIncomingItems = useRef(visibleItems);
  const pendingIncomingItems = useRef<BacklogItem[] | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (lastIncomingItems.current !== visibleItems) {
      lastIncomingItems.current = visibleItems;
      pendingIncomingItems.current = visibleItems;
    }
    if (
      activeId === null &&
      !mutationPending &&
      pendingIncomingItems.current !== null
    ) {
      setOrderedItems(pendingIncomingItems.current);
      pendingIncomingItems.current = null;
    }
  }, [activeId, mutationPending, visibleItems]);

  const displayedItems = manualOrder ? orderedItems : visibleItems;
  const displayedGroups = manualOrder
    ? [{ key: "", label: "", items: orderedItems }]
    : groups;
  const totalPoints = displayedItems.reduce(
    (total, item) => total + (item.estimatePoints ?? 0),
    0,
  );
  const unestimatedCount = displayedItems.filter(
    (item) => item.estimatePoints === null,
  ).length;
  const showNoResults = filtersActive && (hasItems ?? displayedItems.length > 0);
  const visibleIds = useMemo(
    () => displayedItems.map((item) => item.id),
    [displayedItems],
  );
  const visibleSignature = visibleIds.join("\u001f");
  if (selectionScope !== visibleSignature) {
    setSelectionScope(visibleSignature);
    setSelection((current) => reconcileSelection(current, visibleIds));
  }
  const selectedItems = displayedItems.filter((item) =>
    selection.selectedIds.has(item.id),
  );
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selection.selectedIds.has(id));
  const partlySelected = selection.selectedIds.size > 0 && !allSelected;
  const canSelectItems = releaseCapabilities?.bulkAssignItems === true || (
    bulkCapabilities
      ? Object.values(bulkCapabilities).some(Boolean)
      : canBulkChangeItems && (
        canEditItems || canTransitionItems || canAssignItems || canScheduleItems
      )
  );

  function toggleSelection(id: string, extendRange: boolean) {
    setSelection((current) =>
      toggleItemSelection(current, visibleIds, id, extendRange),
    );
  }

  function handleSelectionShortcut(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [contenteditable='true']")) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelection(selectAllVisible(visibleIds));
    } else if (event.key === "Escape" && selection.selectedIds.size > 0) {
      event.preventDefault();
      setSelection(emptySelection());
    }
  }

  function restoreFocus(itemId: string) {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-rank-handle="${itemId}"]`)
        ?.focus();
    });
  }

  function onDragStart(event: DragStartEvent) {
    snapshot.current = orderedItems;
    setActiveId(String(event.active.id));
    setRankError(null);
  }

  function onDragCancel() {
    const draggedId = activeId;
    if (snapshot.current) setOrderedItems(snapshot.current);
    snapshot.current = null;
    setActiveId(null);
    if (draggedId) restoreFocus(draggedId);
  }

  function onDragEnd(event: DragEndEvent) {
    const movedId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const rollback = snapshot.current ?? orderedItems;
    snapshot.current = null;
    setActiveId(null);
    if (!overId || movedId === overId) return;

    const oldIndex = orderedItems.findIndex((item) => item.id === movedId);
    const newIndex = orderedItems.findIndex((item) => item.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const nextItems = arrayMove(orderedItems, oldIndex, newIndex);
    const movedIndex = nextItems.findIndex((item) => item.id === movedId);
    const beforeId = movedIndex > 0 ? nextItems[movedIndex - 1]!.id : null;
    const afterId =
      movedIndex < nextItems.length - 1 ? nextItems[movedIndex + 1]!.id : null;
    setOrderedItems(nextItems);
    setMutationPending(true);

    void rankItemAction({
      backlogKey,
      backlogId,
      id: movedId,
      beforeId,
      afterId,
    })
      .then((result) => {
        if (!result.ok) {
          setOrderedItems(rollback);
          setRankError("Classement impossible.");
          restoreFocus(movedId);
          return;
        }
        router.refresh();
      })
      .catch(() => {
        setOrderedItems(rollback);
        setRankError("Classement impossible.");
        restoreFocus(movedId);
      })
      .finally(() => setMutationPending(false));
  }

  const announcements = {
    onDragStart({ active }: DragStartEvent) {
      const item = orderedItems.find((candidate) => candidate.id === String(active.id));
      return item ? `${item.key} saisi pour classement.` : "Item saisi pour classement.";
    },
    onDragOver({ active, over }: DragOverEvent) {
      const item = orderedItems.find((candidate) => candidate.id === String(active.id));
      const position = over
        ? orderedItems.findIndex((candidate) => candidate.id === String(over.id)) + 1
        : 0;
      return item && position > 0
        ? `${item.key}, position ${position} sur ${orderedItems.length}.`
        : undefined;
    },
    onDragEnd({ active, over }: DragEndEvent) {
      const item = orderedItems.find((candidate) => candidate.id === String(active.id));
      const position = over
        ? orderedItems.findIndex((candidate) => candidate.id === String(over.id)) + 1
        : 0;
      return item && position > 0
        ? `${item.key} déposé en position ${position} sur ${orderedItems.length}.`
        : "Classement annulé.";
    },
    onDragCancel() {
      return "Classement annulé.";
    },
  };

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-labelledby="backlog-heading"
      onKeyDown={canSelectItems ? handleSelectionShortcut : undefined}
    >
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <h2 id="backlog-heading" className="t-h2">
          Backlog
        </h2>
        <span className="text-xs text-muted-foreground">
          {displayedItems.length} {displayedItems.length === 1 ? "item" : "items"}
        </span>
        <span className="text-xs text-muted-foreground">
          {pointFormatter.format(totalPoints)} {totalPoints === 1 ? "point" : "points"}
        </span>
        <span className="text-xs text-muted-foreground">
          {unestimatedCount} non estimé{unestimatedCount > 1 ? "s" : ""}
        </span>
        {canScheduleItems && !manualOrder && displayedItems.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            Effacez le tri ou le groupement pour modifier l’ordre manuel.
          </span>
        ) : null}
      </header>

      {rankError ? (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-[var(--radius-md)] bg-[var(--danger)] px-3 py-2 text-sm text-white"
        >
          {rankError}
        </div>
      ) : null}

      {displayedItems.length === 0 ? (
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
        <DndContext
          id={`backlog-rank-${backlogId}`}
          sensors={sensors}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                "Appuyez sur espace pour saisir une tâche, utilisez les flèches verticales, puis espace pour déposer ou Échap pour annuler.",
            },
          }}
          onDragStart={manualOrder && canScheduleItems ? onDragStart : undefined}
          onDragEnd={manualOrder && canScheduleItems ? onDragEnd : undefined}
          onDragCancel={manualOrder && canScheduleItems ? onDragCancel : undefined}
        >
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-separate border-spacing-0">
            <colgroup>
              {canSelectItems ? <col className="w-10" /> : null}
              <col className="w-10" />
              <col className="w-32" />
              <col />
              <col className="w-40" />
              <col className="w-28" />
              <col className="w-24" />
              <col className="w-44" />
              <col className="w-44" />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr>
                {canSelectItems ? (
                  <th scope="col" className={`${HEADER_CLASS} px-2 text-center`}>
                    <input
                      ref={(node) => {
                        if (node) node.indeterminate = partlySelected;
                      }}
                      type="checkbox"
                      checked={allSelected}
                      onChange={() =>
                        setSelection(
                          allSelected ? emptySelection() : selectAllVisible(visibleIds),
                        )
                      }
                      aria-label="Sélectionner toutes les tâches visibles"
                      className="size-4 cursor-pointer accent-[var(--primary)]"
                    />
                  </th>
                ) : null}
                <th scope="col" className={HEADER_CLASS}>
                  <span className="sr-only">Ordre</span>
                </th>
                <th scope="col" className={HEADER_CLASS}>Clé</th>
                <th scope="col" className={HEADER_CLASS}>Titre</th>
                <th scope="col" className={HEADER_CLASS}>Statut</th>
                <th scope="col" className={HEADER_CLASS}>Priorité</th>
                <th scope="col" className={HEADER_CLASS}>Points</th>
                <th scope="col" className={HEADER_CLASS}>Fix versions</th>
                <th scope="col" className={HEADER_CLASS}>Assigné</th>
              </tr>
            </thead>
            {displayedGroups.map((group) => (
              <tbody key={group.key || "backlog"}>
                {grouped ? (
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={canSelectItems ? 9 : 8}
                      className="border-b border-border bg-[var(--surface-2)] px-3 py-2 text-left text-xs font-semibold"
                    >
                      {group.label} · {group.items.length}
                    </th>
                  </tr>
                ) : null}
                <SortableContext
                  items={group.items.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {group.items.map((item) => (
                    <BacklogRow
                      key={item.id}
                      item={item}
                      statuses={statuses}
                      users={users}
                      backlogKey={backlogKey}
                      selectedKey={selectedKey}
                      canSelectItems={canSelectItems}
                      canEditItems={canEditItems}
                      canScheduleItems={canScheduleItems}
                      manualOrder={manualOrder}
                      mutationPending={mutationPending}
                      bulkSelected={selection.selectedIds.has(item.id)}
                      onToggleSelection={toggleSelection}
                    />
                  ))}
                </SortableContext>
              </tbody>
            ))}
          </table>
          {canSelectItems && selectedItems.length > 0 ? (
            <BulkItemToolbar
              backlogId={backlogId}
              backlogKey={backlogKey}
              selectedItems={selectedItems.map((item) => ({
                id: item.id,
                type: item.type,
              }))}
              statuses={statuses}
              users={users}
              canEditItems={canEditItems}
              canTransitionItems={canTransitionItems}
              canAssignItems={canAssignItems}
              canScheduleItems={canScheduleItems}
              canBulkChangeItems={canBulkChangeItems}
              capabilities={bulkCapabilities}
              releaseOptions={releaseOptions}
              releaseCapabilities={releaseCapabilities}
              onClearSelection={() => setSelection(emptySelection())}
              onMutationSuccess={() => router.refresh()}
            />
          ) : null}
        </div>
        </DndContext>
      )}
    </section>
  );
}

type SharedBacklogProps = {
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  backlogId: string;
  selectedKey?: string;
  filtersActive?: boolean;
  hasItems?: boolean;
  clearFiltersHref?: string;
  canCreateItems?: boolean;
  canEditItems?: boolean;
  canTransitionItems?: boolean;
  canAssignItems?: boolean;
  canScheduleItems?: boolean;
  canManageSprints?: boolean;
  canBulkChangeItems?: boolean;
  itemCapabilities?: ItemCapabilities;
  planningCapabilities?: PlanningCapabilities;
  bulkCapabilities?: BulkItemCapabilities;
  releaseOptions?: FixVersionOption[];
  releaseCapabilities?: ReleaseCapabilities;
  manualOrder?: boolean;
  rankItemAction?: RankItemAction;
};

type LegacyBacklogProps = SharedBacklogProps & {
  groups: BacklogGroup[];
};

type SprintBacklogSection = SprintPlanningSection<BacklogItem> & {
  groups: BacklogGroup[];
};

type MoveSprintItemAction = (input: {
  backlogKey: string;
  backlogId: string;
  itemId: string;
  sprintId: string | null;
  beforeId: string | null;
  afterId: string | null;
}) => Promise<
  | { ok: true; item: unknown }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
>;

type SprintBacklogProps = SharedBacklogProps & {
  sections: SprintBacklogSection[];
  sprints: SprintSummary[];
  recentVelocity?: RecentVelocityContext | null;
  moveSprintItemAction?: MoveSprintItemAction;
  reorderSprintAction?: typeof defaultReorderSprintAction;
  createDialogProps?: Pick<NewItemButtonProps, "items" | "statuses" | "canScheduleItems" | "releaseOptions">;
};

function SectionTable({
  section,
  grouped,
  statuses,
  users,
  backlogKey,
  selectedKey,
  canSelectItems,
  canEditItems,
  canScheduleItems,
  manualOrder,
  mutationPending,
  selection,
  allVisibleSelected,
  partlyVisibleSelected,
  onToggleAll,
  onToggleSelection,
}: {
  section: SprintBacklogSection;
  grouped: boolean;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  selectedKey?: string;
  canSelectItems: boolean;
  canEditItems: boolean;
  canScheduleItems: boolean;
  manualOrder: boolean;
  mutationPending: boolean;
  selection: ReadonlySet<string>;
  allVisibleSelected: boolean;
  partlyVisibleSelected: boolean;
  onToggleAll: () => void;
  onToggleSelection: (id: string, extendRange: boolean) => void;
}) {
  return (
    <table className="w-full table-fixed border-separate border-spacing-0">
      <colgroup>
        {canSelectItems ? <col className="w-10" /> : null}
        <col className="w-10" />
        <col className="w-32" />
        <col />
        <col className="w-40" />
        <col className="w-28" />
        <col className="w-24" />
        <col className="w-44" />
        <col className="w-44" />
      </colgroup>
      <thead>
        <tr>
          {canSelectItems ? (
            <th scope="col" className={`${HEADER_CLASS} px-2 text-center`}>
              <input
                ref={(node) => {
                  if (node) node.indeterminate = partlyVisibleSelected;
                }}
                type="checkbox"
                checked={allVisibleSelected}
                onChange={onToggleAll}
                aria-label={
                  section.sprint
                    ? `Sélectionner toutes les tâches de ${section.sprint.name}`
                    : "Sélectionner toutes les tâches visibles"
                }
                className="size-4 cursor-pointer accent-[var(--primary)]"
              />
            </th>
          ) : null}
          <th scope="col" className={HEADER_CLASS}><span className="sr-only">Ordre</span></th>
          <th scope="col" className={HEADER_CLASS}>Clé</th>
          <th scope="col" className={HEADER_CLASS}>Titre</th>
          <th scope="col" className={HEADER_CLASS}>Statut</th>
          <th scope="col" className={HEADER_CLASS}>Priorité</th>
          <th scope="col" className={HEADER_CLASS}>Points</th>
          <th scope="col" className={HEADER_CLASS}>Fix versions</th>
          <th scope="col" className={HEADER_CLASS}>Assigné</th>
        </tr>
      </thead>
      {section.groups.map((group) => (
        <tbody key={group.key || section.id}>
          {grouped ? (
            <tr>
              <th
                scope="rowgroup"
                colSpan={canSelectItems ? 9 : 8}
                className="border-b border-border bg-[var(--surface-2)] px-3 py-2 text-left text-xs font-semibold"
              >
                {group.label} · {group.items.length}
              </th>
            </tr>
          ) : null}
          <SortableContext
            items={group.items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            {group.items.map((item) => (
              <BacklogRow
                key={item.id}
                item={item}
                statuses={statuses}
                users={users}
                backlogKey={backlogKey}
                selectedKey={selectedKey}
                canSelectItems={canSelectItems}
                canEditItems={canEditItems}
                canScheduleItems={canScheduleItems}
                manualOrder={manualOrder}
                mutationPending={mutationPending}
                bulkSelected={selection.has(item.id)}
                onToggleSelection={onToggleSelection}
              />
            ))}
          </SortableContext>
        </tbody>
      ))}
    </table>
  );
}

function SprintSectionDropZone({
  sectionId,
  children,
}: {
  sectionId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `section:${sectionId}` });
  return (
    <div
      ref={setNodeRef}
      data-sprint-section={sectionId}
      data-drop-target={isOver ? "true" : undefined}
      className={isOver ? "bg-primary/5" : undefined}
    >
      {children}
    </div>
  );
}

function SprintItemBacklog({
  sections,
  sprints,
  grouped,
  statuses,
  users,
  backlogKey,
  backlogId,
  selectedKey,
  canCreateItems: legacyCanCreateItems = true,
  canEditItems: legacyCanEditItems = true,
  canTransitionItems: legacyCanTransitionItems = true,
  canAssignItems: legacyCanAssignItems = true,
  canScheduleItems: legacyCanScheduleItems = true,
  canManageSprints: legacyCanManageSprints = true,
  canBulkChangeItems: legacyCanBulkChangeItems = true,
  itemCapabilities,
  planningCapabilities,
  bulkCapabilities,
  releaseOptions = [],
  releaseCapabilities,
  manualOrder = false,
  rankItemAction = rankBacklogItemAction,
  moveSprintItemAction = defaultMoveSprintItemAction,
  reorderSprintAction = defaultReorderSprintAction,
  createDialogProps,
  recentVelocity = null,
}: SprintBacklogProps) {
  const canCreateItems = itemCapabilities?.create ?? legacyCanCreateItems;
  const canEditItems = itemCapabilities?.edit ?? legacyCanEditItems;
  const canTransitionItems = itemCapabilities?.transition ?? legacyCanTransitionItems;
  const canAssignItems = itemCapabilities?.assign ?? legacyCanAssignItems;
  const canScheduleItems = planningCapabilities?.rank ?? legacyCanScheduleItems;
  const canManageSprints = planningCapabilities?.manageSprints ?? legacyCanManageSprints;
  const canBulkChangeItems = bulkCapabilities
    ? Object.values(bulkCapabilities).some(Boolean)
    : legacyCanBulkChangeItems;
  const router = useRouter();
  const [renderedSections, setRenderedSections] = useState(sections);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((section) => [section.id, true])),
  );
  const [selection, setSelection] = useState(emptySelection);
  const [selectionScope, setSelectionScope] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rankError, setRankError] = useState<string | null>(null);
  const canSelectItems = releaseCapabilities?.bulkAssignItems === true || (
    bulkCapabilities
      ? Object.values(bulkCapabilities).some(Boolean)
      : canBulkChangeItems && (
        canEditItems || canTransitionItems || canAssignItems || canScheduleItems
      )
  );
  const sectionSnapshot = useRef<SprintBacklogSection[] | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const visibleItems = useMemo(
    () =>
      renderedSections.flatMap((section) =>
        (expanded[section.id] ?? true) ? section.items : [],
      ),
    [expanded, renderedSections],
  );
  const visibleIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
  const visibleSignature = visibleIds.join("\u001f");

  if (selectionScope !== visibleSignature) {
    setSelectionScope(visibleSignature);
    setSelection((current) => reconcileSelection(current, visibleIds));
  }
  useEffect(() => {
    if (activeId !== null || mutationPending) return;
    const handle = window.setTimeout(() => setRenderedSections(sections), 0);
    return () => window.clearTimeout(handle);
  }, [activeId, mutationPending, sections]);

  const selectedItems = visibleItems.filter((item) => selection.selectedIds.has(item.id));

  function toggleSelection(id: string, extendRange: boolean) {
    setSelection((current) =>
      toggleItemSelection(current, visibleIds, id, extendRange),
    );
  }

  function handleSelectionShortcut(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [contenteditable='true']")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelection(selectAllVisible(visibleIds));
    } else if (event.key === "Escape" && selection.selectedIds.size > 0) {
      event.preventDefault();
      setSelection(emptySelection());
    }
  }

  function restoreFocus(itemId: string) {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-rank-handle="${itemId}"]`)
        ?.focus();
    });
  }

  const announcements = {
    onDragStart({ active }: DragStartEvent) {
      const item = visibleItems.find((candidate) => candidate.id === String(active.id));
      return item ? `${item.key} saisi pour planification.` : "Tâche saisie pour planification.";
    },
    onDragOver({ active, over }: DragOverEvent) {
      const item = visibleItems.find((candidate) => candidate.id === String(active.id));
      const position = over
        ? visibleItems.findIndex((candidate) => candidate.id === String(over.id)) + 1
        : 0;
      return item && position > 0
        ? `${item.key}, position ${position} sur ${visibleItems.length}.`
        : undefined;
    },
    onDragEnd({ active, over }: DragEndEvent) {
      const item = visibleItems.find((candidate) => candidate.id === String(active.id));
      const position = over
        ? visibleItems.findIndex((candidate) => candidate.id === String(over.id)) + 1
        : 0;
      return item && position > 0
        ? `${item.key} déposé en position ${position} sur ${visibleItems.length}.`
        : "Planification annulée.";
    },
    onDragCancel() {
      return "Planification annulée.";
    },
  };

  function sectionWithItems(
    section: SprintBacklogSection,
    nextItems: BacklogItem[],
  ): SprintBacklogSection {
    const planningItems = nextItems.map((item) => ({
      ...item,
      done:
        statuses.find((status) => status.id === item.statusId)?.category === "done",
    }));
    return {
      ...section,
      items: nextItems,
      groups: [{ key: "", label: "", items: nextItems }],
      metrics: calculateSprintMetrics(
        planningItems,
        section.sprint?.capacityPoints ?? null,
        section.kind === "backlog" ? null : recentVelocity,
      ),
    };
  }

  function handleDragStart(event: DragStartEvent) {
    sectionSnapshot.current = renderedSections;
    setActiveId(String(event.active.id));
    setRankError(null);
  }

  function handleDragCancel() {
    const movedId = activeId;
    if (sectionSnapshot.current) setRenderedSections(sectionSnapshot.current);
    sectionSnapshot.current = null;
    setActiveId(null);
    if (movedId) restoreFocus(movedId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const movedId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const rollback = sectionSnapshot.current ?? renderedSections;
    sectionSnapshot.current = null;
    setActiveId(null);
    if (!overId || overId === movedId) return;

    const sourceIndex = renderedSections.findIndex((section) =>
      section.items.some((item) => item.id === movedId),
    );
    const targetIndex = overId.startsWith("section:")
      ? renderedSections.findIndex((section) => section.id === overId.slice(8))
      : renderedSections.findIndex((section) =>
          section.items.some((item) => item.id === overId),
        );
    if (sourceIndex < 0 || targetIndex < 0) return;
    const source = renderedSections[sourceIndex]!;
    const target = renderedSections[targetIndex]!;
    const moved = source.items.find((item) => item.id === movedId)!;
    const nextSections = [...renderedSections];
    let targetItems: BacklogItem[];

    if (sourceIndex === targetIndex) {
      const oldIndex = source.items.findIndex((item) => item.id === movedId);
      const newIndex = overId.startsWith("section:")
        ? source.items.length - 1
        : source.items.findIndex((item) => item.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      targetItems = arrayMove(source.items, oldIndex, newIndex);
      nextSections[sourceIndex] = sectionWithItems(source, targetItems);
    } else {
      const sourceItems = source.items.filter((item) => item.id !== movedId);
      targetItems = [...target.items];
      const insertIndex = overId.startsWith("section:")
        ? targetItems.length
        : Math.max(0, targetItems.findIndex((item) => item.id === overId));
      targetItems.splice(insertIndex, 0, moved);
      nextSections[sourceIndex] = sectionWithItems(source, sourceItems);
      nextSections[targetIndex] = sectionWithItems(target, targetItems);
    }

    const movedIndex = targetItems.findIndex((item) => item.id === movedId);
    const beforeId = movedIndex > 0 ? targetItems[movedIndex - 1]!.id : null;
    const afterId = movedIndex < targetItems.length - 1
      ? targetItems[movedIndex + 1]!.id
      : null;
    setRenderedSections(nextSections);
    setMutationPending(true);
    const sameSection = sourceIndex === targetIndex;
    const failureMessage = sameSection
      ? "Classement impossible."
      : "Planification impossible.";
    const mutation = sameSection
      ? rankItemAction({
          backlogKey,
          backlogId,
          id: movedId,
          beforeId,
          afterId,
        })
      : moveSprintItemAction({
          backlogKey,
          backlogId,
          itemId: movedId,
          sprintId: target.sprint?.id ?? null,
          beforeId,
          afterId,
        });
    void mutation
      .then((result) => {
        if (!result.ok) {
          setRenderedSections(rollback);
          setRankError(failureMessage);
          restoreFocus(movedId);
          return;
        }
        router.refresh();
      })
      .catch(() => {
        setRenderedSections(rollback);
        setRankError(failureMessage);
        restoreFocus(movedId);
      })
      .finally(() => setMutationPending(false));
  }

  function reorderPlannedSprint(sprintId: string, direction: -1 | 1) {
    const planned = renderedSections.filter(
      (section) => section.kind === "planned" && section.sprint,
    );
    const currentIndex = planned.findIndex((section) => section.id === sprintId);
    const insertIndex = currentIndex + direction;
    if (currentIndex < 0 || insertIndex < 0 || insertIndex >= planned.length) return;
    const withoutCurrent = planned.filter((section) => section.id !== sprintId);
    const beforeId = insertIndex > 0 ? withoutCurrent[insertIndex - 1]?.id ?? null : null;
    const afterId = withoutCurrent[insertIndex]?.id ?? null;
    setRankError(null);
    void reorderSprintAction({
      backlogKey,
      backlogId,
      id: sprintId,
      beforeId,
      afterId,
    }).then((result) => {
      if (!result.ok) {
        setRankError(result.error);
        return;
      }
      router.refresh();
    }).catch(() => setRankError("Classement du sprint impossible."));
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-labelledby="sprint-backlog-heading"
      onKeyDown={canSelectItems ? handleSelectionShortcut : undefined}
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 id="sprint-backlog-heading" className="t-h2">Planification</h2>
          {!manualOrder && visibleItems.length > 0 && canScheduleItems ? (
            <p className="text-xs text-muted-foreground">
              Effacez le tri ou le groupement pour modifier l’ordre manuel.
            </p>
          ) : null}
        </div>
        {canManageSprints ? (
          <CreateSprintButton backlogId={backlogId} backlogKey={backlogKey} />
        ) : null}
      </header>
      {rankError ? (
        <p role="alert" className="mx-4 mt-3 rounded-lg bg-destructive px-3 py-2 text-sm text-destructive-foreground">
          {rankError}
        </p>
      ) : null}
      <DndContext
        id={`sprint-backlog-${backlogId}`}
        sensors={sensors}
        collisionDetection={sprintBacklogCollisionDetection}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "Appuyez sur espace pour saisir une tâche, utilisez les flèches verticales, puis espace pour déposer ou Échap pour annuler.",
          },
        }}
        onDragStart={manualOrder && canScheduleItems ? handleDragStart : undefined}
        onDragEnd={manualOrder && canScheduleItems ? handleDragEnd : undefined}
        onDragCancel={manualOrder && canScheduleItems ? handleDragCancel : undefined}
      >
        <div className="min-h-0 flex-1 overflow-auto">
          {renderedSections.map((section) => {
            const sectionExpanded = expanded[section.id] ?? true;
            const sectionVisibleIds = sectionExpanded
              ? section.items.map((item) => item.id)
              : [];
            const selectedCount = sectionVisibleIds.filter((id) => selection.selectedIds.has(id)).length;
            const planned = renderedSections.filter((candidate) => candidate.kind === "planned");
            const plannedIndex = planned.findIndex((candidate) => candidate.id === section.id);
            const completedItems = section.items.filter(
              (item) => statuses.find((status) => status.id === item.statusId)?.category === "done",
            );
            const incompleteItems = section.items.filter(
              (item) => statuses.find((status) => status.id === item.statusId)?.category !== "done",
            );
            const canCreateInSection =
              canCreateItems && (section.kind === "backlog" || canScheduleItems);
            const metricsFor = (rows: BacklogItem[]) =>
              calculateSprintMetrics(
                rows.map((item) => ({ ...item, done: false })),
                null,
              );
            return (
              <SprintSectionDropZone key={section.id} sectionId={section.id}>
                <SprintSectionHeader
                  kind={section.kind}
                  sprint={section.sprint}
                  metrics={section.metrics as SprintMetrics}
                  expanded={sectionExpanded}
                  onExpandedChange={(next) =>
                    setExpanded((current) => ({ ...current, [section.id]: next }))
                  }
                  canManage={canManageSprints}
                  capabilities={planningCapabilities}
                  canMoveUp={section.kind === "planned" && plannedIndex > 0}
                  canMoveDown={section.kind === "planned" && plannedIndex < planned.length - 1}
                  onMoveUp={() => reorderPlannedSprint(section.id, -1)}
                  onMoveDown={() => reorderPlannedSprint(section.id, 1)}
                  actions={canCreateInSection || canManageSprints ? (
                    <>
                      {canCreateInSection && createDialogProps ? (
                        <NewItemButton
                          backlogId={backlogId}
                          backlogKey={backlogKey}
                          {...createDialogProps}
                          sprintId={section.sprint?.id ?? null}
                          contextLabel={section.sprint?.name ?? "Backlog"}
                          trigger={
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Créer une tâche dans ${section.sprint?.name ?? "Backlog"}`}
                            >
                              + Tâche
                            </Button>
                          }
                        />
                      ) : null}
                      {canManageSprints && section.sprint ? (
                        <EditSprintDialog
                          backlogId={backlogId}
                          backlogKey={backlogKey}
                          sprint={section.sprint}
                        />
                      ) : null}
                      {canManageSprints && section.kind === "planned" && section.sprint ? (
                        <StartSprintDialog
                          backlogId={backlogId}
                          backlogKey={backlogKey}
                          sprint={section.sprint}
                          metrics={section.metrics}
                        />
                      ) : null}
                      {canManageSprints && section.kind === "active" && section.sprint ? (
                        <CompleteSprintDialog
                          backlogId={backlogId}
                          backlogKey={backlogKey}
                          sprint={section.sprint}
                          metrics={section.metrics}
                          plannedSprints={renderedSections
                            .filter((candidate) => candidate.kind === "planned" && candidate.sprint)
                            .map((candidate) => ({ id: candidate.id, name: candidate.sprint!.name }))}
                          completedMetrics={metricsFor(completedItems)}
                          incompleteMetrics={metricsFor(incompleteItems)}
                        />
                      ) : null}
                    </>
                  ) : undefined}
                />
                {sectionExpanded ? (
                  section.items.length > 0 ? (
                    <SectionTable
                      section={section}
                      grouped={grouped}
                      statuses={statuses}
                      users={users}
                      backlogKey={backlogKey}
                      selectedKey={selectedKey}
                      canSelectItems={canSelectItems}
                      canEditItems={canEditItems}
                      canScheduleItems={canScheduleItems}
                      manualOrder={manualOrder}
                      mutationPending={mutationPending}
                      selection={selection.selectedIds}
                      allVisibleSelected={sectionVisibleIds.length > 0 && selectedCount === sectionVisibleIds.length}
                      partlyVisibleSelected={selectedCount > 0 && selectedCount < sectionVisibleIds.length}
                      onToggleAll={() =>
                        setSelection((current) => {
                          const next = new Set(current.selectedIds);
                          if (selectedCount === sectionVisibleIds.length) {
                            sectionVisibleIds.forEach((id) => next.delete(id));
                          } else {
                            sectionVisibleIds.forEach((id) => next.add(id));
                          }
                          return { selectedIds: next, anchorId: null };
                        })
                      }
                      onToggleSelection={toggleSelection}
                    />
                  ) : (
                    <p className="border-b border-border px-4 py-5 text-sm text-muted-foreground">
                      Aucune tâche dans cette section.
                    </p>
                  )
                ) : null}
              </SprintSectionDropZone>
            );
          })}
          {canSelectItems && selectedItems.length > 0 ? (
            <BulkItemToolbar
              backlogId={backlogId}
              backlogKey={backlogKey}
              selectedItems={selectedItems.map((item) => ({ id: item.id, type: item.type }))}
              statuses={statuses}
              users={users}
              sprints={sprints
                .filter((sprint): sprint is SprintSummary & { state: "planned" | "active" } =>
                  sprint.state === "planned" || sprint.state === "active",
                )
                .map((sprint) => ({ id: sprint.id, name: sprint.name, state: sprint.state }))}
              canEditItems={canEditItems}
              canTransitionItems={canTransitionItems}
              canAssignItems={canAssignItems}
              canScheduleItems={canScheduleItems}
              canBulkChangeItems={canBulkChangeItems}
              capabilities={bulkCapabilities}
              releaseOptions={releaseOptions}
              releaseCapabilities={releaseCapabilities}
              onClearSelection={() => setSelection(emptySelection())}
              onMutationSuccess={() => router.refresh()}
            />
          ) : null}
        </div>
      </DndContext>
    </section>
  );
}

export function ItemBacklog(props: LegacyBacklogProps | SprintBacklogProps) {
  if ("sections" in props) return <SprintItemBacklog {...props} />;
  return <LegacyItemBacklog {...props} />;
}

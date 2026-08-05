"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
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
  canWrite,
  manualOrder,
  mutationPending,
}: {
  item: BacklogItem;
  statuses: StatusOption[];
  users: UserOption[];
  backlogKey: string;
  selectedKey?: string;
  canWrite: boolean;
  manualOrder: boolean;
  mutationPending: boolean;
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
    disabled: !manualOrder || mutationPending,
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
        selectedKey === item.key ? "bg-[var(--accent-subtle)]" : ""
      }`}
      style={{
        height: "var(--row-h)",
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
    >
      <td
        className={`${CELL_CLASS} px-1`}
        onClick={(event) => event.stopPropagation()}
      >
        {manualOrder && canWrite ? (
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
  backlogId,
  selectedKey,
  filtersActive = false,
  hasItems,
  clearFiltersHref,
  canWrite = true,
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
  canWrite?: boolean;
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
    <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="backlog-heading">
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
        {canWrite && !manualOrder && displayedItems.length > 0 ? (
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
          sensors={sensors}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                "Appuyez sur espace pour saisir une tâche, utilisez les flèches verticales, puis espace pour déposer ou Échap pour annuler.",
            },
          }}
          onDragStart={manualOrder && canWrite ? onDragStart : undefined}
          onDragEnd={manualOrder && canWrite ? onDragEnd : undefined}
          onDragCancel={manualOrder && canWrite ? onDragCancel : undefined}
        >
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-separate border-spacing-0">
            <colgroup>
              <col className="w-10" />
              <col className="w-32" />
              <col />
              <col className="w-40" />
              <col className="w-28" />
              <col className="w-24" />
              <col className="w-44" />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr>
                <th scope="col" className={HEADER_CLASS}>
                  <span className="sr-only">Ordre</span>
                </th>
                <th scope="col" className={HEADER_CLASS}>Clé</th>
                <th scope="col" className={HEADER_CLASS}>Titre</th>
                <th scope="col" className={HEADER_CLASS}>Statut</th>
                <th scope="col" className={HEADER_CLASS}>Priorité</th>
                <th scope="col" className={HEADER_CLASS}>Points</th>
                <th scope="col" className={HEADER_CLASS}>Assigné</th>
              </tr>
            </thead>
            {displayedGroups.map((group) => (
              <tbody key={group.key || "backlog"}>
                {grouped ? (
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={7}
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
                      canWrite={canWrite}
                      manualOrder={manualOrder}
                      mutationPending={mutationPending}
                    />
                  ))}
                </SortableContext>
              </tbody>
            ))}
          </table>
        </div>
        </DndContext>
      )}
    </section>
  );
}

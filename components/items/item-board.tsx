"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { Calendar, GripVertical, Plus } from "lucide-react";
import { TypeIcon } from "@/components/icons/type-icon";
import { PrioIcon } from "@/components/icons/prio-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { InlinePriority } from "@/components/items/inline-item-field";
import { LabelPill } from "@/components/items/label-pill";
import {
  NewItemButton,
  type NewItemButtonProps,
} from "@/components/items/new-item-dialog";
import { Button } from "@/components/ui/button";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { LABEL_HUES, type ItemKind, type ItemType, type LabelHue, type Priority, type StatusId } from "@/lib/design/constants";
import { KindIcon } from "@/components/icons/kind-icon";
import { StatusDot } from "@/components/icons/status-dot";
import type { moveItemAction as MoveItemAction } from "@/app/actions/items";

export type BoardCard = {
  id: string;
  key: string;
  type: ItemType;
  title: string;
  statusId: string;
  priority: number;
  rank: string;
  assigneeId: string | null;
  parentId: string | null;
  componentId: string | null;
  assigneeName?: string | null;
  subCount?: number;
  /** Label objects attached in T4; rendered as chips in T5. */
  labels?: { id: string; name: string; color: string }[];
  /** True when this item is the target of an unfinished `blocks` link. */
  blocked?: boolean;
  /** Bug or feature classification (orthogonal to hierarchy type). */
  kind?: ItemKind;
  /** Optional due date; rendered in card footer as a short French date. */
  dueDate?: Date | string | null;
};

export type BoardGroup = "assignee" | "priority" | "component" | "parent" | null;

type Status = {
  id: string;
  name: string;
  color: string;
  category: "todo" | "in_progress" | "done";
  order: number;
};
type Columns = Record<string, BoardCard[]>;
export type BoardCreateDialogProps = Pick<
  NewItemButtonProps,
  "backlogId" | "items" | "statuses"
>;

// Column droppable id form: `col:<swimlaneKey>:<statusId>`. The swimlane key is
// "" when the board is ungrouped, so the single-band path flows through the same
// code as the grouped one.
const COL_PREFIX = "col:";
const colId = (swimlane: string, statusId: string) =>
  `${COL_PREFIX}${swimlane}:${statusId}`;
const parseColId = (id: string): { swimlane: string; statusId: string } => {
  const rest = id.slice(COL_PREFIX.length);
  const sep = rest.indexOf(":");
  return { swimlane: rest.slice(0, sep), statusId: rest.slice(sep + 1) };
};

// Swimlane key for a card under the active group dimension.
function swimlaneOf(card: BoardCard, group: BoardGroup): string {
  switch (group) {
    case "assignee":
      return card.assigneeId ?? "none";
    case "priority":
      return String(card.priority);
    case "component":
      return card.componentId ?? "none";
    case "parent":
      return card.parentId ?? "none";
    case null:
      return "";
  }
}

// Partition cards into swimlanes in first-seen order, with the "none" band last.
function partitionSwimlanes(
  items: BoardCard[],
  group: BoardGroup,
): Array<[string, BoardCard[]]> {
  const map = new Map<string, BoardCard[]>();
  for (const c of items) {
    const k = swimlaneOf(c, group);
    (map.get(k) ?? map.set(k, []).get(k)!).push(c);
  }
  const entries = [...map.entries()];
  entries.sort((a, b) => {
    if (a[0] === "none" && b[0] !== "none") return 1;
    if (b[0] === "none" && a[0] !== "none") return -1;
    return 0;
  });
  return entries;
}

function byRank(a: BoardCard, b: BoardCard): number {
  return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0;
}

// Clamp the DB integer priority into the 0..4 union PrioIcon expects.
function asPriority(value: number): Priority {
  return Math.min(4, Math.max(0, value)) as Priority;
}

function visualStatusId(status: Status, statuses: Status[]): StatusId {
  if (status.category === "todo") return "todo";
  if (status.category === "done") return "done";

  const progressStatuses = statuses
    .filter((option) => option.category === "in_progress")
    .sort((a, b) => a.order - b.order);
  return progressStatuses.findIndex((option) => option.id === status.id) <= 0
    ? "doing"
    : "review";
}

// Stable per-name hue so a given assignee always gets the same avatar color.
function hueFor(name: string): LabelHue {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return LABEL_HUES[Math.abs(h) % LABEL_HUES.length]!;
}

// Bucket cards into (swimlane, status) cells, keyed by the column dom id, each
// bucket sorted by rank. When ungrouped, the swimlane key is "" so there is one
// cell per status — identical to the previous single-band layout.
function groupByCell(
  items: BoardCard[],
  statuses: Status[],
  swimlanes: string[],
  group: BoardGroup,
): Columns {
  const cols: Columns = {};
  for (const sw of swimlanes) {
    for (const s of statuses) cols[colId(sw, s.id)] = [];
  }
  for (const c of items) {
    const id = colId(swimlaneOf(c, group), c.statusId);
    (cols[id] ??= []).push(c);
  }
  for (const id of Object.keys(cols)) {
    cols[id]!.sort(byRank);
  }
  return cols;
}

// Find which column (dom id) a card currently lives in, given a snapshot.
function findColumn(cols: Columns, cardId: string): string | null {
  for (const [id, cards] of Object.entries(cols)) {
    if (cards.some((c) => c.id === cardId)) return id;
  }
  return null;
}

function SortableCard({
  card,
  colDomId,
  swimlane,
  backlogKey,
  onOpen,
}: {
  card: BoardCard;
  colDomId: string;
  swimlane: string;
  backlogKey: string;
  onOpen: (key: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: "card", columnId: colDomId, swimlane },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        padding: "var(--card-pad)",
      }}
      onClick={() => onOpen(card.key)}
      className="cursor-pointer rounded-[var(--radius-md)] border border-border bg-[var(--surface)] shadow-[var(--shadow-xs)]"
    >
      <CardInner
        card={card}
        backlogKey={backlogKey}
        dragHandle={
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            aria-label={`Déplacer ${card.key}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex size-6 flex-none cursor-grab items-center justify-center rounded text-muted-foreground outline-none hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:cursor-grabbing"
          >
            <GripVertical aria-hidden size={14} />
          </button>
        }
        onOpen={() => onOpen(card.key)}
      />
    </div>
  );
}

/** Format a due date as a short French date: "12 juin". */
function formatDueDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// Visual body shared by sortable cards and the drag overlay.
function CardInner({
  card,
  backlogKey,
  interactivePriority = true,
  dragHandle,
  onOpen,
}: {
  card: BoardCard;
  backlogKey: string;
  interactivePriority?: boolean;
  dragHandle?: ReactNode;
  onOpen?: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        {dragHandle}
        {onOpen ? (
          <button
            type="button"
            aria-label={`${card.key} — ${card.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            className="inline-flex min-w-0 items-center gap-1.5 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <TypeIcon type={card.type} size={14} />
            <ItemKey value={card.key} />
            {card.kind && <KindIcon kind={card.kind} />}
          </button>
        ) : (
          <>
            <TypeIcon type={card.type} size={14} />
            <ItemKey value={card.key} />
            {card.kind && <KindIcon kind={card.kind} />}
          </>
        )}
        <span className="ml-auto">
          {interactivePriority ? (
            <InlinePriority
              itemId={card.id}
              backlogKey={backlogKey}
              priority={card.priority}
            />
          ) : (
            <PrioIcon priority={asPriority(card.priority)} />
          )}
        </span>
      </div>
      <p
        className="mt-1.5 text-[13px] font-medium"
        style={{ textWrap: "pretty", lineHeight: 1.42 }}
      >
        {card.title}
      </p>
      {card.labels && card.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <LabelPill key={label.id} name={label.name} color={label.color} />
          ))}
        </div>
      )}
      {card.blocked && (
        <div className="mt-1.5">
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{
              color: "var(--danger)",
              background: "color-mix(in oklch, var(--danger) 14%, transparent)",
            }}
          >
            bloqué
          </span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        {/* Left cluster: due date + subtask count */}
        <span className="inline-flex items-center gap-1.5">
          {card.dueDate && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <Calendar size={12} />
              {formatDueDate(card.dueDate)}
            </span>
          )}
          {card.subCount && card.subCount > 0 ? (
            <span className="item-key inline-flex items-center gap-1">
              {`⌐ ${card.subCount}`}
            </span>
          ) : null}
        </span>
        {/* Right: assignee avatar */}
        {card.assigneeName ? (
          <InitialsAvatar name={card.assigneeName} hue={hueFor(card.assigneeName)} size={22} />
        ) : (
          <span
            aria-hidden
            className="size-[22px] rounded-full"
            style={{ border: "1.5px dashed var(--border-strong)" }}
          />
        )}
      </div>
    </>
  );
}

function Column({
  status,
  colDomId,
  swimlane,
  cards,
  statusDomain,
  backlogKey,
  createDialogProps,
  isOver,
  onOpen,
}: {
  status: Status;
  colDomId: string;
  swimlane: string;
  cards: BoardCard[];
  statusDomain: Status[];
  backlogKey: string;
  createDialogProps: BoardCreateDialogProps;
  isOver: boolean;
  onOpen: (key: string) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: colDomId,
    data: { type: "column", columnId: colDomId, swimlane, statusId: status.id },
  });

  return (
    <div className="flex w-[296px] flex-none flex-col rounded-[var(--radius-lg)] border border-border bg-[var(--surface-2)]">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <StatusDot status={visualStatusId(status, statusDomain)} size={14} />
        <span className="text-[13px] font-medium">{status.name}</span>
        <span className="item-key ml-auto rounded-[var(--radius-sm)] bg-[var(--surface)] px-1.5 py-0.5">
          {cards.length}
        </span>
        <NewItemButton
          {...createDialogProps}
          backlogKey={backlogKey}
          initialStatusId={status.id}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Créer dans ${status.name}`}
            >
              <Plus />
            </Button>
          }
        />
      </div>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className="flex min-h-[60px] flex-1 flex-col gap-2 rounded-b-[var(--radius-lg)] p-2 transition-colors"
          style={
            isOver
              ? { background: "var(--accent-subtle)", boxShadow: "inset 0 0 0 1.5px var(--primary)" }
              : undefined
          }
        >
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              colDomId={colDomId}
              swimlane={swimlane}
              backlogKey={backlogKey}
              onOpen={onOpen}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function ItemBoard({
  backlogKey,
  items,
  statuses,
  statusDomain,
  group,
  groupLabels,
  moveItemAction,
  createDialogProps,
}: {
  backlogKey: string;
  items: BoardCard[];
  /** Complete fixed status domain; `statuses` may be a filtered visible subset. */
  statusDomain: Status[];
  statuses: Status[];
  group: BoardGroup;
  groupLabels: Record<string, string>;
  moveItemAction: typeof MoveItemAction;
  createDialogProps: BoardCreateDialogProps;
}) {
  const viewUrl = useViewUrlState();
  const dndId = useId();
  // Swimlane bands in first-seen order ("none" last). When ungrouped, a single
  // band keyed "" reproduces the original layout exactly.
  const swimlanes = useMemo(
    () => (group === null ? [""] : partitionSwimlanes(items, group).map(([k]) => k)),
    [items, group],
  );
  const [columns, setColumns] = useState<Columns>(() =>
    groupByCell(items, statuses, swimlanes, group),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  // The full column dom id currently hovered (used for the drop highlight).
  const [overColId, setOverColId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snapshot = useRef<Columns | null>(null);
  const pending = useRef(0);

  // Issue 2 (re-seed race): only accept fresh server props when no drag is
  // active and nothing is in flight — otherwise a mid-drag revalidate would
  // clobber the optimistic state.
  useEffect(() => {
    if (activeId === null && pending.current === 0) {
      setColumns(groupByCell(items, statuses, swimlanes, group));
    }
  }, [items, statuses, swimlanes, group, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeCard = activeId
    ? (Object.values(columns).flat().find((c) => c.id === activeId) ?? null)
    : null;

  const openItem = (key: string) => {
    viewUrl.push((params) => params.set("item", key));
  };

  function onDragStart(event: DragStartEvent) {
    snapshot.current = columns;
    setError(null);
    const id = String(event.active.id);
    setActiveId(id);
    setOverColId(findColumn(columns, id));
  }

  // onDragOver is the SOLE mutator of cross-column membership (placeholder jump).
  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeIdStr = String(active.id);
    const fromCol = (active.data.current?.columnId as string | undefined) ?? findColumn(columns, activeIdStr);
    const overData = over.data.current as
      | { type?: string; columnId?: string }
      | undefined;
    const toCol =
      overData?.type === "column"
        ? String(over.id)
        : (overData?.columnId ?? findColumn(columns, String(over.id)));
    if (!fromCol || !toCol) return;
    // Swimlanes are display-only: a drop is only valid within the card's own
    // lane. Reject cross-lane targets (leave state untouched so it snaps back).
    if (parseColId(fromCol).swimlane !== parseColId(toCol).swimlane) return;
    setOverColId(toCol);
    if (fromCol === toCol) return;

    setColumns((prev) => {
      const fromCards = prev[fromCol] ?? [];
      const toCards = prev[toCol] ?? [];
      const moving = fromCards.find((c) => c.id === activeIdStr);
      if (!moving) return prev;

      // Insert before the hovered card (or append if hovering the column body).
      let insertAt = toCards.length;
      if (overData?.type !== "column") {
        const overIdx = toCards.findIndex((c) => c.id === String(over.id));
        if (overIdx !== -1) insertAt = overIdx;
      }
      const nextTo = [...toCards];
      nextTo.splice(insertAt, 0, { ...moving, statusId: parseColId(toCol).statusId });
      return {
        ...prev,
        [fromCol]: fromCards.filter((c) => c.id !== activeIdStr),
        [toCol]: nextTo,
      };
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeIdStr = String(active.id);
    setActiveId(null);
    setOverColId(null);

    if (!over) {
      // Dropped outside any droppable — restore the pre-drag baseline.
      if (snapshot.current) setColumns(snapshot.current);
      return;
    }

    const base = snapshot.current;
    const toCol = findColumn(columns, activeIdStr);
    if (!toCol || !base) return;
    const fromCol = findColumn(base, activeIdStr);
    // A status change means the (lane-namespaced) status portion changed. Same
    // lane is guaranteed by the onDragOver guard, so comparing statusId here is
    // equivalent to comparing column ids but reads as the true intent.
    const toStatusId = parseColId(toCol).statusId;
    const movedCols = fromCol === null || parseColId(fromCol).statusId !== toStatusId;

    // Reorder within the target column to land at the over position.
    let finalCols = columns;
    const overData = over.data.current as { type?: string; columnId?: string } | undefined;
    if (overData?.type !== "column") {
      const colCards = columns[toCol] ?? [];
      const oldIdx = colCards.findIndex((c) => c.id === activeIdStr);
      const newIdx = colCards.findIndex((c) => c.id === String(over.id));
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        const next = [...colCards];
        const [moved] = next.splice(oldIdx, 1);
        next.splice(newIdx, 0, moved!);
        finalCols = { ...columns, [toCol]: next };
        setColumns(finalCols);
      }
    }

    const colCards = finalCols[toCol] ?? [];
    const idx = colCards.findIndex((c) => c.id === activeIdStr);
    if (idx === -1) return;
    const before = idx > 0 ? colCards[idx - 1]! : null;
    const after = idx < colCards.length - 1 ? colCards[idx + 1]! : null;

    // CLIENT no-op guard: same column AND neighbors unchanged vs the snapshot.
    if (!movedCols) {
      const baseCards = base[toCol] ?? [];
      const baseIdx = baseCards.findIndex((c) => c.id === activeIdStr);
      const baseBefore = baseIdx > 0 ? baseCards[baseIdx - 1]!.id : null;
      const baseAfter = baseIdx < baseCards.length - 1 ? baseCards[baseIdx + 1]!.id : null;
      if (baseBefore === (before?.id ?? null) && baseAfter === (after?.id ?? null)) {
        return;
      }
    }

    // Optimistic visual rank for instant placement; server re-derives the true rank.
    const optimisticRank = generateKeyBetween(before?.rank ?? null, after?.rank ?? null);
    setColumns((prev) => ({
      ...prev,
      [toCol]: (prev[toCol] ?? []).map((c) =>
        c.id === activeIdStr ? { ...c, rank: optimisticRank, statusId: toStatusId } : c,
      ),
    }));

    void commit({
      id: activeIdStr,
      toStatusId,
      movedCols,
      beforeId: before?.id ?? null,
      afterId: after?.id ?? null,
    });
  }

  async function commit(args: {
    id: string;
    toStatusId: string;
    movedCols: boolean;
    beforeId: string | null;
    afterId: string | null;
  }) {
    pending.current++;
    try {
      const res = await moveItemAction({
        backlogKey,
        id: args.id,
        statusId: args.movedCols ? args.toStatusId : undefined,
        beforeId: args.beforeId,
        afterId: args.afterId,
      });
      if (!res.ok) {
        if (snapshot.current) setColumns(snapshot.current);
        setError(res.error);
      }
    } catch {
      if (snapshot.current) setColumns(snapshot.current);
      setError("Déplacement impossible.");
    } finally {
      pending.current--;
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-[var(--radius-md)] px-3 py-2 text-[13px] text-white"
          style={{ background: "var(--danger)" }}
        >
          {error}
        </div>
      )}
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex-1 overflow-x-auto p-4">
          {group === null ? (
            <div className="flex h-full items-start gap-3">
              {statuses.map((status) => {
                const id = colId("", status.id);
                return (
                  <Column
                    key={id}
                    status={status}
                    colDomId={id}
                    swimlane=""
                    cards={columns[id] ?? []}
                    statusDomain={statusDomain}
                    backlogKey={backlogKey}
                    createDialogProps={createDialogProps}
                    isOver={activeId !== null && overColId === id}
                    onOpen={openItem}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {swimlanes.map((sw) => (
                <div key={sw}>
                  <div className="px-1 py-1 text-xs font-medium text-muted-foreground">
                    {groupLabels[sw] ?? sw}
                  </div>
                  <div className="flex items-start gap-3">
                    {statuses.map((status) => {
                      const id = colId(sw, status.id);
                      return (
                        <Column
                          key={id}
                          status={status}
                          colDomId={id}
                          swimlane={sw}
                          cards={columns[id] ?? []}
                          statusDomain={statusDomain}
                          backlogKey={backlogKey}
                          createDialogProps={createDialogProps}
                          isOver={activeId !== null && overColId === id}
                          onOpen={openItem}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DragOverlay modifiers={[restrictToWindowEdges]}>
          {activeCard ? (
            <div
              className="rounded-[var(--radius-md)] border border-border bg-[var(--surface)] shadow-[var(--shadow-md)]"
              style={{ transform: "rotate(2deg)", width: 280, padding: "var(--card-pad)" }}
            >
              <CardInner
                card={activeCard}
                backlogKey={backlogKey}
                interactivePriority={false}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

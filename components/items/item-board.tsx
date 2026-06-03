"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { TypeIcon } from "@/components/icons/type-icon";
import { PrioIcon } from "@/components/icons/prio-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { LABEL_HUES, type ItemType, type LabelHue, type Priority } from "@/lib/design/constants";
import type { moveItemAction as MoveItemAction } from "@/app/actions/items";

export type BoardCard = {
  id: string;
  key: string;
  type: ItemType;
  title: string;
  statusId: string;
  priority: number;
  rank: string;
  assigneeName?: string | null;
  subCount?: number;
};

type Status = { id: string; name: string; color: string; category: string };
type Columns = Record<string, BoardCard[]>;

const COL_PREFIX = "col:";

// Clamp the DB integer priority into the 0..4 union PrioIcon expects.
function asPriority(value: number): Priority {
  return Math.min(4, Math.max(0, value)) as Priority;
}

// Stable per-name hue so a given assignee always gets the same avatar color.
function hueFor(name: string): LabelHue {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return LABEL_HUES[Math.abs(h) % LABEL_HUES.length]!;
}

// Bucket cards by status, each bucket sorted by rank lexicographically.
function groupByStatus(items: BoardCard[], statuses: Status[]): Columns {
  const cols: Columns = {};
  for (const s of statuses) cols[s.id] = [];
  for (const c of items) {
    (cols[c.statusId] ??= []).push(c);
  }
  for (const id of Object.keys(cols)) {
    cols[id]!.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
  }
  return cols;
}

function stripPrefix(id: string): string {
  return id.startsWith(COL_PREFIX) ? id.slice(COL_PREFIX.length) : id;
}

// Find which column a card id currently lives in, given a columns snapshot.
function findColumn(cols: Columns, cardId: string): string | null {
  for (const [colId, cards] of Object.entries(cols)) {
    if (cards.some((c) => c.id === cardId)) return colId;
  }
  return null;
}

function SortableCard({
  card,
  backlogKey,
  onOpen,
}: {
  card: BoardCard;
  backlogKey: string;
  onOpen: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", columnId: card.statusId },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card.key)}
      className="cursor-grab rounded-[var(--radius-md)] border border-border bg-[var(--surface)] p-3 shadow-[var(--shadow-xs)] active:cursor-grabbing"
      role="button"
      tabIndex={0}
      aria-label={`${card.key} — ${card.title}`}
    >
      <CardInner card={card} backlogKey={backlogKey} />
    </div>
  );
}

// Visual body shared by sortable cards and the drag overlay.
function CardInner({ card }: { card: BoardCard; backlogKey: string }) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <TypeIcon type={card.type} size={14} />
        <ItemKey value={card.key} />
        <span className="ml-auto">
          <PrioIcon priority={asPriority(card.priority)} />
        </span>
      </div>
      <p className="mt-1.5 text-[13px] leading-snug" style={{ textWrap: "pretty" }}>
        {card.title}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="item-key inline-flex items-center gap-1">
          {card.subCount && card.subCount > 0 ? `${card.subCount} sous-item${card.subCount > 1 ? "s" : ""}` : ""}
        </span>
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
  cards,
  backlogKey,
  isOver,
  onOpen,
}: {
  status: Status;
  cards: BoardCard[];
  backlogKey: string;
  isOver: boolean;
  onOpen: (key: string) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `${COL_PREFIX}${status.id}`,
    data: { type: "column", columnId: status.id },
  });

  return (
    <div className="flex w-[296px] flex-none flex-col rounded-[var(--radius-lg)] border border-border bg-[var(--surface-2)]">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          aria-hidden
          className="size-2.5 flex-none rounded-full"
          style={{ background: status.color }}
        />
        <span className="text-[13px] font-medium">{status.name}</span>
        <span className="item-key ml-auto rounded-[var(--radius-sm)] bg-[var(--surface)] px-1.5 py-0.5">
          {cards.length}
        </span>
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
            <SortableCard key={card.id} card={card} backlogKey={backlogKey} onOpen={onOpen} />
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
  moveItemAction,
}: {
  backlogKey: string;
  items: BoardCard[];
  statuses: Status[];
  moveItemAction: typeof MoveItemAction;
}) {
  const router = useRouter();
  const dndId = useId();
  const [columns, setColumns] = useState<Columns>(() => groupByStatus(items, statuses));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snapshot = useRef<Columns | null>(null);
  const pending = useRef(0);

  // Issue 2 (re-seed race): only accept fresh server props when no drag is
  // active and nothing is in flight — otherwise a mid-drag revalidate would
  // clobber the optimistic state.
  useEffect(() => {
    if (activeId === null && pending.current === 0) {
      setColumns(groupByStatus(items, statuses));
    }
  }, [items, statuses, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeCard = activeId
    ? (Object.values(columns).flat().find((c) => c.id === activeId) ?? null)
    : null;

  const openItem = (key: string) => {
    router.push(`/b/${backlogKey}?item=${key}&view=board`);
  };

  function onDragStart(event: DragStartEvent) {
    snapshot.current = columns;
    setError(null);
    const id = String(event.active.id);
    setActiveId(id);
    setOverColumn(findColumn(columns, id));
  }

  // onDragOver is the SOLE mutator of cross-column membership (placeholder jump).
  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeIdStr = String(active.id);
    const fromCol = (active.data.current?.columnId as string | undefined) ?? findColumn(columns, activeIdStr);
    const overData = over.data.current as { type?: string; columnId?: string } | undefined;
    const toCol =
      overData?.type === "column" ? stripPrefix(String(over.id)) : (overData?.columnId ?? findColumn(columns, String(over.id)));
    if (!fromCol || !toCol) return;
    setOverColumn(toCol);
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
      nextTo.splice(insertAt, 0, { ...moving, statusId: toCol });
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
    setOverColumn(null);

    if (!over) {
      // Dropped outside any droppable — restore the pre-drag baseline.
      if (snapshot.current) setColumns(snapshot.current);
      return;
    }

    const base = snapshot.current;
    const toCol = findColumn(columns, activeIdStr);
    if (!toCol || !base) return;
    const fromCol = findColumn(base, activeIdStr);
    const movedCols = fromCol !== toCol;

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
        c.id === activeIdStr ? { ...c, rank: optimisticRank, statusId: toCol } : c,
      ),
    }));

    void commit({
      id: activeIdStr,
      toCol,
      movedCols,
      beforeId: before?.id ?? null,
      afterId: after?.id ?? null,
    });
  }

  async function commit(args: {
    id: string;
    toCol: string;
    movedCols: boolean;
    beforeId: string | null;
    afterId: string | null;
  }) {
    pending.current++;
    try {
      const res = await moveItemAction({
        backlogKey,
        id: args.id,
        statusId: args.movedCols ? args.toCol : undefined,
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
          <div className="flex h-full items-start gap-3">
            {statuses.map((status) => (
              <Column
                key={status.id}
                status={status}
                cards={columns[status.id] ?? []}
                backlogKey={backlogKey}
                isOver={activeId !== null && overColumn === status.id}
                onOpen={openItem}
              />
            ))}
          </div>
        </div>
        <DragOverlay modifiers={[restrictToWindowEdges]}>
          {activeCard ? (
            <div
              className="rounded-[var(--radius-md)] border border-border bg-[var(--surface)] p-3 shadow-[var(--shadow-md)]"
              style={{ transform: "rotate(2deg)", width: 280 }}
            >
              <CardInner card={activeCard} backlogKey={backlogKey} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

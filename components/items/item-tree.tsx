"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { TypeIcon } from "@/components/icons/type-icon";
import { PrioIcon } from "@/components/icons/prio-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { LABEL_HUES, type ItemType, type LabelHue, type Priority } from "@/lib/design/constants";
import type {
  moveItemAction as MoveItemAction,
  reparentItemAction as ReparentItemAction,
} from "@/app/actions/items";

export type TreeItem = {
  id: string;
  key: string;
  type: ItemType;
  title: string;
  parentId: string | null;
  statusId: string;
  priority: number;
  depth: number;
  rank: string;
  path: string;
  assigneeName?: string | null;
};

type StatusMap = Record<string, { name: string; color: string }>;
type Zone = "before" | "into" | "after";
type Target = { id: string; zone: Zone };

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

type TreeNode = TreeItem & { children: TreeNode[] };

// Build the nested tree from the flat list: group by parentId, null bucket = roots,
// each level sorted lexicographically by rank.
function buildTree(items: TreeItem[]): TreeNode[] {
  const byParent = new Map<string | null, TreeItem[]>();
  for (const it of items) {
    const key = it.parentId ?? null;
    (byParent.get(key) ?? byParent.set(key, []).get(key)!).push(it);
  }
  const sortRank = (a: TreeItem, b: TreeItem) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);
  const build = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort(sortRank)
      .map((it) => ({ ...it, children: build(it.id) }));
  return build(null);
}

// Authoritative descendant test from the ltree `path` column: D is a descendant of N
// iff D.path starts with N.path + "." (path is self-inclusive, so N itself is excluded).
function descendantIds(items: TreeItem[], dragId: string): Set<string> {
  const node = items.find((i) => i.id === dragId);
  const set = new Set<string>();
  if (!node) return set;
  const prefix = node.path + ".";
  for (const i of items) {
    if (i.path.startsWith(prefix)) set.add(i.id);
  }
  return set;
}

// Live children of a parent (excluding the dragged node), sorted by rank.
function liveChildren(items: TreeItem[], parentId: string | null, excludeId: string): TreeItem[] {
  return items
    .filter((i) => (i.parentId ?? null) === (parentId ?? null) && i.id !== excludeId)
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
}

// Optimistic local move: re-point the dragged node's parentId. The server reconciles
// the true rank/path on revalidate; we keep the parent change so the indent updates.
function optimisticMove(items: TreeItem[], dragId: string, newParentId: string | null): TreeItem[] {
  return items.map((i) => (i.id === dragId ? { ...i, parentId: newParentId } : i));
}

// Fresh copy of the server-provided rows (defensive: never mutate props).
function seed(items: TreeItem[]): TreeItem[] {
  return items.map((i) => ({ ...i }));
}

function StatusDot({ status }: { status?: { name: string; color: string } }) {
  return (
    <span
      aria-hidden
      className="size-2 flex-none rounded-full"
      style={{ background: status?.color ?? "var(--border-strong)" }}
      title={status?.name}
    />
  );
}

export function ItemTree({
  backlogKey,
  items,
  selectedKey,
  statuses = {},
  reparentItemAction,
  moveItemAction,
}: {
  backlogKey: string;
  items: TreeItem[];
  selectedKey?: string;
  statuses?: StatusMap;
  reparentItemAction: typeof ReparentItemAction;
  moveItemAction: typeof MoveItemAction;
}) {
  const router = useRouter();
  const [treeItems, setTreeItems] = useState<TreeItem[]>(() => seed(items));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped whenever the last in-flight commit settles, so the gated re-seed
  // effect re-runs against the freshest server props (a ref decrement alone
  // schedules no render).
  const [settledTick, setSettledTick] = useState(0);
  const dragDescendants = useRef<Set<string>>(new Set());
  const pending = useRef(0);
  // Monotonic commit id: only the latest commit may roll back or surface an
  // error, so a superseded older commit cannot clobber newer optimistic state.
  const seq = useRef(0);

  // Re-seed from fresh server props only when no drag is active and nothing is
  // in flight, so a mid-drag revalidate cannot clobber the optimistic state.
  useEffect(() => {
    if (dragId === null && pending.current === 0) {
      setTreeItems(seed(items));
    }
  }, [items, dragId, settledTick]);

  const roots = buildTree(treeItems);

  function onDragStart(e: DragEvent<HTMLDivElement>, item: TreeItem) {
    setDragId(item.id);
    setError(null);
    dragDescendants.current = descendantIds(treeItems, item.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);
  }

  function onDragEnd() {
    setDragId(null);
    setTarget(null);
    dragDescendants.current = new Set();
  }

  function onDragOver(e: DragEvent<HTMLDivElement>, row: TreeItem) {
    e.preventDefault();
    if (dragId === null) return;
    // Dropping a node onto itself or into its own subtree would create a cycle.
    // Surface a "no-drop" cursor and clear any stale indicator instead of failing
    // silently, so the disallowed target reads as disabled rather than broken (the
    // SERVER cycle guard is the real enforcement).
    if (dragId === row.id || dragDescendants.current.has(row.id)) {
      e.dataTransfer.dropEffect = "none";
      if (target !== null) setTarget(null);
      return;
    }
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const zone: Zone = y < rect.height * 0.28 ? "before" : y > rect.height * 0.72 ? "after" : "into";
    setTarget({ id: row.id, zone });
  }

  function onDrop(e: DragEvent<HTMLDivElement>, targetId: string, zone: Zone) {
    e.preventDefault();
    const id = dragId;
    if (id === null || id === targetId || dragDescendants.current.has(targetId)) {
      onDragEnd();
      return;
    }
    const base = treeItems;
    const dragNode = base.find((i) => i.id === id);
    const targetNode = base.find((i) => i.id === targetId);
    if (!dragNode || !targetNode) {
      onDragEnd();
      return;
    }

    let newParentId: string | null;
    let beforeId: string | null;
    let afterId: string | null;

    if (zone === "into") {
      newParentId = targetNode.id;
      const kids = liveChildren(base, targetNode.id, id);
      beforeId = kids.length > 0 ? kids[kids.length - 1]!.id : null; // append as last child
      afterId = null;
    } else {
      newParentId = targetNode.parentId;
      const sibs = liveChildren(base, targetNode.parentId, id);
      const ti = sibs.findIndex((s) => s.id === targetNode.id);
      if (zone === "before") {
        beforeId = ti > 0 ? sibs[ti - 1]!.id : null;
        afterId = targetNode.id;
      } else {
        beforeId = targetNode.id;
        afterId = ti >= 0 && ti < sibs.length - 1 ? sibs[ti + 1]!.id : null;
      }
    }

    const sameParent = (newParentId ?? null) === (dragNode.parentId ?? null);

    // Optimistic update; `base` is this commit's own pre-image for rollback.
    setTreeItems(optimisticMove(base, id, newParentId));
    onDragEnd();

    void commit({ id, newParentId, beforeId, afterId, sameParent, base });
  }

  async function commit(args: {
    id: string;
    newParentId: string | null;
    beforeId: string | null;
    afterId: string | null;
    sameParent: boolean;
    base: TreeItem[];
  }) {
    const mySeq = ++seq.current;
    pending.current++;
    try {
      // R7 routing: same-parent reorder → moveItemAction (rank only); else reparent.
      const res = args.sameParent
        ? await moveItemAction({
            backlogKey,
            id: args.id,
            beforeId: args.beforeId,
            afterId: args.afterId,
          })
        : await reparentItemAction({
            backlogKey,
            id: args.id,
            newParentId: args.newParentId,
            beforeId: args.beforeId,
            afterId: args.afterId,
          });
      // Only the latest commit reconciles UI state; a superseded older commit
      // must not roll back over (or error on) newer optimistic state.
      if (mySeq !== seq.current) return;
      if (res.ok) {
        setError(null);
      } else {
        setTreeItems(args.base);
        setError(res.error);
      }
    } catch {
      if (mySeq === seq.current) {
        setTreeItems(args.base);
        setError("Déplacement impossible.");
      }
    } finally {
      pending.current--;
      // A bare ref decrement schedules no render; bump state so the gated
      // re-seed effect re-runs and applies the freshest server props.
      if (pending.current === 0) setSettledTick((t) => t + 1);
    }
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openItem(key: string) {
    router.push(`/b/${backlogKey}?item=${key}&view=tree`);
  }

  function renderNode(node: TreeNode): React.ReactNode {
    const hasKids = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const isSelected = node.key === selectedKey;
    const isTarget = target?.id === node.id;
    const zone = isTarget ? target.zone : null;

    return (
      <div key={node.id}>
        <div
          draggable
          onDragStart={(e) => onDragStart(e, node)}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, node)}
          onDrop={(e) => onDrop(e, node.id, zone ?? "into")}
          onClick={() => openItem(node.key)}
          onKeyDown={(e) => {
            // Only the row itself activates; let the chevron button handle its own keys.
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openItem(node.key);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={`${node.key} — ${node.title}`}
          className={`group relative flex cursor-grab items-center gap-2 py-1.5 pr-3 text-sm transition-colors active:cursor-grabbing ${
            isSelected ? "bg-[var(--accent-subtle)]" : "hover:bg-muted/50"
          }`}
          style={{
            paddingLeft: 8 + node.depth * 20,
            opacity: dragId === node.id ? 0.4 : 1,
            boxShadow: zone === "into" ? "inset 0 0 0 1.5px var(--ring)" : undefined,
            background: zone === "into" ? "var(--accent-subtle)" : undefined,
            borderTop: zone === "before" ? "2px solid var(--ring)" : "2px solid transparent",
            borderBottom: zone === "after" ? "2px solid var(--ring)" : "2px solid transparent",
          }}
        >
          <button
            type="button"
            aria-label={hasKids ? (isCollapsed ? "Déplier" : "Replier") : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (hasKids) toggleCollapse(node.id);
            }}
            className="grid size-4 flex-none place-items-center text-muted-foreground"
            style={{ visibility: hasKids ? "visible" : "hidden" }}
            tabIndex={hasKids ? 0 : -1}
          >
            <ChevronRight
              size={13}
              className="transition-transform"
              style={{ transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}
            />
          </button>
          <TypeIcon type={node.type} />
          <ItemKey value={node.key} />
          <span className="min-w-0 flex-1 truncate">{node.title}</span>
          <span className="flex flex-none items-center gap-2">
            <PrioIcon priority={asPriority(node.priority)} />
            <StatusDot status={statuses[node.statusId]} />
            {node.assigneeName ? (
              <InitialsAvatar name={node.assigneeName} hue={hueFor(node.assigneeName)} size={20} />
            ) : (
              <span
                aria-hidden
                className="size-5 flex-none rounded-full"
                style={{ border: "1.5px dashed var(--border-strong)" }}
              />
            )}
          </span>
        </div>
        {hasKids && !isCollapsed && node.children.map((child) => renderNode(child))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-10 text-center">
        <p className="t-sm text-muted-foreground">Aucun item — créez-en un.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2 text-[13px] text-white"
          style={{ background: "var(--danger)" }}
        >
          <span>{error}</span>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setError(null)}
            className="flex-none rounded px-1 leading-none opacity-80 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex-1 overflow-auto py-1">{roots.map((node) => renderNode(node))}</div>
    </div>
  );
}

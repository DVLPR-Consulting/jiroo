"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { ChevronRight, Inbox, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  loadTreeChildrenAction,
  loadTreeMatchesAction,
  type LoadTreeChildrenResult,
  type LoadTreeMatchesResult,
} from "@/app/actions/tree-window";
import {
  TREE_RELOAD_LIMIT,
  TREE_RELOAD_PARENTS,
  TREE_WINDOW_SIZE,
  type TreeChildrenWindow,
  type TreeMatchCursor,
} from "@/lib/items/tree-window";
import { LOAD_MORE_SHORTCUT_EVENT, moveShortcutFocus } from "@/lib/shortcuts/list-navigation";
import { TypeIcon } from "@/components/icons/type-icon";
import { PrioIcon } from "@/components/icons/prio-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { LabelPill } from "@/components/items/label-pill";
import {
  NewItemButton,
  type NewItemButtonProps,
} from "@/components/items/new-item-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ViewStartGuide } from "@/components/items/backlog-start-guide";
import type { HierarchyStartStep } from "@/lib/tree/hierarchy";
import { LABEL_HUES, type ItemType, type LabelHue, type Priority, type StatusId } from "@/lib/design/constants";
import { StatusDot as CanonicalStatusDot } from "@/components/icons/status-dot";
import {
  useRequestedItemKey,
  useViewUrlState,
} from "@/components/shell/view-url-state";
import type {
  moveItemAction as MoveItemAction,
  reparentItemAction as ReparentItemAction,
} from "@/app/actions/items";
import type { ItemCapabilities, PlanningCapabilities } from "@/lib/auth/capabilities";

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
  labels: LabelChip[];
  assigneeId: string | null;
  assigneeName?: string | null;
  /**
   * The live children the row has, loaded or not (JIR-147): a parent with
   * more children than loaded reads them when it is unfolded. Absent with a
   * filter, or when every child is in `items`.
   */
  childCount?: number;
};

const LOAD_FAILED = "Impossible de charger la suite. Réessayez avec « Charger la suite ».";

/** Rows served by a window replace the ones the tree had; the others stay. */
function mergeRows(rows: TreeItem[], served: TreeItem[]): TreeItem[] {
  const byId = new Map(served.map((row) => [row.id, row]));
  const kept = rows.map((row) => byId.get(row.id) ?? row);
  const known = new Set(rows.map((row) => row.id));
  return [...kept, ...served.filter((row) => !known.has(row.id))];
}

/** A served row without its window-only fields. */
function asTreeItem<T extends TreeItem>(row: T & { matched?: boolean }): TreeItem {
  const { matched, ...item } = row;
  void matched;
  return item;
}

type LabelChip = { id: string; name: string; color: string };
type StatusOption = {
  id: string;
  name: string;
  color: string;
  category: "todo" | "in_progress" | "done";
  order: number;
};
type Zone = "before" | "into" | "after";
type Target = { id: string; zone: Zone };

// Clamp the DB integer priority into the 0..4 union PrioIcon expects.
function asPriority(value: number): Priority {
  return Math.min(4, Math.max(0, value)) as Priority;
}

// Stable per-id hue so an assignee keeps the same avatar color if their name changes.
function hueFor(value: string): LabelHue {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return LABEL_HUES[Math.abs(h) % LABEL_HUES.length]!;
}

function visualStatusId(status: StatusOption, statuses: StatusOption[]): StatusId {
  if (status.category === "todo") return "todo";
  if (status.category === "done") return "done";

  // Backlogs own a fixed ordered pair of in-progress statuses. Their UUIDs
  // differ per backlog, so domain order distinguishes doing from review.
  const progressStatuses = statuses
    .filter((option) => option.category === "in_progress")
    .sort((a, b) => a.order - b.order);
  return progressStatuses.findIndex((option) => option.id === status.id) <= 0
    ? "doing"
    : "review";
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
// The parents' child counts follow, so a folded new parent still unfolds to read its
// children (JIR-147).
function optimisticMove(items: TreeItem[], dragId: string, newParentId: string | null): TreeItem[] {
  const oldParentId = items.find((i) => i.id === dragId)?.parentId ?? null;
  if (oldParentId === newParentId) return items;
  const shift = (i: TreeItem, by: number) =>
    i.childCount === undefined ? i : { ...i, childCount: Math.max(0, i.childCount + by) };
  return items.map((i) => {
    if (i.id === dragId) return { ...i, parentId: newParentId };
    if (i.id === oldParentId) return shift(i, -1);
    if (i.id === newParentId) return shift(i, 1);
    return i;
  });
}

// Fresh copy of the server-provided rows (defensive: never mutate props).
function seed(items: TreeItem[]): TreeItem[] {
  return items.map((i) => ({ ...i }));
}

function StatusDotLocal({
  statusId,
  statuses,
}: {
  statusId: string;
  statuses: StatusOption[];
}) {
  const status = statuses.find((option) => option.id === statusId);
  return status ? <CanonicalStatusDot status={visualStatusId(status, statuses)} /> : null;
}

type ItemTreeProps = {
  backlogKey: string;
  items: TreeItem[];
  statuses: StatusOption[];
  contextIds?: string[];
  reparentItemAction: typeof ReparentItemAction;
  moveItemAction: typeof MoveItemAction;
  filtersActive?: boolean;
  hasItems?: boolean;
  /**
   * The level the live, unfiltered backlog still needs before tasks
   * (JIR-88); computed by the server, never from filtered rows.
   */
  startStep?: HierarchyStartStep | null;
  clearFiltersHref?: string;
  createDialogProps?: Pick<NewItemButtonProps, "backlogId" | "structure" | "statuses" | "canScheduleItems" | "releaseOptions" | "fieldOptions" | "viewFilters" | "templates">;
  canCreateItems?: boolean;
  canScheduleItems?: boolean;
  itemCapabilities?: ItemCapabilities;
  planningCapabilities?: PlanningCapabilities;
  /**
   * With a filter (JIR-147): the matches of the first window `items` holds,
   * out of `total`, and where the next window starts.
   */
  window?: { total: number; nextCursor: TreeMatchCursor | null } | null;
  /** The effective view state as view URL parameters, for the next matches. */
  viewStateQuery?: string;
  loadChildren?: typeof loadTreeChildrenAction;
  loadMatches?: typeof loadTreeMatchesAction;
};

export function ItemTree({
  backlogKey,
  items,
  statuses,
  contextIds = [],
  reparentItemAction,
  moveItemAction,
  filtersActive = false,
  hasItems,
  startStep = null,
  clearFiltersHref,
  createDialogProps,
  canCreateItems: legacyCanCreateItems = true,
  canScheduleItems: legacyCanScheduleItems = true,
  itemCapabilities,
  planningCapabilities,
  window: matchWindow = null,
  viewStateQuery,
  loadChildren = loadTreeChildrenAction,
  loadMatches = loadTreeMatchesAction,
}: ItemTreeProps) {
  const canCreateItems = itemCapabilities?.create ?? legacyCanCreateItems;
  const canScheduleItems = planningCapabilities?.reparent ?? legacyCanScheduleItems;
  const viewUrl = useViewUrlState();
  // The open item follows the URL, which changes without a server render.
  const selectedKey = useRequestedItemKey() ?? undefined;
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

  // Windows (JIR-147). Without a filter: the parents whose children were read,
  // with where their next window starts. With one: the next matches, and the
  // ancestors later windows brought, shown dimmed.
  const [fetched, setFetched] = useState<Map<string, { cursor: string | null }>>(() => new Map());
  const [loadingParents, setLoadingParents] = useState<ReadonlySet<string>>(() => new Set());
  const [matches, setMatches] = useState(() => ({
    cursor: matchWindow?.nextCursor ?? null,
    total: matchWindow?.total ?? null,
    /** Matches loaded after the first window. */
    extra: 0,
  }));
  const [laterContext, setLaterContext] = useState<ReadonlySet<string>>(() => new Set());
  const [loadingMatches, setLoadingMatches] = useState(false);
  // The props the rows were last seeded from (see the re-seed effect below).
  const seeded = useRef(items);
  const seededQuery = useRef(viewStateQuery);
  // Bumped by every server render: a window read for an older one is dropped.
  const generation = useRef(0);
  const treeItemsRef = useRef(treeItems);
  const fetchedRef = useRef(fetched);
  const matchesRef = useRef(matches);
  useEffect(() => {
    treeItemsRef.current = treeItems;
    fetchedRef.current = fetched;
    matchesRef.current = matches;
  });

  // Set of ancestor ids that are shown as dimmed context when a filter is active.
  // Stable identity across renders via useMemo so downstream equality checks hold.
  const contextSet = useMemo(() => new Set([...contextIds, ...laterContext]), [contextIds, laterContext]);

  /**
   * The children windows read: a first window (or a reload) replaces what its
   * parent showed, a next one adds to it.
   */
  const applyChildren = useCallback((
    windows: TreeChildrenWindow[],
    structureIds: ReadonlySet<string>,
    next = false,
  ) => {
    const parents = new Set(next ? [] : windows.map((window) => window.parentId));
    const totals = new Map(windows.map((window) => [window.parentId, window.total]));
    setTreeItems((previous) => mergeRows(
      previous
        .filter((row) => structureIds.has(row.id) || row.parentId === null || !parents.has(row.parentId))
        .map((row) => (totals.has(row.id) ? { ...row, childCount: totals.get(row.id) } : row)),
      windows.flatMap((window) => window.rows.map(asTreeItem)),
    ));
    setFetched((previous) => {
      const next = new Map(previous);
      for (const window of windows) next.set(window.parentId, { cursor: window.nextCursor });
      return next;
    });
  }, []);

  /** A parent's first or next window of children (without a filter). */
  const loadChildrenOf = useCallback(async (parentId: string, cursor: string | null) => {
    if (loadingParents.has(parentId)) return;
    const current = generation.current;
    setLoadingParents((previous) => new Set(previous).add(parentId));
    setError(null);
    let result: LoadTreeChildrenResult;
    try {
      result = await loadChildren({ backlogKey, parents: [{ parentId, cursor, limit: TREE_WINDOW_SIZE }] });
    } catch {
      result = { ok: false, error: LOAD_FAILED };
    }
    setLoadingParents((previous) => {
      const next = new Set(previous);
      next.delete(parentId);
      return next;
    });
    // A refresh meanwhile replaced the rows this window would join.
    if (generation.current !== current) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applyChildren(result.windows, new Set(seeded.current.map((row) => row.id)), cursor !== null);
    setCollapsed((previous) => {
      if (!previous.has(parentId)) return previous;
      const next = new Set(previous);
      next.delete(parentId);
      return next;
    });
  }, [applyChildren, backlogKey, loadChildren, loadingParents]);

  /** The next filtered matches: an ancestor already shown is not added twice. */
  const loadMoreMatches = useCallback(async (cursor: TreeMatchCursor | null, limit: number, replace?: TreeItem[]) => {
    // The default view's state is the empty query: only a missing one blocks.
    if (!cursor || viewStateQuery === undefined) return false;
    const current = generation.current;
    setLoadingMatches(true);
    setError(null);
    let result: LoadTreeMatchesResult;
    try {
      result = await loadMatches({ backlogKey, viewState: viewStateQuery, cursor, limit });
    } catch {
      result = { ok: false, error: LOAD_FAILED };
    }
    if (generation.current !== current) return false;
    setLoadingMatches(false);
    if (!result.ok) {
      setError(result.error);
      // Rows that could not be read again are not shown as current.
      if (replace) setTreeItems(replace);
      return false;
    }
    const served = result.window;
    const servedMatches = served.rows.filter((row) => row.matched).length;
    setTreeItems((previous) => {
      const base = replace ?? previous;
      const known = new Set(base.map((row) => row.id));
      return [...base, ...served.rows.filter((row) => !known.has(row.id)).map(asTreeItem)];
    });
    setLaterContext((previous) => {
      const next = new Set(previous);
      for (const row of served.rows) if (!row.matched) next.add(row.id);
      return next;
    });
    setMatches((previous) => ({
      cursor: served.nextCursor,
      total: served.total,
      extra: (replace ? 0 : previous.extra) + servedMatches,
    }));
    return true;
  }, [backlogKey, loadMatches, viewStateQuery]);

  // Re-seed from fresh server props only when no drag is active and nothing is
  // in flight, so a mid-drag revalidate cannot clobber the optimistic state.
  // Only props that changed since the last seed do: a reorder between siblings
  // answers with the row's rank and renders no page (JIR-119), so the end of
  // its commit must not rebuild the tree from the props it already had.
  // Rows read by windows are read again at once (JIR-147), up to the reload
  // limit, and stay shown until then: an edit or « Actualiser » keeps what
  // was unfolded; a new filter starts from its first window.
  const reseed = useEffectEvent(() => {
    const sameView = seededQuery.current === viewStateQuery;
    seeded.current = items;
    seededQuery.current = viewStateQuery;
    generation.current += 1;
    const fresh = seed(items);
    const structureIds = new Set(fresh.map((row) => row.id));
    const previous = treeItemsRef.current;
    const stale = previous.filter((row) => !structureIds.has(row.id));
    setLaterContext(new Set());
    setLoadingParents(new Set());
    setLoadingMatches(false);

    if (filtersActive) {
      setFetched(new Map());
      const extra = sameView ? matchesRef.current.extra : 0;
      const firstCount = fresh.filter((row) => !contextIds.includes(row.id)).length;
      const reload = matchWindow?.nextCursor ? Math.min(extra, Math.max(0, TREE_RELOAD_LIMIT - firstCount)) : 0;
      setMatches({ cursor: matchWindow?.nextCursor ?? null, total: matchWindow?.total ?? null, extra: 0 });
      setTreeItems(reload > 0 ? [...fresh, ...stale] : fresh);
      if (reload > 0) void loadMoreMatches(matchWindow!.nextCursor, reload, fresh);
      return;
    }

    // The parents read again, in the order they were unfolded, within the limit.
    const parents: Array<{ parentId: string; cursor: null; limit: number }> = [];
    let budget = TREE_RELOAD_LIMIT;
    for (const parentId of fetchedRef.current.keys()) {
      const limit = Math.max(1, stale.filter((row) => row.parentId === parentId).length);
      if (parents.length >= TREE_RELOAD_PARENTS || limit > budget) break;
      parents.push({ parentId, cursor: null, limit });
      budget -= limit;
    }
    const kept = new Set(parents.map((parent) => parent.parentId));
    setFetched(new Map(parents.map((parent) => [parent.parentId, fetchedRef.current.get(parent.parentId)!])));
    setTreeItems([...fresh, ...stale.filter((row) => row.parentId !== null && kept.has(row.parentId))]);
    if (parents.length === 0) return;
    const current = generation.current;
    void (async () => {
      let result: LoadTreeChildrenResult;
      try {
        result = await loadChildren({ backlogKey, parents });
      } catch {
        result = { ok: false, error: LOAD_FAILED };
      }
      if (generation.current !== current) return;
      if (result.ok) {
        applyChildren(result.windows, structureIds);
        return;
      }
      // Children that could not be read again fold back rather than show as current.
      setError(result.error);
      setFetched(new Map());
      setTreeItems((rows) => rows.filter((row) => structureIds.has(row.id)));
    })();
  });
  useEffect(() => {
    if (dragId !== null || pending.current !== 0 || seeded.current === items) return;
    reseed();
  }, [items, dragId, settledTick]);

  const roots = buildTree(treeItems);
  const matchedCount = filtersActive ? treeItems.filter((row) => !contextSet.has(row.id)).length : 0;
  const hasMoreMatches = filtersActive && matches.cursor !== null;

  // With a filter, scrolling near the end loads the next matches; the button stays as a fallback.
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const nextMatches = useCallback(
    () => loadingMatches ? Promise.resolve(false) : loadMoreMatches(matches.cursor, TREE_WINDOW_SIZE),
    [loadMoreMatches, loadingMatches, matches.cursor],
  );
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!hasMoreMatches || !sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void nextMatches();
      },
      { root: scrollRef.current, rootMargin: "0px 0px 400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreMatches, nextMatches]);

  // « j » on the last loaded match loads the next ones, then moves on to them.
  const focusAfterLoad = useRef<number | null>(null);
  useEffect(() => {
    function onLoadMore() {
      if (!hasMoreMatches) return;
      const active = document.activeElement;
      if (!(active instanceof Node) || !scrollRef.current?.contains(active)) return;
      focusAfterLoad.current = treeItemsRef.current.length;
      void nextMatches().then((loaded) => {
        if (!loaded) focusAfterLoad.current = null;
      });
    }
    window.addEventListener(LOAD_MORE_SHORTCUT_EVENT, onLoadMore);
    return () => window.removeEventListener(LOAD_MORE_SHORTCUT_EVENT, onLoadMore);
  }, [hasMoreMatches, nextMatches]);
  useEffect(() => {
    const before = focusAfterLoad.current;
    if (before !== null && treeItems.length > before && scrollRef.current) {
      focusAfterLoad.current = null;
      moveShortcutFocus(scrollRef.current, 1);
    }
  }, [treeItems.length]);

  function onDragStart(e: DragEvent<HTMLDivElement>, item: TreeItem) {
    if (!canScheduleItems) return;
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
    if (!canScheduleItems) return;
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
    if (!canScheduleItems) return;
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
        // A reorder between siblings answers with the row's rank: the tree
        // takes it and renders no page (JIR-119). A reparent still re-seeds
        // from the revalidated props, since path and depth change too.
        if (args.sameParent) {
          const { rank } = res.item;
          setTreeItems((prev) => prev.map((i) => (i.id === args.id ? { ...i, rank } : i)));
        }
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
    viewUrl.push((params) => params.set("item", key));
  }

  function renderNode(node: TreeNode): React.ReactNode {
    // Without a filter, a parent with children not loaded yet unfolds by reading them.
    const unread = !filtersActive
      && node.childCount !== undefined
      && node.childCount > node.children.length
      && !fetched.has(node.id);
    const hasKids = node.children.length > 0 || (!filtersActive && (node.childCount ?? 0) > 0);
    const isCollapsed = collapsed.has(node.id) || unread;
    const loadingKids = loadingParents.has(node.id);
    const moreKids = fetched.get(node.id)?.cursor ?? null;
    const isSelected = node.key === selectedKey;
    const isTarget = target?.id === node.id;
    const zone = isTarget ? target.zone : null;
    // A context row is an ancestor shown for readability — dimmed and non-interactive.
    const isContext = contextSet.has(node.id);

    return (
      <div key={node.id}>
        <div
          draggable={canScheduleItems && !isContext}
          onDragStart={!canScheduleItems || isContext ? undefined : (e) => onDragStart(e, node)}
          onDragEnd={!canScheduleItems || isContext ? undefined : onDragEnd}
          onDragOver={!canScheduleItems || isContext ? undefined : (e) => onDragOver(e, node)}
          onDrop={!canScheduleItems || isContext ? undefined : (e) => onDrop(e, node.id, zone ?? "into")}
          onClick={isContext ? undefined : () => openItem(node.key)}
          onKeyDown={isContext ? undefined : (e) => {
            // Only the row itself activates; let the chevron button handle its own keys.
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openItem(node.key);
            }
          }}
          role="button"
          tabIndex={isContext ? -1 : 0}
          data-shortcut-item={isContext ? undefined : node.key}
          aria-disabled={isContext || undefined}
          aria-label={`${node.key} — ${node.title}`}
          className={`group relative flex min-h-[var(--row-h)] items-center gap-2 border-b border-border py-0.5 pr-3 text-sm transition-colors ${
            isContext
              ? "cursor-default"
              : `${canScheduleItems ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${isSelected ? "bg-[var(--accent-subtle)]" : "hover:bg-[var(--muted)]/60"}`
          }`}
          style={{
            paddingLeft: 8 + node.depth * 20,
            opacity: isContext ? 0.45 : dragId === node.id ? 0.4 : 1,
            background: zone === "into" ? "var(--accent-subtle)" : undefined,
            boxShadow: zone === "into"
              ? "inset 0 0 0 1.5px var(--ring)"
              : zone === "before"
                ? "inset 0 2px 0 var(--ring)"
                : zone === "after"
                  ? "inset 0 -2px 0 var(--ring)"
                  : undefined,
          }}
        >
          <button
            type="button"
            aria-label={hasKids ? (isCollapsed ? "Déplier" : "Replier") : undefined}
            aria-busy={loadingKids || undefined}
            disabled={loadingKids}
            onClick={(e) => {
              e.stopPropagation();
              if (unread) void loadChildrenOf(node.id, null);
              else if (hasKids) toggleCollapse(node.id);
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
          <span className="flex min-w-0 max-w-[45%] flex-none items-center gap-2">
            {node.labels.length > 0 && (
              <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                {node.labels.map((label) => (
                  <LabelPill
                    key={label.id}
                    name={label.name}
                    color={label.color}
                    className="min-w-0 max-w-28 shrink truncate"
                  />
                ))}
              </span>
            )}
            <span className="flex flex-none items-center gap-2">
              <PrioIcon priority={asPriority(node.priority)} />
              <StatusDotLocal statusId={node.statusId} statuses={statuses} />
              {node.assigneeName ? (
                <InitialsAvatar
                  name={node.assigneeName}
                  hue={hueFor(node.assigneeId ?? node.assigneeName)}
                  size={20}
                />
              ) : (
                <span
                  aria-hidden
                  className="size-5 flex-none rounded-full"
                  style={{ border: "1.5px dashed var(--border-strong)" }}
                />
              )}
            </span>
          </span>
        </div>
        {hasKids && !isCollapsed && node.children.map((child) => renderNode(child))}
        {hasKids && !isCollapsed && moreKids !== null ? (
          <div
            className="flex min-h-[var(--row-h)] items-center border-b border-border py-0.5 pr-3"
            style={{ paddingLeft: 8 + (node.depth + 1) * 20 + 24 }}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Charger la suite de ${node.title}`}
              disabled={loadingKids}
              aria-busy={loadingKids || undefined}
              onClick={() => void loadChildrenOf(node.id, moreKids)}
            >
              Charger la suite
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (items.length === 0) {
    const showNoResults = filtersActive && (hasItems ?? items.length > 0);
    if (!showNoResults && startStep && createDialogProps) {
      return (
        <div className="grid flex-1 place-items-center p-10">
          <ViewStartGuide
            step={startStep}
            backlogKey={backlogKey}
            dialogProps={createDialogProps}
            canCreateItems={canCreateItems}
            variant="empty"
          />
        </div>
      );
    }
    return (
      <div className="grid flex-1 place-items-center p-10">
        <EmptyState
          icon={showNoResults ? <SearchX className="size-5" /> : <Inbox className="size-5" />}
          title={showNoResults ? "Aucun résultat" : "Aucun item"}
          description={
            showNoResults
              ? "Aucun item ne correspond aux filtres actifs."
              : "Créez votre premier item pour commencer à organiser ce backlog."
          }
          action={
            showNoResults ? (
              clearFiltersHref ? (
                <Link
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  href={clearFiltersHref}
                >
                  Effacer les filtres
                </Link>
              ) : null
            ) : canCreateItems && createDialogProps ? (
              <NewItemButton backlogKey={backlogKey} {...createDialogProps} />
            ) : null
          }
        />
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
      {startStep && !filtersActive && createDialogProps ? (
        <ViewStartGuide
          step={startStep}
          backlogKey={backlogKey}
          dialogProps={createDialogProps}
          canCreateItems={canCreateItems}
          variant="callout"
          className="mx-3 mt-3 flex-none sm:mx-4"
        />
      ) : null}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 sm:p-4">
        <div className="min-w-fit overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
          {/* min-w-fit lets the card widen with rows that cannot shrink, so the outer scroller reaches them; -mb-px hides the last separator. */}
          <div className="-mb-px">{roots.map((node) => renderNode(node))}</div>
        </div>
        {filtersActive && (hasMoreMatches || matches.extra > 0) ? (
          <div className="flex flex-wrap items-center justify-center gap-3 pt-3 text-sm text-muted-foreground">
            <span aria-live="polite">{matchedCount} affichés sur {matches.total ?? matchedCount}</span>
            {hasMoreMatches ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingMatches}
                aria-busy={loadingMatches}
                onClick={() => void nextMatches()}
              >
                Charger la suite
              </Button>
            ) : null}
          </div>
        ) : null}
        {hasMoreMatches ? <div ref={sentinelRef} aria-hidden className="h-px" /> : null}
      </div>
    </div>
  );
}

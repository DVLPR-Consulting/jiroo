import { addDays, dayFromDate, type Day } from "@/lib/roadmap/days";
import {
  epicBar,
  groupBar,
  progressOf,
  taskBar,
  type Bar,
  type OwnDays,
} from "@/lib/roadmap/intervals";

/** An item as loadRoadmap returns it, in depth-first tree order. */
export type RoadmapSource = {
  id: string;
  key: string;
  title: string;
  type: "composant" | "epic" | "tache";
  parentId: string | null;
  category: "todo" | "in_progress" | "done";
  start: Day | null;
  due: Day | null;
  closedAt: Date | null;
  sprintId: string | null;
};

export type RoadmapRow = {
  id: string;
  key: string;
  title: string;
  type: RoadmapSource["type"];
  /** 0 component (group heading), 1 epic, 2 task. */
  depth: 0 | 1 | 2;
  parentId: string | null;
  category: RoadmapSource["category"];
  own: OwnDays;
  bar: Bar | null;
  /** Epics only: done tasks over all tasks. */
  progress?: { done: number; total: number };
  hasChildren: boolean;
  /** Components are headings: their bar only follows their epics. */
  editable: boolean;
};

/** An epic done longer ago than this leaves the roadmap unless asked. */
const DONE_GRACE_DAYS = 30;

const DEPTH = { composant: 0, epic: 1, tache: 2 } as const;

export function buildRows(
  items: readonly RoadmapSource[],
  sprintDays: ReadonlyMap<string, { start: Day | null; end: Day | null }>,
  options: { today: Day; showDone: boolean },
): RoadmapRow[] {
  const childrenOf = new Map<string, RoadmapSource[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const siblings = childrenOf.get(item.parentId) ?? [];
    siblings.push(item);
    childrenOf.set(item.parentId, siblings);
  }
  const doneSince = addDays(options.today, -DONE_GRACE_DAYS);
  const hidden = (item: RoadmapSource) =>
    !options.showDone
    && item.type === "epic"
    && item.category === "done"
    && item.closedAt !== null
    && dayFromDate(item.closedAt) < doneSince;

  const rowFor = (item: RoadmapSource, bar: Bar | null, extra: Partial<RoadmapRow> = {}): RoadmapRow => ({
    id: item.id,
    key: item.key,
    title: item.title,
    type: item.type,
    depth: DEPTH[item.type],
    parentId: item.parentId,
    category: item.category,
    own: { start: item.start, due: item.due },
    bar,
    hasChildren: (childrenOf.get(item.id)?.length ?? 0) > 0,
    editable: item.type !== "composant",
    ...extra,
  });

  const rows: RoadmapRow[] = [];
  for (const component of items.filter((item) => item.type === "composant")) {
    const epicRows: RoadmapRow[] = [];
    for (const epic of childrenOf.get(component.id) ?? []) {
      if (epic.type !== "epic" || hidden(epic)) continue;
      const tasks = (childrenOf.get(epic.id) ?? []).filter((task) => task.type === "tache");
      const taskRows = tasks.map((task) =>
        rowFor(
          task,
          taskBar(
            { start: task.start, due: task.due },
            task.sprintId ? (sprintDays.get(task.sprintId) ?? null) : null,
          ),
        ),
      );
      epicRows.push(
        rowFor(epic, epicBar({ start: epic.start, due: epic.due }, taskRows.map((row) => row.bar)), {
          progress: progressOf(tasks.map((task) => task.category)),
          hasChildren: taskRows.length > 0,
        }),
        ...taskRows,
      );
    }
    rows.push(
      rowFor(component, groupBar(epicRows.filter((row) => row.depth === 1).map((row) => row.bar))),
      ...epicRows,
    );
  }
  return rows;
}

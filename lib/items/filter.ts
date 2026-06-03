import { ITEM_TYPES, PRIORITIES, type ItemType } from "@/lib/design/constants";

export type GroupKey = "status" | "assignee" | "priority" | "parent";
export type SortField = "priority" | "dueDate" | "created" | "updated" | "key";
export type SortDir = "asc" | "desc";

export type Filters = {
  q: string;
  types: ItemType[];
  statusIds: string[];
  priorities: number[];
  assignees: string[]; // user ids; the literal "none" = unassigned
};

export type ViewState = {
  filters: Filters;
  group: GroupKey | null;
  sort: { field: SortField; dir: SortDir } | null;
};

const GROUP_KEYS: GroupKey[] = ["status", "assignee", "priority", "parent"];
const SORT_FIELDS: SortField[] = ["priority", "dueDate", "created", "updated", "key"];

function csv(sp: URLSearchParams, key: string): string[] {
  const raw = sp.get(key);
  return raw ? [...new Set(raw.split(",").filter(Boolean))] : [];
}

export function parseViewState(sp: URLSearchParams): ViewState {
  const types = csv(sp, "type").filter((t): t is ItemType =>
    (ITEM_TYPES as readonly string[]).includes(t),
  );
  const priorities = csv(sp, "prio")
    .map((p) => Number(p))
    .filter((p) => (PRIORITIES as readonly number[]).includes(p));

  const groupRaw = sp.get("group");
  const group = groupRaw && (GROUP_KEYS as string[]).includes(groupRaw) ? (groupRaw as GroupKey) : null;

  const sortRaw = sp.get("sort");
  let sort: ViewState["sort"] = null;
  if (sortRaw) {
    const parts = sortRaw.split(":");
    const [field, dir] = parts;
    if (
      parts.length === 2 &&
      field !== undefined &&
      (SORT_FIELDS as string[]).includes(field) &&
      (dir === "asc" || dir === "desc")
    ) {
      sort = { field: field as SortField, dir };
    }
  }

  return {
    filters: {
      q: sp.get("q") ?? "",
      types,
      statusIds: csv(sp, "status"),
      priorities,
      assignees: csv(sp, "assignee"),
    },
    group,
    sort,
  };
}

export function writeViewState(sp: URLSearchParams, state: ViewState): void {
  const setOrDelete = (key: string, value: string) => {
    if (value) sp.set(key, value);
    else sp.delete(key);
  };
  const { filters, group, sort } = state;
  setOrDelete("q", filters.q.trim());
  setOrDelete("type", filters.types.join(","));
  setOrDelete("status", filters.statusIds.join(","));
  setOrDelete("prio", filters.priorities.join(","));
  setOrDelete("assignee", filters.assignees.join(","));
  setOrDelete("group", group ?? "");
  setOrDelete("sort", sort ? `${sort.field}:${sort.dir}` : "");
}

export type FilterItem = {
  id: string;
  key: string;
  type: ItemType;
  title: string;
  description: string | null;
  statusId: string;
  priority: number;
  assigneeId: string | null;
  parentId: string | null;
  path: string;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  rank: string;
};

export function isFiltersActive(f: Filters): boolean {
  return (
    f.q.trim() !== "" ||
    f.types.length > 0 ||
    f.statusIds.length > 0 ||
    f.priorities.length > 0 ||
    f.assignees.length > 0
  );
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function matchItem(it: FilterItem, f: Filters): boolean {
  if (f.types.length && !f.types.includes(it.type)) return false;
  if (f.statusIds.length && !f.statusIds.includes(it.statusId)) return false;
  if (f.priorities.length && !f.priorities.includes(it.priority)) return false;
  if (f.assignees.length) {
    const hit =
      (it.assigneeId !== null && f.assignees.includes(it.assigneeId)) ||
      (it.assigneeId === null && f.assignees.includes("none"));
    if (!hit) return false;
  }
  const q = f.q.trim();
  if (q) {
    const hay = normalize(`${it.title} ${it.description ?? ""}`);
    if (!hay.includes(normalize(q))) return false;
  }
  return true;
}

// Expand a matched id set to include the ancestors of every match, using the
// self-inclusive ltree path: A is an ancestor of M iff M.path starts with A.path + ".".
export function withAncestors(items: FilterItem[], matchedIds: Set<string>): Set<string> {
  const result = new Set(matchedIds);
  const matched = items.filter((i) => matchedIds.has(i.id));
  for (const m of matched) {
    for (const i of items) {
      if (m.path.startsWith(i.path + ".")) result.add(i.id);
    }
  }
  return result;
}

// Partition into [key, items][] preserving first-seen order. Label resolution
// (status name, user name, priority label, parent title) belongs to the caller.
export function groupItems(items: FilterItem[], group: GroupKey): Array<[string, FilterItem[]]> {
  const keyOf = (i: FilterItem): string => {
    switch (group) {
      case "status": return i.statusId;
      case "assignee": return i.assigneeId ?? "none";
      case "priority": return String(i.priority);
      case "parent": return i.parentId ?? "none";
    }
  };
  const map = new Map<string, FilterItem[]>();
  for (const i of items) {
    const k = keyOf(i);
    (map.get(k) ?? map.set(k, []).get(k)!).push(i);
  }
  return [...map.entries()];
}

export function sortItems(items: FilterItem[], sort: { field: SortField; dir: SortDir }): FilterItem[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const cmp = (a: FilterItem, b: FilterItem): number => {
    switch (sort.field) {
      case "priority": return (a.priority - b.priority) * sign;
      case "created": return (a.createdAt.getTime() - b.createdAt.getTime()) * sign;
      case "updated": return (a.updatedAt.getTime() - b.updatedAt.getTime()) * sign;
      case "key": return a.key.localeCompare(b.key, undefined, { numeric: true }) * sign;
      case "dueDate": {
        // nulls always last, regardless of direction
        if (a.dueDate === null && b.dueDate === null) return 0;
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return (a.dueDate.getTime() - b.dueDate.getTime()) * sign;
      }
    }
  };
  return [...items].sort(cmp);
}

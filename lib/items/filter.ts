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
  return raw ? raw.split(",").filter(Boolean) : [];
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
    const [field, dir] = sortRaw.split(":");
    if ((SORT_FIELDS as string[]).includes(field ?? "") && (dir === "asc" || dir === "desc")) {
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

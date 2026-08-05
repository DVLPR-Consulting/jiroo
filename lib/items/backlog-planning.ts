import {
  sortItems,
  type FilterItem,
  type ViewState,
} from "@/lib/items/filter";

type StatusCategory = "todo" | "in_progress" | "done";
type BacklogPlanningRow = FilterItem & { type: "tache" };

export function selectBacklogRows(
  rows: FilterItem[],
  statusCategoryById: ReadonlyMap<string, StatusCategory>,
  isVisible: (id: string) => boolean,
  sort: ViewState["sort"],
): BacklogPlanningRow[] {
  const eligible = rows.filter(
    (item): item is BacklogPlanningRow =>
      item.type === "tache" &&
      statusCategoryById.get(item.statusId) !== "done" &&
      isVisible(item.id),
  );

  return sort
    ? sortItems(eligible, sort)
    : [...eligible].sort((left, right) => left.rank.localeCompare(right.rank));
}

import { describe, expect, it } from "vitest";
import { selectBacklogRows } from "@/lib/items/backlog-planning";
import type { FilterItem } from "@/lib/items/filter";

function row(
  id: string,
  title: string,
  overrides: Partial<FilterItem> = {},
): FilterItem {
  return {
    id,
    key: `DEMO-${id}`,
    type: "tache",
    kind: "feature",
    title,
    description: null,
    statusId: "todo",
    priority: 2,
    assigneeId: null,
    parentId: null,
    path: id,
    depth: 0,
    dueDate: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    rank: "m",
    labelIds: [],
    ancestorIds: [],
    componentId: null,
    statusOrder: 0,
    ...overrides,
  };
}

const categories = new Map<string, "todo" | "in_progress" | "done">([
  ["todo", "todo"],
  ["doing", "in_progress"],
  ["done", "done"],
]);

describe("selectBacklogRows", () => {
  const rows = [
    row("1", "Zulu", { rank: "c", statusId: "doing" }),
    row("2", "Alpha", { rank: "a" }),
    row("3", "Terminé", { rank: "b", statusId: "done" }),
    row("4", "Structure", { rank: "d", type: "epic" }),
    row("5", "Masqué", { rank: "e" }),
  ];

  it("keeps only visible non-done tasks in persistent rank order", () => {
    const selected = selectBacklogRows(
      rows,
      categories,
      (id) => id !== "5",
      null,
    );

    expect(selected.map((item) => item.id)).toEqual(["2", "1"]);
  });

  it("uses an explicit presentation sort without changing eligibility", () => {
    const selected = selectBacklogRows(
      rows,
      categories,
      () => true,
      { field: "title", dir: "desc" },
    );

    expect(selected.map((item) => item.id)).toEqual(["1", "5", "2"]);
  });
});

import { describe, expect, it } from "vitest";
import { buildRows, type RoadmapSource } from "@/lib/roadmap/rows";

const TODAY = "2026-10-15";

function item(overrides: Partial<RoadmapSource>): RoadmapSource {
  return {
    id: "x",
    key: "CASS-0",
    title: "Item",
    type: "tache",
    parentId: null,
    category: "todo",
    start: null,
    due: null,
    closedAt: null,
    sprintId: null,
    ...overrides,
  };
}

const SOURCE: RoadmapSource[] = [
  item({ id: "c1", key: "CASS-1", type: "composant", title: "Composant" }),
  item({ id: "e1", key: "CASS-2", type: "epic", parentId: "c1", title: "Epic planifié", start: "2026-10-01", due: "2026-12-31" }),
  item({ id: "t1", key: "CASS-3", type: "tache", parentId: "e1", due: "2026-10-05", category: "done" }),
  item({ id: "t2", key: "CASS-4", type: "tache", parentId: "e1", sprintId: "s1" }),
  item({ id: "e2", key: "CASS-5", type: "epic", parentId: "c1", title: "Epic déduit" }),
  item({ id: "t3", key: "CASS-6", type: "tache", parentId: "e2", start: "2026-11-02", due: "2026-11-20" }),
  item({ id: "e3", key: "CASS-7", type: "epic", parentId: "c1", title: "Epic vide" }),
  item({
    id: "e4",
    key: "CASS-8",
    type: "epic",
    parentId: "c1",
    title: "Epic livré",
    category: "done",
    closedAt: new Date("2026-08-01T10:00:00Z"),
    due: "2026-07-31",
  }),
];
const SPRINTS = new Map([["s1", { start: "2026-10-12", end: "2026-10-25" }]]);

describe("buildRows", () => {
  const rows = buildRows(SOURCE, SPRINTS, { today: TODAY, showDone: false });
  const byId = new Map(rows.map((row) => [row.id, row]));

  it("keeps tree order and depth", () => {
    expect(rows.map((row) => [row.id, row.depth])).toEqual([
      ["c1", 0],
      ["e1", 1],
      ["t1", 2],
      ["t2", 2],
      ["e2", 1],
      ["t3", 2],
      ["e3", 1],
    ]);
  });

  it("resolves task bars from own days or the sprint", () => {
    expect(byId.get("t1")?.bar).toEqual({ start: "2026-10-05", end: "2026-10-05", derived: false });
    expect(byId.get("t2")?.bar).toEqual({ start: "2026-10-12", end: "2026-10-25", derived: true });
  });

  it("resolves epic bars from own days or their tasks, with progress", () => {
    expect(byId.get("e1")).toMatchObject({
      bar: { start: "2026-10-01", end: "2026-12-31", derived: false },
      progress: { done: 1, total: 2 },
      hasChildren: true,
    });
    expect(byId.get("e2")?.bar).toEqual({ start: "2026-11-02", end: "2026-11-20", derived: true });
    expect(byId.get("e3")).toMatchObject({ bar: null, hasChildren: false, progress: { done: 0, total: 0 } });
  });

  it("spans the component over its epics, read-only", () => {
    expect(byId.get("c1")).toMatchObject({
      bar: { start: "2026-10-01", end: "2026-12-31", derived: true },
      editable: false,
    });
    expect(byId.get("e1")?.editable).toBe(true);
    expect(byId.get("t1")?.editable).toBe(true);
  });

  it("hides epics done more than 30 days ago, unless asked", () => {
    expect(byId.has("e4")).toBe(false);
    const all = buildRows(SOURCE, SPRINTS, { today: TODAY, showDone: true });
    expect(all.some((row) => row.id === "e4")).toBe(true);
  });

  it("keeps an epic done recently", () => {
    const recent = SOURCE.map((row) =>
      row.id === "e4" ? { ...row, closedAt: new Date("2026-10-01T10:00:00Z") } : row,
    );
    expect(buildRows(recent, SPRINTS, { today: TODAY, showDone: false }).some((row) => row.id === "e4"))
      .toBe(true);
  });
});

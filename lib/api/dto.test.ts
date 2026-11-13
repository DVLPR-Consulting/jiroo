import { describe, expect, it } from "vitest";
import { points, toBacklogSummary, toItemSummary } from "@/lib/api/dto";

const row = {
  id: "item-1",
  key: "CASS-12",
  type: "tache" as const,
  kind: "bug" as const,
  title: "Rédiger l’arrêt",
  priority: 3,
  estimatePoints: "2.50",
  parentId: "item-0",
  startDate: "2026-11-02",
  dueDate: null,
  createdAt: new Date("2026-11-01T10:00:00.000Z"),
  updatedAt: new Date("2026-11-03T10:00:00.000Z"),
  closedAt: null,
  backlogId: "backlog-1",
  backlogKey: "CASS",
  backlogName: "Pôle civil",
  statusId: "status-1",
  statusName: "En cours",
  statusCategory: "in_progress" as const,
  assigneeId: "user-1",
  assigneeName: "Ada",
};

describe("toItemSummary", () => {
  it("nests the backlog, status and assignee and serialises dates and points", () => {
    expect(toItemSummary(row)).toEqual({
      id: "item-1",
      key: "CASS-12",
      backlog: { id: "backlog-1", key: "CASS", name: "Pôle civil" },
      type: "tache",
      kind: "bug",
      title: "Rédiger l’arrêt",
      status: { id: "status-1", name: "En cours", category: "in_progress" },
      priority: 3,
      estimatePoints: 2.5,
      assignee: { id: "user-1", name: "Ada" },
      parentId: "item-0",
      startDate: "2026-11-02",
      dueDate: null,
      createdAt: "2026-11-01T10:00:00.000Z",
      updatedAt: "2026-11-03T10:00:00.000Z",
      closedAt: null,
    });
  });

  it("leaves an unassigned item without assignee and a deleted assignee named by id", () => {
    expect(toItemSummary({ ...row, assigneeId: null, assigneeName: null }).assignee).toBeNull();
    expect(toItemSummary({ ...row, assigneeName: null }).assignee).toEqual({ id: "user-1", name: "user-1" });
  });

  it("reads numeric points from strings and numbers, never NaN", () => {
    expect(points("5")).toBe(5);
    expect(points(0.25)).toBe(0.25);
    expect(points(null)).toBeNull();
    expect(points("abc")).toBeNull();
  });

  it("serialises a backlog with its archive date", () => {
    expect(toBacklogSummary({ id: "b", key: "CASS", name: "Pôle civil", color: "#123456", archivedAt: null })).toEqual({
      id: "b", key: "CASS", name: "Pôle civil", color: "#123456", archivedAt: null,
    });
    expect(toBacklogSummary({ id: "b", key: "CASS", name: "x", color: "#1", archivedAt: new Date("2026-01-01T00:00:00.000Z") }).archivedAt)
      .toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("item detail DTO", () => {
  it("serializes the detail and blanks deleted comment bodies", async () => {
    const { toItemDetail } = await import("./dto");
    const result = toItemDetail({ key: "AB-1", backlog: { key: "AB" } } as import("./dto").ItemSummary, {
      description: null, reporter: null, parent: null, children: [], labels: [],
      comments: [{ id: "c", author: { id: "u", name: "User" }, body: "deleted secret", createdAt: new Date("2026-01-01Z"), editedAt: null, deletedAt: new Date("2026-01-02Z") }],
      activities: [{ id: "a", actor: { id: "u", name: "User" }, action: "created", field: null, oldValue: null, newValue: null, source: "api", at: new Date("2026-01-01Z") }],
    });
    expect(result.url).toBe("/b/AB?item=AB-1");
    expect(result.comments[0]).toEqual({ id: "c", author: { id: "u", name: "User" }, body: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null, deletedAt: "2026-01-02T00:00:00.000Z" });
    expect(result.activities[0]!.at).toBe("2026-01-01T00:00:00.000Z");
  });
});

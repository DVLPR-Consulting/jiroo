import { describe, expect, it } from "vitest";
import { assembleLePoint, type LePointRow, type LePointSource } from "@/lib/le-point/assemble";
import { developerView, productView } from "@/lib/le-point/model";

const row = (id: string, over: Partial<LePointRow> = {}): LePointRow => ({
  id,
  key: `CASS-${id}`,
  title: `Ticket ${id}`,
  type: "tache",
  kind: "feature",
  parentId: "1",
  status: "À faire",
  category: "todo",
  assigneeId: "dev",
  dueDate: null,
  closedAt: null,
  ...over,
});

function source(over: Partial<LePointSource> = {}): LePointSource {
  return {
    viewerId: "dev",
    today: "2026-10-22",
    lastVisit: "2026-10-15",
    firstVisit: false,
    backlog: { key: "CASS", name: "Recherche" },
    items: [
      row("1", { type: "epic", parentId: null, title: "Recherche avancée" }),
      row("2", { status: "En cours", category: "in_progress" }),
      row("3", { status: "Terminé", category: "done", closedAt: new Date("2026-10-20T22:30:00Z") }),
      row("4", { type: "soustache", parentId: "2", kind: "bug" }),
      row("9", { type: "epic", parentId: null, title: "Livré", status: "Terminé", category: "done" }),
      row("10", { parentId: "9", status: "Terminé", category: "done" }),
    ],
    blocks: [],
    outside: [],
    comments: [],
    lastActivity: [],
    releases: [
      { id: "r1", name: "1.0", planned: "2026-09-18", released: "2026-09-18" },
      { id: "r2", name: "2.0", planned: "2027-01-29", released: null },
    ],
    fixVersions: [
      { itemId: "2", releaseId: "r2" },
      { itemId: "3", releaseId: "r1" },
      { itemId: "10", releaseId: "r1" },
    ],
    sprint: null,
    sprintItemIds: null,
    people: [{ id: "dev", name: "Paul" }, { id: "po", name: "Catherine" }],
    ...over,
  };
}

describe("assembleLePoint", () => {
  it("makes the reader the viewer of both perspectives", () => {
    expect(assembleLePoint(source()).personas).toEqual({ developer: "dev", product: "dev" });
  });

  it("counts a task towards its epic but not a sub-task, and shows the sub-task's shape", () => {
    const data = assembleLePoint(source());
    const objective = productView(data, "dev").objectives.find((summary) => summary.key === "CASS-1")!;
    expect(objective.total).toBe(2);
    expect(data.tickets.find((ticket) => ticket.key === "CASS-4")).toMatchObject({ objective: null, shape: "bug" });
  });

  it("dates a closing in Paris", () => {
    // 22:30 UTC on 20 October is already the 21st in Paris.
    expect(assembleLePoint(source()).tickets.find((ticket) => ticket.key === "CASS-3")!.done).toBe("2026-10-21");
  });

  it("plans an objective in the next unpublished version of its open tasks", () => {
    const data = assembleLePoint(source());
    expect(data.objectives.find((objective) => objective.key === "CASS-1")!.release).toBe("2.0");
  });

  it("drops a done objective already delivered, keeps one still to deliver", () => {
    expect(assembleLePoint(source()).objectives.map((objective) => objective.key)).toEqual(["CASS-1"]);
    const pending = assembleLePoint(source({
      releases: [{ id: "r1", name: "1.0", planned: "2026-09-18", released: null }],
    }));
    expect(pending.objectives.map((objective) => objective.key)).toEqual(["CASS-1", "CASS-9"]);
  });

  it("keeps nothing of a dependency the reader cannot see but that it blocks", () => {
    const data = assembleLePoint(source({ blocks: [{ sourceId: null, targetId: "2" }] }));
    expect(data.tickets.find((ticket) => ticket.key === "CASS-2")!.blockedBy).toEqual([{ hidden: true }]);
    expect(JSON.stringify(data)).not.toContain("secret");
  });

  it("shows a visible outside dependency without counting it as the reader's work", () => {
    const outside = row("50", { key: "DATA-50", title: "API", assigneeId: "dev", parentId: null, status: "En cours", category: "in_progress" });
    const data = assembleLePoint(source({ outside: [outside], blocks: [{ sourceId: "50", targetId: "2" }] }));
    const view = developerView(data, "dev");
    expect(view.blocked.map((card) => card.key)).toEqual(["CASS-2"]);
    expect(view.blocked[0]!.links).toEqual(["DATA-50"]);
    expect([...view.resume, ...view.next, ...view.withoutDue].map((card) => card.key)).not.toContain("DATA-50");
  });

  it("turns a mention into a decision for the person mentioned", () => {
    const data = assembleLePoint(source({
      comments: [{ itemId: "2", authorId: "dev", mentions: ["po"], at: new Date("2026-10-21T08:00:00Z"), body: "@Catherine arbitrer ?" }],
    }));
    expect(productView(data, "po").decisions.map((card) => card.key)).toEqual(["CASS-2"]);
    expect(productView(data, "dev").decisions).toEqual([]);
  });

  it("flags a missing assignee only on committed work", () => {
    const items = [
      row("1", { type: "epic", parentId: null }),
      row("2", { assigneeId: null }),
      row("3", { assigneeId: null }),
      row("4", { assigneeId: null, status: "En cours", category: "in_progress" }),
    ];
    const data = assembleLePoint(source({ items, fixVersions: [], sprintItemIds: ["3"] }));
    expect(productView(data, "po").difficulties.map((card) => card.key)).toEqual(["CASS-3", "CASS-4"]);
  });
});

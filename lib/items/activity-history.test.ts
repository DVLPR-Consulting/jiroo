import { describe, expect, it } from "vitest";
import { describeHistory, type HistoryLookup } from "@/lib/items/activity-history";

const lookup: HistoryLookup = {
  status: (id) => ({ todo: "À faire", doing: "En cours" })[id],
  user: (id) => ({ marie: "Marie Lemaire", paul: "Paul Martin" })[id],
  label: (id) => ({ l1: "urgent", l2: "front", l3: "back" })[id],
  item: (id) => ({ p1: "CASS-1", p2: "CASS-2" })[id],
};

function row(
  action: string,
  field: string | null,
  oldValue: string | null,
  newValue: string | null,
) {
  return { action, field, oldValue, newValue };
}

describe("describeHistory", () => {
  it("phrases creation, deletion and restoration without values", () => {
    expect(describeHistory(row("create", null, null, "CASS-3"), lookup)).toEqual({
      text: "a créé l’item",
    });
    expect(describeHistory(row("delete", null, null, "2026-10-01"), lookup).text).toBe(
      "a supprimé l’item",
    );
    expect(describeHistory(row("delete", null, "2026-10-01", null), lookup).text).toBe(
      "a restauré l’item",
    );
  });

  it("shows a status change as old → new, keeping names of deleted statuses", () => {
    expect(describeHistory(row("status_change", "status", "todo", "doing"), lookup)).toEqual({
      text: "a changé le statut",
      from: "À faire",
      to: "En cours",
    });
    expect(
      describeHistory(row("status_change", "status", "Ancien statut", "doing"), lookup).from,
    ).toBe("Ancien statut");
  });

  it("names people, priorities, natures and points", () => {
    expect(describeHistory(row("update", "assignee", null, "marie"), lookup)).toEqual({
      text: "a changé l’assigné",
      from: "Non assigné",
      to: "Marie Lemaire",
    });
    expect(describeHistory(row("update", "reporter", "marie", "paul"), lookup)).toEqual({
      text: "a changé le rapporteur",
      from: "Marie Lemaire",
      to: "Paul Martin",
    });
    expect(describeHistory(row("update", "priority", "0", "3"), lookup)).toEqual({
      text: "a changé la priorité",
      from: "Aucune",
      to: "Haute",
    });
    expect(describeHistory(row("update", "kind", "feature", "bug"), lookup)).toEqual({
      text: "a changé la nature",
      from: "Fonctionnalité",
      to: "Bug",
    });
    expect(describeHistory(row("update", "estimate_points", null, "2.5"), lookup)).toEqual({
      text: "a changé les points",
      from: "Non estimé",
      to: "2,5 pts",
    });
  });

  it("shows the title change and the due date as text", () => {
    expect(describeHistory(row("update", "title", "Ancien", "Nouveau"), lookup)).toEqual({
      text: "a renommé l’item",
      from: "Ancien",
      to: "Nouveau",
    });
    expect(
      describeHistory(row("update", "due_date", null, "2026-10-20T00:00:00.000Z"), lookup),
    ).toEqual({ text: "a changé l’échéance", from: "Aucune", to: "20 oct. 2026" });
    // Calendar days since JIR-101; older rows keep their UTC timestamps.
    expect(
      describeHistory(row("update", "due_date", "2026-10-20", "2026-10-31"), lookup),
    ).toEqual({ text: "a changé l’échéance", from: "20 oct. 2026", to: "31 oct. 2026" });
    expect(describeHistory(row("update", "start_date", null, "2026-10-01"), lookup)).toEqual({
      text: "a changé le début",
      from: "Aucun",
      to: "1 oct. 2026",
    });
    expect(describeHistory(row("update", "description", "a", "b"), lookup)).toEqual({
      text: "a modifié la description",
    });
  });

  it("shows the parent change by key", () => {
    expect(describeHistory(row("move", "parent", "p1", "p2"), lookup)).toEqual({
      text: "a changé le parent",
      from: "CASS-1",
      to: "CASS-2",
    });
    expect(describeHistory(row("move", "parent", "p1", null), lookup).to).toBe("Aucun");
    expect(describeHistory(row("move", "rank", "a0", "a1"), lookup)).toEqual({
      text: "a changé le rang",
    });
  });

  it("details the labels added and removed", () => {
    expect(describeHistory(row("update", "labels", "l1,l2", "l2,l3"), lookup)).toEqual({
      text: "a modifié les labels",
      added: ["back"],
      removed: ["urgent"],
    });
    expect(describeHistory(row("update", "labels", null, "l9"), lookup)).toEqual({
      text: "a modifié les labels",
      added: ["label supprimé"],
      removed: [],
    });
  });

  it("lists Fix versions and sprints by name", () => {
    expect(
      describeHistory(
        row(
          "update",
          "fix_versions",
          "[]",
          JSON.stringify([{ id: "r1", name: "2026.10" }, { id: "r2", name: "2026.11" }]),
        ),
        lookup,
      ),
    ).toEqual({ text: "a changé les Fix versions", from: "Aucune", to: "2026.10, 2026.11" });
    expect(describeHistory(row("update", "sprint", null, "Sprint 4"), lookup)).toEqual({
      text: "a changé le sprint",
      from: "Backlog",
      to: "Sprint 4",
    });
  });

  it("falls back to a generic phrase for anything else", () => {
    expect(describeHistory(row("update", "mystery", "a", "b"), lookup)).toEqual({
      text: "a modifié l’item",
    });
  });
});

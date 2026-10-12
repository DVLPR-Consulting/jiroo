import { describe, expect, it } from "vitest";
import {
  NO_SPRINT,
  countsAsSprintMember,
  orderSprintsForFilter,
  sprintIdsByItem,
  withKnownSprintIds,
} from "./sprint-filter";
import type { Filters } from "./filter";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";

const filters = (sprintIds: string[]): Filters => ({
  q: "",
  types: [],
  statusIds: [],
  priorities: [],
  assignees: [],
  labels: [],
  releaseIds: [],
  sprintIds,
  kind: [],
  underIds: [],
});

const joined = new Date("2026-01-01T00:00:00Z");
const left = new Date("2026-01-15T00:00:00Z");

describe("countsAsSprintMember", () => {
  it("counts the current membership", () => {
    expect(countsAsSprintMember({ leftAt: null, outcome: null })).toBe(true);
  });

  it.each(["completed", "carried_to_backlog", "carried_to_sprint"] as const)(
    "keeps a membership closed by the sprint completion (%s)",
    (outcome) => {
      expect(countsAsSprintMember({ leftAt: left, outcome })).toBe(true);
    },
  );

  it("drops a membership the item was removed from", () => {
    expect(countsAsSprintMember({ leftAt: left, outcome: "removed" })).toBe(false);
  });
});

describe("sprintIdsByItem", () => {
  const membership = (
    itemId: string,
    sprintId: string,
    over: Partial<{ leftAt: Date | null; outcome: "completed" | "removed" | "carried_to_backlog" | "carried_to_sprint" | null }> = {},
  ) => ({ itemId, sprintId, joinedAt: joined, leftAt: null, outcome: null, ...over });

  it("keeps every past sprint of a carried-over item, like Jira's Sprint field", () => {
    const map = sprintIdsByItem(
      [
        membership("t1", S1, { leftAt: left, outcome: "carried_to_sprint" }),
        membership("t1", S2),
      ],
      [{ id: "t1", type: "tache", parentId: null }],
    );
    expect(map.get("t1")).toEqual([S1, S2]);
  });

  it("forgets a sprint the item was removed from", () => {
    const map = sprintIdsByItem(
      [membership("t1", S1, { leftAt: left, outcome: "removed" }), membership("t1", S2)],
      [{ id: "t1", type: "tache", parentId: null }],
    );
    expect(map.get("t1")).toEqual([S2]);
  });

  it("lists a sprint once when the item came back to it", () => {
    const map = sprintIdsByItem(
      [
        membership("t1", S1, { leftAt: left, outcome: "removed" }),
        membership("t1", S1),
      ],
      [{ id: "t1", type: "tache", parentId: null }],
    );
    expect(map.get("t1")).toEqual([S1]);
  });

  it("gives a sous-tâche the sprints of its parent tâche", () => {
    const map = sprintIdsByItem(
      [membership("t1", S1, { leftAt: left, outcome: "completed" })],
      [
        { id: "t1", type: "tache", parentId: "e1" },
        { id: "st1", type: "soustache", parentId: "t1" },
        { id: "e1", type: "epic", parentId: null },
      ],
    );
    expect(map.get("st1")).toEqual([S1]);
    expect(map.get("e1")).toBeUndefined();
  });
});

describe("withKnownSprintIds", () => {
  const known = new Set([S1, S2]);

  it("keeps the backlog's sprints and « Aucun sprint »", () => {
    expect(withKnownSprintIds(filters([S2, NO_SPRINT]), known).sprintIds).toEqual([
      S2,
      NO_SPRINT,
    ]);
  });

  it("drops sprints of other backlogs and malformed ids", () => {
    expect(
      withKnownSprintIds(filters([S3, "not-a-uuid", "'; drop table", S1]), known).sprintIds,
    ).toEqual([S1]);
  });

  it("returns the same object when nothing is dropped", () => {
    const input = filters([S1]);
    expect(withKnownSprintIds(input, known)).toBe(input);
  });

  it("clears the facet in views that do not offer it", () => {
    expect(withKnownSprintIds(filters([S1, NO_SPRINT]), null).sprintIds).toEqual([]);
  });
});

describe("orderSprintsForFilter", () => {
  it("lists the active sprint, then planned ones in rank order, then completed ones most recent first", () => {
    const sprints = [
      { id: "old", name: "Sprint 1", state: "completed" as const, completedAt: new Date("2026-01-14") },
      { id: "recent", name: "Sprint 2", state: "completed" as const, completedAt: new Date("2026-01-28") },
      { id: "active", name: "Sprint 3", state: "active" as const, completedAt: null },
      { id: "next", name: "Sprint 4", state: "planned" as const, completedAt: null },
      { id: "later", name: "Sprint 5", state: "planned" as const, completedAt: null },
    ];
    expect(orderSprintsForFilter(sprints).map((sprint) => sprint.id)).toEqual([
      "active",
      "next",
      "later",
      "recent",
      "old",
    ]);
  });
});

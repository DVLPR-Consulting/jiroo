import { describe, expect, it } from "vitest";
import {
  halfState,
  laneOf,
  personSummary,
  removalsFor,
  rightsBacklogFor,
  segmentsOn,
  selectionOutcome,
  snapSelection,
  sprintBands,
  ticketsOf,
  toAbsences,
  visiblePeople,
  type PresenceDataset,
  type PresenceTicket,
} from "@/lib/presence/view";

const ticket = (over: Partial<PresenceTicket> & { id: string; startedAt: string }): PresenceTicket => ({
  key: `DATA-${over.id}`, title: over.id, type: "tache", points: 3, statusCategory: "in_progress",
  assigneeId: "hugo", backlogId: "data", backlogKey: "DATA", doneAt: null, ...over,
});

// Tuesday 3 November 2026; the 11th is a holiday.
const data: PresenceDataset = {
  today: "2026-11-03",
  viewerId: "camille",
  backlogs: [
    { id: "data", key: "DATA", name: "Données", color: "#7c3030", members: ["camille", "hugo", "ines"] },
    { id: "pen", key: "PEN", name: "Pénal", color: "#2f5d8a", members: ["hugo", "ines"] },
  ],
  people: [
    { id: "hugo", name: "Hugo Lefèvre", profile: "developer" },
    { id: "camille", name: "Camille Morel", profile: "developer" },
    { id: "ines", name: "Inès Garnier", profile: "product" },
  ],
  absences: [
    { id: "a1", userId: "hugo", startDate: "2026-11-03", startHalf: "am", endDate: "2026-11-06", endHalf: "pm" },
    { id: "a2", userId: "hugo", startDate: "2026-11-09", startHalf: "pm", endDate: "2026-11-10", endHalf: "am" },
  ],
  tickets: [
    ticket({ id: "1", startedAt: "2026-10-28", doneAt: "2026-11-02", statusCategory: "done", statusName: "Terminé" }),
    ticket({ id: "2", startedAt: "2026-10-30" }),
    ticket({ id: "3", startedAt: "2026-11-02", backlogId: "pen", backlogKey: "PEN", key: "PEN-3" }),
    ticket({ id: "4", startedAt: "2026-11-02", assigneeId: "camille" }),
  ],
  sprints: { data: [{ id: "s8", name: "Sprint 8", state: "active", start: "2026-10-27", end: "2026-11-07" }, { id: "s9", name: "Sprint 9", state: "planned", start: "2026-11-10", end: "2026-11-21" }] },
  managedBacklogIds: ["data"],
};
const absences = toAbsences(data.absences);

describe("the people and tickets of a scope", () => {
  it("groups developers then product, by name, within the scope", () => {
    expect(visiblePeople(data, "all")).toEqual({
      developers: [data.people[1], data.people[0]],
      product: [data.people[2]],
    });
    expect(visiblePeople(data, "pen").developers.map((person) => person.id)).toEqual(["hugo"]);
  });

  it("keeps a person's tickets of the scope, earliest first", () => {
    expect(ticketsOf(data, "hugo", "all").map((ticket) => ticket.id)).toEqual(["1", "2", "3"]);
    expect(ticketsOf(data, "hugo", "pen").map((ticket) => ticket.id)).toEqual(["3"]);
    expect(ticketsOf(data, "ines", "all")).toEqual([]);
  });

  it("lays the tickets on two lanes and draws each day's segments", () => {
    const tickets = ticketsOf(data, "hugo", "all");
    const lanes = laneOf(tickets, data.today);
    expect([...lanes.entries()]).toEqual([["1", 0], ["2", 1], ["3", 2]]);
    const monday = segmentsOn(tickets, lanes, "2026-11-02", data.today, "2026-11-30");
    expect(monday[0]).toMatchObject({ ticket: { id: "1" }, starts: false, ends: true, goesOn: false });
    expect(monday[1]).toMatchObject({ ticket: { id: "2" }, starts: false, ends: false, goesOn: false });
    const today = segmentsOn(tickets, lanes, "2026-11-03", data.today, "2026-11-30");
    expect(today[0]).toBeNull();
    expect(today[1]).toMatchObject({ ticket: { id: "2" }, goesOn: true });
  });
});

describe("the cells", () => {
  it("tells a free, away, later or non-working half-day", () => {
    expect(halfState(absences, "hugo", "2026-11-03", "am", data.today)).toBe("away");
    expect(halfState(absences, "hugo", "2026-11-04", "pm", data.today)).toBe("future");
    expect(halfState(absences, "hugo", "2026-11-09", "am", data.today)).toBe("free");
    expect(halfState(absences, "hugo", "2026-11-09", "pm", data.today)).toBe("future");
    expect(halfState(absences, "hugo", "2026-11-07", "am", data.today)).toBe("off");
    expect(halfState(absences, "hugo", "2026-11-11", "am", data.today)).toBe("off");
  });

  it("sums a person's period: days away in halves, tickets done and open", () => {
    expect(personSummary(data, "all", "hugo", "2026-11-01", "2026-11-30")).toEqual({ away: 5, done: 1, doing: 2 });
    expect(personSummary(data, "all", "hugo", "2026-10-01", "2026-11-02")).toEqual({ away: 0, done: 1, doing: 2 });
    expect(personSummary(data, "pen", "hugo", "2026-11-01", "2026-11-30")).toEqual({ away: 5, done: 0, doing: 1 });
  });

  it("bands the sprints over the days, with their state", () => {
    const days = ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"];
    expect(sprintBands(days, data.sprints.data!, data.today)).toEqual([
      { sprint: data.sprints.data![0], span: 2, state: "active" },
      { sprint: null, span: 2, state: null },
      { sprint: data.sprints.data![1], span: 2, state: "planned" },
    ]);
  });
});

describe("a selection", () => {
  it("snaps onto working half-days, in order, and may vanish", () => {
    expect(snapSelection("hugo", { day: "2026-11-10", half: "pm" }, { day: "2026-11-06", half: "am" }))
      .toEqual({ personId: "hugo", from: { day: "2026-11-06", half: "am" }, to: { day: "2026-11-10", half: "pm" } });
    // Started on the Saturday, ended on the holiday: Monday morning to Tuesday afternoon.
    expect(snapSelection("hugo", { day: "2026-11-07", half: "pm" }, { day: "2026-11-11", half: "am" }))
      .toEqual({ personId: "hugo", from: { day: "2026-11-09", half: "am" }, to: { day: "2026-11-10", half: "pm" } });
    expect(snapSelection("hugo", { day: "2026-11-07", half: "am" }, { day: "2026-11-08", half: "pm" })).toBeNull();
  });

  it("means a declaration on free half-days, a removal on absent ones, nothing when they mix", () => {
    const free = snapSelection("hugo", { day: "2026-11-12", half: "am" }, { day: "2026-11-13", half: "pm" })!;
    expect(selectionOutcome(absences, free)).toEqual({ kind: "declare", days: 2 });
    const away = snapSelection("hugo", { day: "2026-11-04", half: "pm" }, { day: "2026-11-05", half: "am" })!;
    expect(selectionOutcome(absences, away)).toEqual({ kind: "remove", days: 1 });
    const mixed = snapSelection("hugo", { day: "2026-11-06", half: "am" }, { day: "2026-11-09", half: "pm" })!;
    expect(selectionOutcome(absences, mixed)).toEqual({ kind: "mixed", days: 2 });
  });

  it("names the absences a removal carves, clipped to the selection", () => {
    const across = snapSelection("hugo", { day: "2026-11-05", half: "pm" }, { day: "2026-11-09", half: "pm" })!;
    expect(removalsFor(absences, across)).toEqual([
      { absenceId: "a1", from: { day: "2026-11-05", half: "pm" }, to: { day: "2026-11-06", half: "pm" } },
      { absenceId: "a2", from: { day: "2026-11-09", half: "pm" }, to: { day: "2026-11-09", half: "pm" } },
    ]);
  });

  it("finds the backlog whose rights apply to a person", () => {
    expect(rightsBacklogFor(data, "camille")).toBe("data");
    expect(rightsBacklogFor(data, "hugo")).toBe("data");
    expect(rightsBacklogFor({ ...data, managedBacklogIds: ["pen"] }, "hugo")).toBe("pen");
    expect(rightsBacklogFor({ ...data, managedBacklogIds: [] }, "hugo")).toBeNull();
  });
});

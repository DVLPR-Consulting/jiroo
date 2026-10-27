import { describe, expect, it } from "vitest";
import { LE_POINT_DEMO } from "@/lib/le-point/fixtures";
import { presentInSprint, sprintForecast } from "@/lib/le-point/forecast";
import type { LePointDataset, LePointTicket } from "@/lib/le-point/model";

// Tuesday 3 November 2026, in a sprint running from 27 October to 7 November (a Saturday).
const base: LePointDataset = {
  today: "2026-11-03",
  lastVisit: "2026-10-28",
  backlog: { key: "T", name: "Test" },
  people: [{ id: "ana", name: "Ana Roux" }],
  personas: { developer: "ana", product: "ana" },
  sprint: { name: "Sprint 1", start: "2026-10-27", end: "2026-11-07" },
  releases: [],
  objectives: [],
  tickets: [],
  mentions: [],
};
const ticket = (key: string, over: Partial<LePointTicket> = {}): LePointTicket => ({
  key, title: key, objective: null, status: "À faire", category: "todo", assignee: "ana", due: null, lastActivity: null, inSprint: true, ...over,
});
const done = (key: string, points: number) => ticket(key, { status: "Terminé", category: "done", points });
const todo = (key: string, points: number) => ticket(key, { points });
const data = (tickets: LePointTicket[], over: Partial<LePointDataset> = {}): LePointDataset => ({ ...base, tickets, ...over });

describe("sprintForecast", () => {
  it("has nothing to say without a sprint or without any ticket in it", () => {
    expect(sprintForecast(data([todo("T-1", 3)], { sprint: null }), 2)).toBeNull();
    expect(sprintForecast(data([ticket("T-1", { inSprint: false })]), 2)).toBeNull();
  });

  it("reads what is left against the working days left and the people present", () => {
    // 4 working days left (Tuesday to Friday), 5 gone (27 October to 2 November).
    const forecast = sprintForecast(data([done("T-1", 18), todo("T-2", 25)]), 4)!;
    expect(forecast).toMatchObject({ unit: "points", remaining: 25, daysLeft: 4, daysGone: 5, present: 4, needed: 1.6, pace: 0.9, overdue: false });
    expect(forecast.sentence).toBe(
      "Reste 25 pts pour 4 jours ouvrés et 4 personnes présentes : il faudrait 1,6 pt par jour-personne, contre 0,9 pt jusqu’ici.",
    );
  });

  it("agrees its units, and counts tickets when nothing is estimated", () => {
    const one = sprintForecast(data([done("T-1", 2), todo("T-2", 1)]), 1)!;
    expect(one.sentence).toBe("Reste 1 pt pour 4 jours ouvrés et 1 personne présente : il faudrait 0,3 pt par jour-personne, contre 0,4 pt jusqu’ici.");
    const tickets = sprintForecast(data([ticket("T-1", { status: "Terminé", category: "done" }), ticket("T-2"), ticket("T-3")]), 1)!;
    expect(tickets).toMatchObject({ unit: "tickets", remaining: 2, needed: 0.5, pace: 0.2 });
    expect(tickets.sentence).toBe("Reste 2 tickets pour 4 jours ouvrés et 1 personne présente : il faudrait 0,5 ticket par jour-personne, contre 0,2 ticket jusqu’ici.");
  });

  it("has no pace yet on the first day", () => {
    // Nine working days from Tuesday 27 October to Friday 6 November; the Saturday end does not count.
    const forecast = sprintForecast(data([todo("T-1", 10)], { today: "2026-10-27" }), 2)!;
    expect(forecast).toMatchObject({ daysLeft: 9, daysGone: 0, pace: null, needed: 0.6 });
    expect(forecast.sentence).toBe("Reste 10 pts pour 9 jours ouvrés et 2 personnes présentes : il faudrait 0,6 pt par jour-personne ; premier jour, pas encore de rythme.");
  });

  it("leaves the public holidays out of the working days", () => {
    // Monday 9 to Friday 20 November: ten weekdays, less the Armistice on Wednesday the 11th.
    const forecast = sprintForecast(data([todo("T-1", 10)], { today: "2026-11-09", sprint: { name: "Sprint 2", start: "2026-11-09", end: "2026-11-20" } }), 2)!;
    expect(forecast).toMatchObject({ daysLeft: 9, daysGone: 0, needed: 0.6 });
  });

  it("never calls the sprint done while a ticket without weight stays open", () => {
    const unestimated = sprintForecast(data([done("T-1", 8), ticket("T-2")]), 2)!;
    expect(unestimated).toMatchObject({ remaining: 0, needed: null });
    expect(unestimated.sentence).toBe("Tout ce qui est estimé est terminé, mais 1 ticket reste ouvert, sans estimation ou à zéro.");
    const zero = sprintForecast(data([done("T-1", 8), todo("T-2", 0), ticket("T-3")]), 2)!;
    expect(zero.sentence).toBe("Tout ce qui est estimé est terminé, mais 2 tickets restent ouverts, sans estimation ou à zéro.");
  });

  it("counts as present the people holding an open ticket of the sprint, nobody else", () => {
    const tickets = [
      todo("T-1", 20),
      ticket("T-2", { assignee: "bo", inSprint: false, points: 3 }),
      ticket("T-3", { assignee: "cy", status: "Terminé", category: "done", points: 2 }),
      ticket("T-4", { assignee: null, points: 1 }),
    ];
    expect(presentInSprint(data(tickets))).toBe(1);
    const forecast = sprintForecast(data(tickets), presentInSprint(data(tickets)))!;
    expect(forecast).toMatchObject({ present: 1, needed: 5.3 });
    expect(forecast.sentence).toBe("Reste 21 pts pour 4 jours ouvrés et 1 personne présente : il faudrait 5,3 pts par jour-personne, contre 0,4 pt jusqu’ici.");
  });

  it("counts known members as present even when they have no ticket", () => {
    const input = data([todo("T-1", 20)], {
      members: [{ id: "ana", name: "Ana Roux" }, { id: "bo", name: "Bo Martin" }],
    });
    expect(presentInSprint(input)).toBe(2);
    expect(sprintForecast(input, presentInSprint(input))).toMatchObject({ present: 2, needed: 2.5 });
    expect(sprintForecast({ ...input, sprint: null }, presentInSprint(input))).toBeNull();
  });

  it("falls back to distinct open sprint assignees when the member list is empty", () => {
    const input = data([
      todo("T-1", 12), todo("T-2", 8),
      ticket("T-3", { assignee: "bo", inSprint: false }),
      ticket("T-4", { assignee: "cy", category: "done" }),
      ticket("T-5", { assignee: "di", external: true }),
      ticket("T-6", { assignee: null }),
    ], { members: [] });
    expect(presentInSprint(input)).toBe(1);
  });

  it("says so once the planned end is past, or when everything is done", () => {
    const over = sprintForecast(data([done("T-1", 8), todo("T-2", 2)], { today: "2026-11-10" }), 3)!;
    expect(over).toMatchObject({ overdue: true, daysLeft: 0, needed: null });
    expect(over.sentence).toBe("Reste 2 pts après la fin prévue : à terminer, ou à reporter au sprint suivant.");
    expect(sprintForecast(data([done("T-1", 8)]), 3)!.sentence).toBe("Tout le périmètre est terminé.");
  });

  it("does not divide by nobody", () => {
    const forecast = sprintForecast(data([todo("T-1", 5)]), 0)!;
    expect(forecast).toMatchObject({ needed: null, pace: null });
    expect(forecast.sentence).toBe("Reste 5 pts pour 4 jours ouvrés, et personne n’a de ticket dans le sprint.");
  });

  it("takes the declared absences off the person-days, and off the people present today", () => {
    // Ana is away from Wednesday 4 to Friday 6: three of the eight person-days left are lost.
    const away = sprintForecast(data([todo("T-1", 20)], { absences: [{ user: "ana", start: "2026-11-04", end: "2026-11-06" }] }), ["ana", "bo"])!;
    expect(away).toMatchObject({ daysLeft: 4, present: 2, personDaysLeft: 5, needed: 4 });
    expect(away.sentence).toBe("Reste 20 pts pour 4 jours ouvrés et 2 personnes présentes : il faudrait 4 pts par jour-personne, contre 0 pt jusqu’ici.");
    // Away from today: not present, and one person-day left for the other.
    const today = sprintForecast(data([todo("T-1", 20)], { absences: [{ user: "ana", start: "2026-11-03", end: "2026-11-06" }] }), ["ana", "bo"])!;
    expect(today).toMatchObject({ present: 1, personDaysLeft: 4, needed: 5 });
    expect(presentInSprint(data([todo("T-1", 20)], { members: [{ id: "ana", name: "Ana" }, { id: "bo", name: "Bo" }], absences: [{ user: "ana", start: "2026-11-03", end: "2026-11-06" }] }))).toBe(1);
    // Everyone away until the end: no person-day, and the sentence says so rather than blaming the tickets.
    const nobody = sprintForecast(data([todo("T-1", 20)], { absences: [{ user: "ana", start: "2026-11-03", end: "2026-11-06" }] }), ["ana"])!;
    expect(nobody).toMatchObject({ present: 0, personDaysLeft: 0, needed: null });
    expect(nobody.sentence).toBe("Reste 20 pts pour 4 jours ouvrés, et personne n’est présent d’ici la fin prévue.");
  });

  it("reads the demo backlog: 25 points left for four people over four working days", () => {
    expect(sprintForecast(LE_POINT_DEMO, 4)!.sentence).toBe(
      "Reste 25 pts pour 4 jours ouvrés et 4 personnes présentes : il faudrait 1,6 pt par jour-personne, contre 0,9 pt jusqu’ici.",
    );
  });
});

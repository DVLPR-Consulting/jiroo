import { describe, expect, it } from "vitest";
import { LE_POINT_DEMO } from "@/lib/le-point/fixtures";
import { personLight, sprintLight, workingDaysBetween } from "@/lib/le-point/lights";
import type { LePointDataset, LePointTicket } from "@/lib/le-point/model";

// Tuesday 3 November 2026, day 8 of a sprint running from 27 October to 7 November: 64 % of the time gone.
const base: LePointDataset = {
  today: "2026-11-03",
  lastVisit: "2026-10-28",
  backlog: { key: "T", name: "Test" },
  people: [{ id: "ana", name: "Ana Roux" }, { id: "bo", name: "Bo Lenoir" }],
  personas: { developer: "ana", product: "ana" },
  sprint: { name: "Sprint 1", start: "2026-10-27", end: "2026-11-07" },
  releases: [],
  objectives: [],
  tickets: [],
  mentions: [],
};

const ticket = (key: string, over: Partial<LePointTicket> = {}): LePointTicket => ({
  key,
  title: key,
  objective: null,
  status: "À faire",
  category: "todo",
  assignee: "ana",
  due: null,
  lastActivity: null,
  inSprint: true,
  ...over,
});
const done = (key: string, points: number): LePointTicket =>
  ticket(key, { status: "Terminé", category: "done", done: "2026-11-01", points });
const todo = (key: string, points: number): LePointTicket => ticket(key, { points });
const data = (tickets: LePointTicket[], over: Partial<LePointDataset> = {}): LePointDataset => ({ ...base, tickets, ...over });

describe("workingDaysBetween", () => {
  it("counts Monday to Friday after the first day, up to the last", () => {
    expect(workingDaysBetween("2026-10-30", "2026-11-02")).toBe(1); // Friday → Monday
    expect(workingDaysBetween("2026-10-30", "2026-11-03")).toBe(2);
    expect(workingDaysBetween("2026-10-26", "2026-11-02")).toBe(5);
    expect(workingDaysBetween("2026-11-03", "2026-11-03")).toBe(0);
    expect(workingDaysBetween("2026-11-03", "2026-10-30")).toBe(0);
  });
});

describe("sprintLight", () => {
  it("has no light without an active sprint", () => {
    expect(sprintLight(data([todo("T-1", 3)], { sprint: null }))).toBeNull();
  });

  it("says so for a sprint without any ticket", () => {
    expect(sprintLight(data([ticket("T-1", { inSprint: false })]))).toMatchObject({
      color: "none",
      label: "Pas de feu",
      summary: "Le sprint ne contient aucun ticket.",
      details: ["Jour 8 sur 12."],
      elapsedPercent: 64,
      donePercent: 0,
    });
  });

  it("is green when the work done follows the time elapsed", () => {
    const light = sprintLight(data([done("T-1", 6), todo("T-2", 4)]))!;
    expect(light).toMatchObject({
      color: "green",
      label: "Vert",
      tone: "success",
      summary: "Le travail terminé suit le temps écoulé.",
      elapsedPercent: 64,
      donePercent: 60,
      unit: "points",
    });
    expect(light.details).toEqual(["64 % du temps écoulé (jour 8 sur 12), 60 % des points terminés (6 sur 10)."]);
  });

  it("says when the sprint is ahead", () => {
    expect(sprintLight(data([done("T-1", 9), todo("T-2", 1)]))).toMatchObject({
      color: "green",
      summary: "En avance : 64 % du temps écoulé pour 90 % des points terminés.",
    });
  });

  it("turns amber beyond 10 points of gap and red beyond 25", () => {
    expect(sprintLight(data([done("T-1", 4), todo("T-2", 6)]))).toMatchObject({
      color: "amber",
      label: "Orange",
      tone: "warning",
      summary: "À surveiller : 64 % du temps écoulé pour 40 % des points terminés.",
    });
    expect(sprintLight(data([done("T-1", 2), todo("T-2", 8)]))).toMatchObject({
      color: "red",
      label: "Rouge",
      tone: "danger",
      summary: "En retard : 64 % du temps écoulé pour 20 % des points terminés.",
    });
  });

  it("turns amber when more than 20 % of the initial commitment was added since the start", () => {
    const light = sprintLight(data([done("T-1", 7), todo("T-2", 3), ticket("T-3", { points: 3, addedAfterStart: true })]))!;
    expect(light).toMatchObject({ color: "amber", summary: "À surveiller : périmètre ajouté de 30 %.", donePercent: 54 });
    expect(light.details[1]).toBe("1 ticket ajouté depuis le début du sprint : 3 points, 30 % de l’engagement initial.");
  });

  it("turns amber on a blocked ticket, and ignores a block already lifted", () => {
    const blocked = data([
      done("T-1", 6),
      ticket("T-2", { points: 4, blockedBy: [{ key: "T-9" }] }),
      ticket("T-9", { inSprint: false, status: "En cours", category: "in_progress" }),
    ]);
    expect(sprintLight(blocked)).toMatchObject({ color: "amber", summary: "À surveiller : 1 ticket bloqué." });
    expect(sprintLight(blocked)!.details[1]).toBe("1 ticket bloqué : T-2.");
    const lifted = data([done("T-1", 6), ticket("T-2", { points: 4, blockedBy: [{ key: "T-9" }] }), done("T-9", 1)]);
    expect(sprintLight(lifted)!.color).toBe("green");
  });

  it("stacks the concerns in its summary", () => {
    const light = sprintLight(data([done("T-1", 2), ticket("T-2", { points: 8, blockedBy: [{ hidden: true }] })]))!;
    expect(light.summary).toBe("En retard : 64 % du temps écoulé pour 20 % des points terminés, 1 ticket bloqué.");
  });

  it("counts tickets when nothing is estimated, and names the unestimated ones otherwise", () => {
    const tickets = sprintLight(data([done("T-1", 0), ticket("T-2"), ticket("T-3"), ticket("T-4", { status: "Terminé", category: "done" })]))!;
    expect(tickets).toMatchObject({ unit: "tickets", donePercent: 50, color: "amber" });
    expect(tickets.details).toEqual([
      "64 % du temps écoulé (jour 8 sur 12), 50 % des tickets terminés (2 sur 4).",
      "Aucun ticket estimé : le feu compte les tickets.",
    ]);
    const mixed = sprintLight(data([done("T-1", 5), todo("T-2", 5), ticket("T-3")]))!;
    expect(mixed).toMatchObject({ unit: "points", donePercent: 50 });
    expect(mixed.details[1]).toBe("1 ticket sans estimation, non compté.");
  });

  it("counts the whole time once the planned end is past", () => {
    const light = sprintLight(data([done("T-1", 8), todo("T-2", 2)], { today: "2026-11-10" }))!;
    expect(light).toMatchObject({ elapsedPercent: 100, donePercent: 80, color: "amber" });
    expect(light.details[0]).toBe("100 % du temps écoulé (fin prévue le 7 nov., dépassée de 3 jours), 80 % des points terminés (8 sur 10).");
  });

  it("has nothing elapsed before the sprint starts", () => {
    const light = sprintLight(data([todo("T-1", 5)], { today: "2026-10-20" }))!;
    expect(light).toMatchObject({ elapsedPercent: 0, donePercent: 0, color: "green" });
    expect(light.details[0]).toBe("0 % du temps écoulé (commence le 27 oct.), 0 % des points terminés (0 sur 5).");
  });

  it("reads only the sprint's own tickets", () => {
    const light = sprintLight(data([
      done("T-1", 5),
      todo("T-2", 5),
      ticket("T-3", { inSprint: false, points: 90 }),
      ticket("X-1", { external: true, inSprint: true, points: 90 }),
    ]))!;
    expect(light.donePercent).toBe(50);
  });

  it("measures the scope added against the commitment frozen at the start, not the scope still here", () => {
    const halfway = { name: "Sprint 2", start: "2026-10-20", end: "2026-11-03" };
    // 100 points committed, 80 of them removed since, 5 added: 5 % of the commitment.
    const removed = sprintLight(data(
      [done("T-1", 20), ticket("T-2", { points: 5, addedAfterStart: true })],
      { today: "2026-10-27", sprint: { ...halfway, commitment: { points: 100, tickets: 6 } } },
    ))!;
    expect(removed).toMatchObject({ color: "green", summary: "En avance : 50 % du temps écoulé pour 80 % des points terminés." });
    expect(removed.details[1]).toBe("1 ticket ajouté depuis le début du sprint : 5 points, 5 % de l’engagement initial.");
    // 20 points committed, re-estimated to 100 since, 10 added: half of the commitment.
    const reestimated = sprintLight(data(
      [done("T-1", 100), ticket("T-2", { points: 10, addedAfterStart: true })],
      { today: "2026-10-27", sprint: { ...halfway, commitment: { points: 20, tickets: 1 } } },
    ))!;
    expect(reestimated).toMatchObject({ color: "amber", summary: "À surveiller : périmètre ajouté de 50 %." });
    // Counting tickets, the commitment is its number of tickets.
    const tickets = sprintLight(data(
      [ticket("T-1", { status: "Terminé", category: "done" }), ticket("T-2"), ticket("T-3", { addedAfterStart: true })],
      { today: "2026-10-27", sprint: { ...halfway, commitment: { points: 0, tickets: 4 } } },
    ))!;
    expect(tickets.details[1]).toBe("1 ticket ajouté depuis le début du sprint : 1 ticket, 25 % de l’engagement initial.");
  });

  it("compares the raw ratios to the thresholds and rounds only what it shows", () => {
    const halfway = { today: "2026-10-27", sprint: { name: "Sprint 2", start: "2026-10-20", end: "2026-11-03" } };
    // 39,6 % done at 50 % of the time: a gap of 10,4, shown as 50 − 40.
    expect(sprintLight(data([done("T-1", 99), todo("T-2", 151)], halfway))).toMatchObject({ color: "amber", donePercent: 40 });
    expect(sprintLight(data([done("T-1", 40), todo("T-2", 60)], halfway))).toMatchObject({ color: "green", donePercent: 40 });
    // 24,6 % done: a gap of 25,4, shown as 50 − 25.
    expect(sprintLight(data([done("T-1", 123), todo("T-2", 377)], halfway))).toMatchObject({ color: "red", donePercent: 25 });
    expect(sprintLight(data([done("T-1", 25), todo("T-2", 75)], halfway))).toMatchObject({ color: "amber", donePercent: 25 });
    // 20,4 points added on a commitment of 100.
    const added = sprintLight(data(
      [done("T-1", 50), todo("T-2", 50), ticket("T-3", { points: 20.4, addedAfterStart: true })],
      { ...halfway, sprint: { ...halfway.sprint, commitment: { points: 100, tickets: 2 } } },
    ))!;
    expect(added).toMatchObject({ color: "amber", summary: "À surveiller : périmètre ajouté de 20 %." });
    expect(added.details[1]).toBe("1 ticket ajouté depuis le début du sprint : 20,4 points, 20 % de l’engagement initial.");
  });

  it("agrees the unit of the scope added with its figure", () => {
    const one = sprintLight(data([done("T-1", 7), todo("T-2", 3), ticket("T-3", { points: 1, addedAfterStart: true })]))!;
    expect(one.details[1]).toBe("1 ticket ajouté depuis le début du sprint : 1 point, 10 % de l’engagement initial.");
    const half = sprintLight(data([done("T-1", 7), todo("T-2", 3), ticket("T-3", { points: 1.5, addedAfterStart: true })]))!;
    expect(half.details[1]).toBe("1 ticket ajouté depuis le début du sprint : 1,5 point, 15 % de l’engagement initial.");
  });

  it("reads the demo backlog as amber, with its reasons", () => {
    expect(sprintLight(LE_POINT_DEMO)).toMatchObject({
      color: "amber",
      summary: "À surveiller : 64 % du temps écoulé pour 42 % des points terminés, 2 tickets bloqués.",
      details: [
        "64 % du temps écoulé (jour 8 sur 12), 42 % des points terminés (18 sur 43).",
        "1 ticket ajouté depuis le début du sprint : 2 points, 5 % de l’engagement initial.",
        "2 tickets bloqués : DEMO-15, DEMO-33.",
      ],
    });
  });
});

describe("personLight", () => {
  const doing = (key: string, lastActivity: string | null, over: Partial<LePointTicket> = {}) =>
    ticket(key, { status: "En cours", category: "in_progress", lastActivity, ...over });

  it("is green while the tickets in progress move", () => {
    expect(personLight(data([doing("T-1", "2026-11-02"), todo("T-2", 3)]), "ana")).toEqual({
      color: "green",
      label: "En rythme",
      summary: "Ses tickets en cours avancent.",
      details: ["1 ticket en cours, 1 à faire."],
      tone: "success",
    });
  });

  it("is amber after 3 working days without activity on a ticket in progress", () => {
    const light = personLight(data([doing("T-1", "2026-10-28"), doing("T-2", "2026-11-02")]), "ana");
    expect(light).toMatchObject({
      color: "amber",
      label: "À surveiller",
      summary: "1 ticket en cours sans activité depuis 3 jours ouvrés.",
      details: ["2 tickets en cours, 0 à faire.", "T-1 en cours sans activité depuis 4 jours ouvrés."],
    });
  });

  it("is amber on a blocked ticket, even one still to do", () => {
    const light = personLight(data([ticket("T-1", { blockedBy: [{ hidden: true }] }), doing("T-2", "2026-11-02")]), "ana");
    expect(light).toMatchObject({ color: "amber", summary: "1 ticket bloqué.", details: ["1 ticket en cours, 1 à faire.", "T-1 bloqué."] });
  });

  it("is red when nothing in progress moved for 5 working days", () => {
    const stuck = personLight(data([doing("T-1", "2026-10-26"), doing("T-2", "2026-10-23")]), "ana");
    expect(stuck).toMatchObject({ color: "red", label: "En difficulté", summary: "Plus rien n’a bougé depuis 5 jours ouvrés.", tone: "danger" });
    // One ticket still moving: a warning, not a red light.
    const moving = personLight(data([doing("T-1", "2026-10-26"), doing("T-2", "2026-11-03")]), "ana");
    expect(moving).toMatchObject({ color: "amber", summary: "1 ticket en cours sans activité depuis 3 jours ouvrés." });
  });

  it("is red with 4 tickets in progress at once", () => {
    const tickets = ["T-1", "T-2", "T-3", "T-4"].map((key) => doing(key, "2026-11-03"));
    expect(personLight(data(tickets), "ana")).toMatchObject({ color: "red", summary: "4 tickets en cours en même temps." });
  });

  it("is « Disponible » without any ticket in progress", () => {
    expect(personLight(data([todo("T-1", 2), todo("T-2", 2)]), "ana")).toEqual({
      color: "none",
      label: "Disponible",
      summary: "Aucun ticket en cours.",
      details: ["0 ticket en cours, 2 à faire."],
      tone: "neutral",
    });
  });

  it("never calls a ticket without any known activity idle", () => {
    expect(personLight(data([doing("T-1", null)]), "ana").color).toBe("green");
  });

  it("reads the sprint's tickets and anything in progress, or every committed ticket without a sprint", () => {
    const tickets = [
      doing("T-1", "2026-11-03", { inSprint: false }),
      ticket("T-2", { inSprint: false }),
      ticket("T-3", { inSprint: false, committed: false }),
      ticket("T-4", { assignee: "bo" }),
    ];
    expect(personLight(data(tickets), "ana").details).toEqual(["1 ticket en cours, 0 à faire."]);
    expect(personLight(data(tickets, { sprint: null }), "ana").details).toEqual(["1 ticket en cours, 1 à faire."]);
  });

  it("gives each person of the demo backlog a different light", () => {
    const colors = Object.fromEntries(["camille", "lea", "hugo", "ines"].map((id) => [id, personLight(LE_POINT_DEMO, id).color]));
    expect(colors).toEqual({ camille: "amber", lea: "amber", hugo: "green", ines: "none" });
    expect(personLight(LE_POINT_DEMO, "camille").details).toEqual(["1 ticket en cours, 2 à faire.", "DEMO-15 bloqué."]);
  });
});

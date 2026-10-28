import { describe, expect, it } from "vitest";
import { LE_POINT_DEMO } from "@/lib/le-point/fixtures";
import {
  developerView,
  productView,
  type LePointDataset,
} from "@/lib/le-point/model";

const keys = (cards: { key: string }[]) => cards.map((card) => card.key);

// The expected answers validated on 2026-10-20 (JIR-107, section 2).
describe("developer perspective (Camille)", () => {
  const view = developerView(LE_POINT_DEMO, { kind: "me", viewerId: "camille" });

  it("puts the ticket in progress first, with its due day", () => {
    expect(keys(view.resume)).toEqual(["DEMO-12"]);
    expect(view.resume[0]).toMatchObject({
      objective: { key: "DEMO-2", title: "Publier les arrêts en ligne" },
      reason: "En cours ; échéance le 5 nov., dans 2 jours.",
    });
  });

  it("explains what blocks her and who holds the dependency", () => {
    expect(keys(view.blocked)).toEqual(["DEMO-15"]);
    expect(view.blocked[0]).toMatchObject({
      reason: "Attend DEMO-9 « API de signature électronique », en cours chez Hugo Lefèvre.",
      links: ["DEMO-9"],
    });
  });

  it("lists the overdue ticket next and keeps undated ones apart", () => {
    expect(keys(view.next)).toEqual(["DEMO-21"]);
    expect(view.next[0]!.reason).toBe("Échéance dépassée de 6 jours (28 oct.).");
    expect(keys(view.withoutDue)).toEqual(["DEMO-22"]);
    expect(view.withoutDue[0]!.reason).toBe("Pas d’échéance.");
  });

  it("tells what changed since the last visit, newest first", () => {
    expect(keys(view.recent)).toEqual(["DEMO-25", "DEMO-18"]);
    expect(view.recent[0]!.reason).toBe("Terminé le 2 nov.");
    expect(view.recent[1]!.reason).toBe("Terminé le 30 oct. ; DEMO-4, qui le bloquait, est terminé.");
  });

  it("never shows another person's blocked ticket", () => {
    expect(keys(view.blocked)).not.toContain("DEMO-33");
  });
});

describe("product perspective (Inès)", () => {
  const view = productView(LE_POINT_DEMO, { kind: "me", viewerId: "ines" });

  it("starts with the decision explicitly asked of her, with its source", () => {
    expect(keys(view.decisions)).toEqual(["DEMO-31"]);
    expect(view.decisions[0]!.reason).toBe(
      "Demandé par Hugo Lefèvre dans un commentaire du 30 oct. ; échéance le 7 nov.",
    );
  });

  it("summarises each objective apart from its delivery", () => {
    expect(view.objectives).toEqual([
      {
        key: "DEMO-2",
        title: "Publier les arrêts en ligne",
        total: 9,
        done: 5,
        inProgress: 2,
        blocked: 1,
        todo: 1,
        due: "2026-11-14",
        delivery: "Prévu dans la livraison 1.3, planifiée le 14 nov.",
        deliveryTag: "1.3 · 14 nov.",
      },
      {
        key: "DEMO-3",
        title: "Recherche avancée",
        total: 4,
        done: 4,
        inProgress: 0,
        blocked: 0,
        todo: 0,
        due: null,
        delivery: "Terminé — pas encore livré : la livraison 1.3 n’est pas publiée.",
        deliveryTag: "1.3 · à publier",
      },
      {
        key: "DEMO-5",
        title: "Notifications aux greffes",
        total: 3,
        done: 0,
        inProgress: 0,
        blocked: 1,
        todo: 2,
        due: null,
        delivery: "Aucune livraison prévue.",
        deliveryTag: "Aucune",
      },
    ]);
  });

  it("lists what puts an objective at risk, without inventing a cause", () => {
    expect(keys(view.difficulties)).toEqual(["DEMO-15", "DEMO-30", "DEMO-33"]);
    expect(view.difficulties.map((card) => card.reason)).toEqual([
      "Bloqué : attend DEMO-9 « API de signature électronique », en cours chez Hugo Lefèvre.",
      "Personne n’est assigné.",
      "Bloqué : attend un ticket que tu ne peux pas voir.",
    ]);
  });

  it("names the next delivery and what is still open in it", () => {
    expect(view.nextRelease).toEqual({
      name: "1.3",
      planned: "2026-11-14",
      objectives: [
        { key: "DEMO-2", title: "Publier les arrêts en ligne" },
        { key: "DEMO-3", title: "Recherche avancée" },
      ],
      openCount: 4,
    });
  });
});

describe("edge cases", () => {
  const base: LePointDataset = {
    ...LE_POINT_DEMO,
    tickets: [],
    mentions: [],
    objectives: [],
    releases: [],
  };

  it("does not count a done dependency as a block", () => {
    const data: LePointDataset = {
      ...base,
      tickets: [
        { key: "A", title: "A", objective: null, status: "À faire", category: "todo", assignee: "camille", due: null, blockedBy: [{ key: "B" }], lastActivity: null },
        { key: "B", title: "B", objective: null, status: "Terminé", category: "done", assignee: "hugo", due: null, done: "2026-10-01", lastActivity: null },
      ],
    };
    const view = developerView(data, { kind: "me", viewerId: "camille" });
    expect(view.blocked).toEqual([]);
    expect(keys(view.withoutDue)).toEqual(["A"]);
  });

  it("does not name anyone for an unassigned dependency", () => {
    const data: LePointDataset = {
      ...base,
      tickets: [
        { key: "A", title: "A", objective: null, status: "À faire", category: "todo", assignee: "camille", due: null, blockedBy: [{ key: "B" }], lastActivity: null },
        { key: "B", title: "Dépendance", objective: null, status: "À faire", category: "todo", assignee: null, due: null, lastActivity: null },
      ],
    };
    expect(developerView(data, { kind: "me", viewerId: "camille" }).blocked[0]!.reason).toBe(
      "Attend B « Dépendance », à faire, sans assigné.",
    );
  });

  it("orders several tickets in progress by their due day, undated last", () => {
    const data: LePointDataset = {
      ...base,
      tickets: [
        { key: "A", title: "A", objective: null, status: "En cours", category: "in_progress", assignee: "camille", due: null, lastActivity: null },
        { key: "B", title: "B", objective: null, status: "En cours", category: "in_progress", assignee: "camille", due: "2026-11-10", lastActivity: null },
        { key: "C", title: "C", objective: null, status: "En cours", category: "in_progress", assignee: "camille", due: "2026-11-04", lastActivity: null },
      ],
    };
    const view = developerView(data, { kind: "me", viewerId: "camille" });
    expect(keys(view.resume)).toEqual(["C", "B", "A"]);
    expect(view.resume.map((card) => card.reason)).toEqual([
      "En cours ; échéance demain, le 4 nov.",
      "En cours ; échéance le 10 nov., dans 7 jours.",
      "En cours ; pas d’échéance.",
    ]);
  });

  it("dates each dependency that released a ticket since the last visit", () => {
    const data: LePointDataset = {
      ...base,
      tickets: [
        { key: "A", title: "A", objective: null, status: "À faire", category: "todo", assignee: "camille", due: null, blockedBy: [{ key: "B" }, { key: "C" }], lastActivity: null },
        { key: "B", title: "B", objective: null, status: "Terminé", category: "done", assignee: "hugo", due: null, done: "2026-10-29", lastActivity: null },
        { key: "C", title: "C", objective: null, status: "Terminé", category: "done", assignee: "hugo", due: null, done: "2026-11-02", lastActivity: null },
      ],
    };
    expect(developerView(data, { kind: "me", viewerId: "camille" }).recent[0]!.reason).toBe(
      "N’est plus bloqué : B terminé le 29 oct., C terminé le 2 nov.",
    );
  });

  it("names an unknown dependency without offering to open it", () => {
    const data: LePointDataset = {
      ...base,
      tickets: [
        { key: "A", title: "A", objective: null, status: "À faire", category: "todo", assignee: "camille", due: null, blockedBy: [{ key: "MISSING" }], lastActivity: null },
      ],
    };
    const [blocked] = developerView(data, { kind: "me", viewerId: "camille" }).blocked;
    expect(blocked).toMatchObject({ reason: "Attend MISSING, un ticket introuvable.", links: [] });
  });

  it("ignores a mention on a ticket already done", () => {
    const data: LePointDataset = {
      ...base,
      tickets: [
        { key: "A", title: "A", objective: null, status: "Terminé", category: "done", assignee: "ines", due: null, done: "2026-10-30", lastActivity: null },
      ],
      mentions: [{ ticket: "A", author: "hugo", mentioned: "ines", day: "2026-10-29", text: "@Inès" }],
    };
    expect(productView(data, { kind: "me", viewerId: "ines" }).decisions).toEqual([]);
  });

  it("has no next delivery when every release is published", () => {
    const data: LePointDataset = {
      ...base,
      releases: [{ name: "1.0", planned: "2026-10-01", released: "2026-10-01" }],
    };
    expect(productView(data, { kind: "me", viewerId: "ines" }).nextRelease).toBeNull();
  });
});

describe("row tags", () => {
  it("says each reason in a few words, coloured by urgency", () => {
    const dev = developerView(LE_POINT_DEMO, { kind: "me", viewerId: "camille" });
    expect(dev.resume.map((card) => [card.key, card.tag, card.tone])).toEqual([["DEMO-12", "Échéance 5 nov.", "warning"]]);
    expect(dev.blocked.map((card) => [card.tag, card.tone])).toEqual([["Attend DEMO-9", "danger"]]);
    expect(dev.next[0]).toMatchObject({ key: "DEMO-21", tag: "En retard de 6 jours", tone: "danger" });
    expect(dev.withoutDue[0]).toMatchObject({ tag: "Sans échéance", tone: "neutral" });
    expect(dev.recent.map((card) => card.tag)).toEqual(["Terminé le 2 nov.", "Terminé le 30 oct."]);
    const product = productView(LE_POINT_DEMO, { kind: "me", viewerId: "ines" });
    expect(product.decisions[0]).toMatchObject({ tag: "Demandé par Hugo L.", tone: "warning" });
    expect(product.difficulties.map((card) => [card.key, card.tag])).toEqual([
      ["DEMO-15", "Attend DEMO-9"],
      ["DEMO-30", "Sans assigné"],
      ["DEMO-33", "Attend un ticket caché"],
    ]);
  });
});


describe("team scope", () => {
  it("shows work from every assignee in the existing order", () => {
    const view = developerView(LE_POINT_DEMO, { kind: "team" });
    expect(keys(view.resume)).toEqual(["DEMO-12", "DEMO-9", "DEMO-27"]);
    expect(keys(view.blocked)).toEqual(["DEMO-15", "DEMO-33"]);
    expect(keys(view.next)).toEqual(["DEMO-21", "DEMO-31"]);
    expect(keys(view.withoutDue)).toEqual(["DEMO-30", "DEMO-34", "DEMO-22"]);
    expect(keys(view.recent)).toEqual(["DEMO-25", "DEMO-18", "DEMO-4"]);
  });

  it("counts open work by assignee and leaves unassigned work last", () => {
    expect(developerView(LE_POINT_DEMO, { kind: "team" }).workload).toEqual([
      // Points: the open tickets' estimates, null when none is estimated (JIR-124, Léo).
      { assignee: "camille", name: "Camille Morel", open: 4, inProgress: 1, blocked: 1, points: 9, inProgressPoints: 5 },
      { assignee: "lea", name: "Léa Martin", open: 3, inProgress: 1, blocked: 1, points: 7, inProgressPoints: 3 },
      { assignee: "hugo", name: "Hugo Lefèvre", open: 1, inProgress: 1, blocked: 0, points: 8, inProgressPoints: 8 },
      { assignee: "ines", name: "Inès Garnier", open: 1, inProgress: 0, blocked: 0, points: 1, inProgressPoints: null },
      { assignee: null, name: "Sans assigné", open: 1, inProgress: 0, blocked: 0, points: null, inProgressPoints: null },
    ]);
    expect(developerView(LE_POINT_DEMO, { kind: "me", viewerId: "camille" }).workload).toEqual([]);
  });

  it("keeps only committed undated work in team scope, preserving personal scope", () => {
    const data: LePointDataset = {
      ...LE_POINT_DEMO,
      tickets: [
        ...LE_POINT_DEMO.tickets.map((ticket) =>
          ["DEMO-22", "DEMO-34"].includes(ticket.key) ? { ...ticket, committed: false } : ticket),
        { key: "DEMO-80", title: "Uncommitted queue", objective: null, status: "À faire", category: "todo", assignee: null, due: null, committed: false, lastActivity: null },
      ],
    };
    const team = developerView(data, { kind: "team" });
    expect(keys(team.withoutDue)).toEqual(["DEMO-30"]);
    expect(team.workload.find((row) => row.assignee === null)).toEqual(
      { assignee: null, name: "Sans assigné", open: 1, inProgress: 0, blocked: 0, points: null, inProgressPoints: null },
    );
    expect(team.workload.find((row) => row.assignee === "lea")!.open).toBe(3);
    expect(keys(developerView(data, { kind: "me", viewerId: "camille" }).withoutDue)).toEqual(["DEMO-22"]);
  });

  it("excludes external tickets from work and workload but keeps their blocking facts", () => {
    const data: LePointDataset = {
      ...LE_POINT_DEMO,
      tickets: LE_POINT_DEMO.tickets.map((ticket) =>
        ["DEMO-9", "DEMO-4", "DEMO-30"].includes(ticket.key) ? { ...ticket, external: true } : ticket),
    };
    const view = developerView(data, { kind: "team" });
    expect(keys(view.resume)).toEqual(["DEMO-12", "DEMO-27"]);
    expect(keys(view.recent)).toEqual(["DEMO-25", "DEMO-18"]);
    expect(keys(view.withoutDue)).toEqual(["DEMO-34", "DEMO-22"]);
    expect(view.workload.map((row) => row.assignee)).toEqual(["camille", "lea", "ines"]);
    expect(view.blocked[0]).toMatchObject({ tag: "Attend DEMO-9", links: ["DEMO-9"] });
  });

  it("counts a blocked ticket in progress in both workload columns", () => {
    const data: LePointDataset = {
      ...LE_POINT_DEMO,
      tickets: LE_POINT_DEMO.tickets.map((ticket) => ticket.key === "DEMO-33"
        ? { ...ticket, category: "in_progress", status: "En cours" } : ticket),
    };
    expect(developerView(data, { kind: "team" }).workload.find((row) => row.assignee === "lea"))
      .toEqual({ assignee: "lea", name: "Léa Martin", open: 3, inProgress: 2, blocked: 1, points: 7, inProgressPoints: 5 });
  });

  it("breaks equal workloads by French names", () => {
    const data: LePointDataset = {
      ...LE_POINT_DEMO,
      people: LE_POINT_DEMO.people.map((person) => person.id === "hugo"
        ? { ...person, name: "Élodie Martin" } : person.id === "ines" ? { ...person, name: "Zoé Martin" } : person),
    };
    expect(developerView(data, { kind: "team" }).workload.map((row) => row.name))
      .toEqual(["Camille Morel", "Léa Martin", "Élodie Martin", "Zoé Martin", "Sans assigné"]);
  });

  it("shows the team even when the reader has no assigned work", () => {
    const data = { ...LE_POINT_DEMO, personas: { developer: "observer", product: "observer" } };
    expect(keys(developerView(data, { kind: "team" }).resume)).toEqual(["DEMO-12", "DEMO-9", "DEMO-27"]);
    expect(developerView(data, { kind: "me", viewerId: "observer" })).toEqual({
      resume: [], blocked: [], next: [], withoutDue: [], recent: [], workload: [],
    });
    expect(keys(productView(data, { kind: "team" }).decisions)).toEqual(["DEMO-31"]);
    expect(productView(data, { kind: "me", viewerId: "observer" }).decisions).toEqual([]);
  });

  it("keeps the latest decision for each ticket and mentioned person, newest first then by key", () => {
    const data: LePointDataset = {
      ...LE_POINT_DEMO,
      mentions: [
        ...LE_POINT_DEMO.mentions,
        { ticket: "DEMO-31", author: "camille", mentioned: "ines", day: "2026-11-01", text: "new request" },
        { ticket: "DEMO-31", author: "lea", mentioned: "ines", day: "2026-10-29", text: "older request" },
        { ticket: "DEMO-31", author: "hugo", mentioned: "lea", day: "2026-11-02", text: "other recipient" },
        { ticket: "DEMO-12", author: "ines", mentioned: "camille", day: "2026-11-02", text: "same day, lower key" },
        { ticket: "DEMO-25", author: "lea", mentioned: "hugo", day: "2026-11-03", text: "already done" },
        { ticket: "MISSING", author: "lea", mentioned: "hugo", day: "2026-11-03", text: "missing ticket" },
      ],
    };
    const decisions = productView(data, { kind: "team" }).decisions;
    expect(decisions.map(({ key, reason, tag, tone }) => ({ key, reason, tag, tone }))).toEqual([
      { key: "DEMO-12", reason: "Demandé à Camille Morel par Inès Garnier dans un commentaire du 2 nov. ; échéance le 5 nov.", tag: "Pour Camille M.", tone: "warning" },
      { key: "DEMO-31", reason: "Demandé à Léa Martin par Hugo Lefèvre dans un commentaire du 2 nov. ; échéance le 7 nov.", tag: "Pour Léa M.", tone: "warning" },
      { key: "DEMO-31", reason: "Demandé à Inès Garnier par Camille Morel dans un commentaire du 1 nov. ; échéance le 7 nov.", tag: "Pour Inès G.", tone: "warning" },
    ]);
    expect(productView(data, { kind: "me", viewerId: "ines" }).decisions[0]!.reason)
      .toBe("Demandé par Camille Morel dans un commentaire du 1 nov. ; échéance le 7 nov.");
  });

  it("does not invent names for an unknown mentioned person or author", () => {
    const data = {
      ...LE_POINT_DEMO,
      mentions: [{ ticket: "DEMO-27", author: "unknown-author", mentioned: "unknown-reader", day: "2026-11-02", text: "request" }],
    };
    expect(productView(data, { kind: "team" }).decisions[0]).toMatchObject({
      reason: "Demandé à quelqu’un par quelqu’un dans un commentaire du 2 nov.",
      tag: "Pour quelqu’un", tone: "warning",
    });
  });

  it("keeps the product's project-wide sections unchanged", () => {
    const team = productView(LE_POINT_DEMO, { kind: "team" });
    const me = productView(LE_POINT_DEMO, { kind: "me", viewerId: "ines" });
    expect(team.objectives).toEqual(me.objectives);
    expect(team.difficulties).toEqual(me.difficulties);
    expect(team.nextRelease).toEqual(me.nextRelease);
  });

  it("returns no workload rows for an empty project", () => {
    const data = { ...LE_POINT_DEMO, tickets: [], mentions: [], objectives: [], releases: [] };
    expect(developerView(data, { kind: "team" })).toEqual({
      resume: [], blocked: [], next: [], withoutDue: [], recent: [], workload: [],
    });
    expect(productView(data, { kind: "team" })).toEqual({ decisions: [], objectives: [], difficulties: [], nextRelease: null });
  });
});

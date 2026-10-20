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
  const view = developerView(LE_POINT_DEMO, "camille");

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
  const view = productView(LE_POINT_DEMO, "ines");

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
    const view = developerView(data, "camille");
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
    expect(developerView(data, "camille").blocked[0]!.reason).toBe(
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
    const view = developerView(data, "camille");
    expect(keys(view.resume)).toEqual(["C", "B", "A"]);
    expect(view.resume.map((card) => card.reason)).toEqual([
      "En cours ; échéance demain, le 4 nov.",
      "En cours ; échéance le 10 nov., dans 7 jours.",
      "En cours ; pas d’échéance.",
    ]);
  });

  it("ignores a mention on a ticket already done", () => {
    const data: LePointDataset = {
      ...base,
      tickets: [
        { key: "A", title: "A", objective: null, status: "Terminé", category: "done", assignee: "ines", due: null, done: "2026-10-30", lastActivity: null },
      ],
      mentions: [{ ticket: "A", author: "hugo", mentioned: "ines", day: "2026-10-29", text: "@Inès" }],
    };
    expect(productView(data, "ines").decisions).toEqual([]);
  });

  it("has no next delivery when every release is published", () => {
    const data: LePointDataset = {
      ...base,
      releases: [{ name: "1.0", planned: "2026-10-01", released: "2026-10-01" }],
    };
    expect(productView(data, "ines").nextRelease).toBeNull();
  });
});

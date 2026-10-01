import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BurndownReportView,
  type SerializableBurndownReport,
} from "@/components/reports/burndown-report";

type Detailed = Extract<SerializableBurndownReport, { kind: "active" }>;
type Point = Detailed["baseline"];
type JournalEvent = Detailed["events"]["rows"][number];

function dateFor(term: string) {
  const time = screen.getByText(term, { selector: "dt" }).nextElementSibling?.querySelector("time");
  if (!time) throw new Error(`No date for ${term}`);
  expect(time).not.toHaveAttribute("aria-label");
  return time;
}

const SPRINT_ID = "11111111-1111-4111-8111-111111111111";

const baseline: Point = {
  occurredAt: "2026-08-03T09:00:00.000Z",
  sequence: null,
  remainingPoints: 13,
  unestimatedCount: 1,
  deltaPoints: 0,
  itemId: null,
  itemKey: null,
  itemTitle: null,
  cause: "start",
};

const point = (overrides: Partial<Point> & Pick<Point, "sequence" | "cause">): Point => ({
  ...baseline,
  ...overrides,
});

const eventPointRows: Point[] = [
  point({
    occurredAt: "2026-08-04T10:00:00.000Z",
    sequence: "11",
    remainingPoints: 16,
    deltaPoints: 3,
    itemId: "item-4",
    itemKey: "CASS-4",
    itemTitle: "Filtre par chambre",
    cause: "item_added",
  }),
  point({
    occurredAt: "2026-08-05T10:00:00.000Z",
    sequence: "12",
    remainingPoints: 14,
    deltaPoints: -2,
    itemId: "item-2",
    itemKey: "CASS-2",
    itemTitle: "Index des arrêts",
    cause: "estimate_changed",
  }),
  point({
    occurredAt: "2026-08-06T10:00:00.000Z",
    sequence: "13",
    remainingPoints: 9,
    deltaPoints: -5,
    itemId: "item-1",
    itemKey: "CASS-1",
    itemTitle: "Recherche plein texte",
    cause: "item_completed",
  }),
  point({
    occurredAt: "2026-08-07T10:00:00.000Z",
    sequence: "14",
    remainingPoints: 14,
    deltaPoints: 5,
    itemId: "item-1",
    itemKey: "CASS-1",
    itemTitle: "Recherche plein texte",
    cause: "item_reopened",
  }),
  point({
    occurredAt: "2026-08-08T10:00:00.000Z",
    sequence: "15",
    remainingPoints: 13,
    deltaPoints: -1,
    itemId: null,
    itemKey: "CASS-6",
    itemTitle: "Ancien export",
    cause: "item_removed",
  }),
];

const journalRows: JournalEvent[] = eventPointRows.map((row) => ({
  id: `event-${row.sequence}`,
  sequence: row.sequence!,
  eventType: row.cause as JournalEvent["eventType"],
  occurredAt: row.occurredAt,
  actor: { id: "actor-1", name: "Ada" },
  itemId: row.itemId,
  itemKey: row.itemKey,
  itemTitle: row.itemTitle,
  previousEstimate: null,
  nextEstimate: null,
  previousDone: null,
  nextDone: null,
  relatedSprint: null,
  removalReason: row.cause === "item_removed" ? "deleted" : null,
}));

const active: Detailed = {
  kind: "active",
  statusLabel: "Données en cours",
  sprint: {
    id: SPRINT_ID,
    name: "Sprint R4",
    goal: "Stabiliser la recherche",
    plannedStartAt: "2026-08-03T09:00:00.000Z",
    plannedEndAt: "2026-08-17T09:00:00.000Z",
    startedAt: "2026-08-03T09:00:00.000Z",
    completedAt: null,
  },
  summary: {
    initialRemainingPoints: 13,
    remainingPoints: 13,
    completedPoints: 0,
    unestimatedCount: 1,
  },
  trajectory: { label: "Au-dessus de la trajectoire idéale", insufficientReason: null },
  planningComparison: {
    state: "ready",
    commitmentPoints: 13,
    averageCompletedPoints: 10,
    population: 3,
    difference: 3,
  },
  guideline: {
    state: "available",
    points: [
      { occurredAt: "2026-08-03T09:00:00.000Z", remainingPoints: 13 },
      { occurredAt: "2026-08-09T09:00:00.000Z", remainingPoints: 7.43 },
      { occurredAt: "2026-08-17T09:00:00.000Z", remainingPoints: 0 },
    ],
  },
  displayPoints: [
    baseline,
    ...eventPointRows,
    point({ occurredAt: "2026-08-09T09:00:00.000Z", sequence: null, cause: "start" }),
    // Daily projection samples after the observation instant.
    point({ occurredAt: "2026-08-10T00:00:00.000Z", sequence: null, cause: "start" }),
    point({ occurredAt: "2026-08-17T09:00:00.000Z", sequence: null, cause: "start" }),
  ],
  baseline,
  observedAt: "2026-08-09T09:00:00.000Z",
  eventPoints: { page: 1, pageSize: 5, total: 7, rows: eventPointRows },
  events: { page: 1, pageSize: 5, total: 7, rows: journalRows },
};

describe("BurndownReportView", () => {
  it("renders identity, summaries, trajectory, comparison, chart and exact values", () => {
    render(<BurndownReportView backlogKey="CASS" report={active} />);

    expect(screen.getByRole("heading", { name: "Sprint R4" })).toBeVisible();
    expect(screen.getByText("Stabiliser la recherche")).toBeVisible();
    expect(screen.getByText("Données en cours")).toBeVisible();
    expect(dateFor("Démarré")).toHaveTextContent("3 août 2026, 09:00");
    expect(dateFor("Démarré")).toHaveAttribute("datetime", "2026-08-03T09:00:00.000Z");
    expect(dateFor("Date cible")).toHaveTextContent("17 août 2026, 09:00");
    expect(dateFor("Date cible")).toHaveAttribute("datetime", "2026-08-17T09:00:00.000Z");

    const metrics = screen.getByRole("region", { name: "Mesures du burndown" });
    expect(within(metrics).getByText("Restant initial")).toBeVisible();
    expect(within(metrics).getByText("Restant actuel")).toBeVisible();
    expect(within(metrics).getByText("Terminés")).toBeVisible();
    expect(within(metrics).getByText("Non estimés")).toBeVisible();
    expect(within(metrics).queryByText("Restant à la clôture")).toBeNull();
    // Identity comes before metric cards in document order.
    expect(
      screen.getByRole("heading", { name: "Sprint R4" })
        .compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.getByText("Au-dessus de la trajectoire idéale")).toBeVisible();
    expect(screen.getByText(
      "Engagement 13 pts · moyenne récente 10 pts · écart +3 pts",
    )).toBeVisible();

    expect(screen.getByRole("figure", {
      name: "Travail restant et trajectoire idéale",
    })).toBeVisible();
    expect(screen.getByTestId("burndown-chart-scroll")).toHaveClass("overflow-x-auto", "max-w-full");
    const svg = screen.getByTestId("burndown-chart-scroll").querySelector("svg")!;
    expect(svg).not.toHaveAttribute("role");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).not.toHaveAttribute("aria-labelledby");
    const chartRegion = screen.getByRole("region", { name: "Travail restant et trajectoire idéale" });
    expect(chartRegion).toBe(screen.getByTestId("burndown-chart-scroll"));
    expect(chartRegion).toHaveAttribute("tabindex", "0");
    expect(screen.getByText(
      "Courbe simplifiée : toutes les valeurs exactes figurent dans le tableau.",
    )).toBeVisible();
    expect(screen.getByRole("list", {
      name: "Points et lignes du burndown",
    })).toBeVisible();
    expect(screen.getAllByRole("listitem", {
      name: /points restants/,
    })).not.toHaveLength(0);
    expect(screen.getByRole("listitem", { name: /^Travail restant réel/ })).toBeVisible();
    expect(screen.getByRole("listitem", { name: /^Trajectoire idéale/ })).toBeVisible();
    expect(screen.getByRole("listitem", {
      name: "Ajout de CASS-4, 4 août 2026 à 10:00 UTC : 16 points restants",
    })).toBeVisible();

    const table = screen.getByRole("table", { name: "Valeurs exactes du burndown" });
    expect(table).toHaveTextContent("CASS-4");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Date", "Élément", "Événement", "Variation", "Restant", "Non estimés",
    ]);
    for (const header of within(table).getAllByRole("columnheader")) {
      expect(header).toHaveAttribute("scope", "col");
    }
    expect(within(table).getAllByRole("row")).toHaveLength(1 + eventPointRows.length);
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("+3 pts");
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("16 pts");
    const scroller = screen.getByRole("region", { name: "Valeurs exactes du burndown" });
    expect(scroller).toHaveAttribute("tabindex", "0");
    expect(scroller).toContainElement(table);
    expect(screen.getByText("Restant au démarrage", { exact: false })).toHaveTextContent(
      "13 pts",
    );

    const pagination = screen.getByRole("navigation", { name: "Pagination des valeurs exactes" });
    const next = within(pagination).getByRole("link", { name: "Suivant" }).getAttribute("href")!;
    const params = new URL(next, "http://localhost").searchParams;
    expect(params.get("report")).toBe("burndown");
    expect(params.get("sprint")).toBe(SPRINT_ID);
    expect(params.get("eventPage")).toBe("2");

    const journal = screen.getByRole("region", { name: "Journal du sprint" });
    const journalNext = within(screen.getByRole("navigation", { name: "Pagination du journal" }))
      .getByRole("link", { name: "Suivant" }).getAttribute("href")!;
    expect(journal).toHaveTextContent("Ada a ajouté CASS-4");
    expect(new URL(journalNext, "http://localhost").searchParams.get("report")).toBe("burndown");
    expect(new URL(journalNext, "http://localhost").searchParams.has("itemPage")).toBe(false);
  });

  it("links an exact row only when the item remains accessible", () => {
    render(<BurndownReportView backlogKey="CASS" report={active} />);

    const table = screen.getByRole("table", { name: "Valeurs exactes du burndown" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByRole("link", { name: /CASS-4/ })).toHaveAttribute(
      "href",
      "/b/CASS?item=CASS-4",
    );
    expect(rows[5]).toHaveTextContent("CASS-6");
    expect(within(rows[5]!).queryByRole("link")).toBeNull();
  });

  it("describes every legend entry with text and line style, not only color", () => {
    render(<BurndownReportView backlogKey="CASS" report={active} />);

    const legend = screen.getByRole("list", { name: "Légende du burndown" });
    const labels = within(legend).getAllByRole("listitem").map((item) => item.textContent);
    expect(labels).toEqual([
      "Ligne continue : travail restant réel",
      "Ligne pointillée grise : trajectoire idéale",
      "Point plein : événement du sprint",
      "Cercle évidé : changement de périmètre",
    ]);
  });

  it("renders completed outcomes with final remaining work", () => {
    const completed = {
      ...active,
      kind: "completed" as const,
      statusLabel: "Historique figé" as const,
      sprint: { ...active.sprint, completedAt: "2026-08-16T17:00:00.000Z" },
    };
    render(
      <BurndownReportView
        backlogKey="CASS"
        report={{
          ...completed,
          summary: { ...completed.summary, remainingPoints: 0, completedPoints: 13 },
          trajectory: { label: "Objectif atteint", insufficientReason: null },
        }}
      />,
    );
    expect(screen.getByText("Objectif atteint")).toBeVisible();
    expect(screen.getByText("Historique figé")).toBeVisible();
    expect(screen.getByText("Restant à la clôture")).toBeVisible();
    expect(screen.queryByText("Restant actuel")).toBeNull();
    expect(dateFor("Clôturé")).toHaveTextContent("16 août 2026, 17:00");
    expect(dateFor("Clôturé")).toHaveAttribute("datetime", "2026-08-16T17:00:00.000Z");
    cleanup();

    render(
      <BurndownReportView
        backlogKey="CASS"
        report={{
          ...completed,
          trajectory: { label: "Travail restant à la clôture", insufficientReason: null },
        }}
      />,
    );
    expect(screen.getByText("Travail restant à la clôture")).toBeVisible();
  });

  it.each([
    ["missing_target", "Date cible absente."],
    ["invalid_dates", "Dates du sprint incohérentes."],
    ["no_estimated_initial_work", "Le travail restant au démarrage n’est pas estimé."],
    ["just_started", "Le sprint vient de démarrer."],
  ] as const)("explains insufficient data for %s", (reason, copy) => {
    render(
      <BurndownReportView
        backlogKey="CASS"
        report={{
          ...active,
          trajectory: { label: "Données insuffisantes", insufficientReason: reason },
          guideline: { state: "unavailable", reason },
        }}
      />,
    );

    expect(screen.getByText("Données insuffisantes")).toBeVisible();
    expect(screen.getAllByText(copy, { exact: false })[0]).toBeVisible();
    expect(screen.queryByRole("listitem", { name: /^Trajectoire idéale/ })).toBeNull();
    expect(screen.getByRole("listitem", { name: /^Travail restant réel/ })).toBeVisible();
  });

  it("draws the actual line only up to the observation instant", () => {
    render(<BurndownReportView backlogKey="CASS" report={active} />);

    const actual = screen.getByRole("listitem", { name: /^Travail restant réel/ });
    expect(actual.getAttribute("aria-label")).toMatch(
      /à 13 points restants le 9 août 2026 à 09:00 UTC$/,
    );
    const d = actual.querySelector("path")!.getAttribute("d")!;
    // Baseline + five events + observation sample: six horizontal steps.
    const steps = [...d.matchAll(/H ([\d.]+)/g)].map((match) => Number(match[1]));
    expect(steps).toHaveLength(6);
    const plotRight = 960 - 24;
    expect(Math.max(...steps)).toBeLessThan(plotRight / 2);
    for (const marker of screen.getAllByRole("listitem", { name: /points? restants?$/ })) {
      expect(marker.getAttribute("aria-label")).not.toMatch(/1[0-7] août 2026/);
    }
  });

  it("omits the simplification note when every exact point is drawn", () => {
    render(
      <BurndownReportView
        backlogKey="CASS"
        report={{
          ...active,
          eventPoints: { ...active.eventPoints, total: eventPointRows.length },
          events: { ...active.events, total: eventPointRows.length },
        }}
      />,
    );
    expect(screen.queryByText(/Courbe simplifiée/)).toBeNull();
  });

  it("does not leave a dangling separator when the item title is missing", () => {
    const [firstRow, ...rest] = eventPointRows;
    render(
      <BurndownReportView
        backlogKey="CASS"
        report={{
          ...active,
          eventPoints: {
            ...active.eventPoints,
            rows: [{ ...firstRow!, itemTitle: null }, ...rest],
          },
        }}
      />,
    );
    const table = screen.getByRole("table", { name: "Valeurs exactes du burndown" });
    const link = within(within(table).getAllByRole("row")[1]!).getByRole("link");
    expect(link).toHaveTextContent(/^CASS-4$/);
  });

  it("distinguishes an empty sprint from fully unestimated initial work", () => {
    render(
      <BurndownReportView
        backlogKey="CASS"
        report={{
          ...active,
          baseline: { ...baseline, remainingPoints: 0, unestimatedCount: 0 },
          trajectory: {
            label: "Données insuffisantes",
            insufficientReason: "no_estimated_initial_work",
          },
          guideline: { state: "unavailable", reason: "no_estimated_initial_work" },
        }}
      />,
    );
    // Done-at-start or zero-point work also yields this reason: never claim the sprint was empty.
    const notices = screen.getAllByText("Aucun point restant au démarrage.", { exact: false });
    expect(notices).toHaveLength(2);
    for (const notice of notices) expect(notice).toBeVisible();
    expect(screen.queryByText(/vide/i)).toBeNull();
    expect(screen.queryByText(/n’est pas estimé/)).toBeNull();
  });

  it("states when no comparable velocity exists", () => {
    render(
      <BurndownReportView
        backlogKey="CASS"
        report={{
          ...active,
          planningComparison: {
            state: "unavailable",
            commitmentPoints: 13,
            averageCompletedPoints: null,
            population: 0,
            difference: null,
          },
        }}
      />,
    );
    expect(screen.getByText("Pas encore de vélocité comparable")).toBeVisible();
    expect(screen.queryByText(/moyenne récente/)).toBeNull();
  });

  it("keeps legacy identity visible without fabricating totals", () => {
    const { container } = render(
      <BurndownReportView
        backlogKey="CASS"
        report={{
          kind: "legacy_unavailable",
          statusLabel: "Historique burndown indisponible",
          reason: "legacy_history",
          sprint: {
            ...active.sprint,
            completedAt: "2026-08-16T17:00:00.000Z",
          },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Sprint R4" })).toBeVisible();
    expect(screen.getByText("Stabiliser la recherche")).toBeVisible();
    expect(screen.getByText("Historique burndown indisponible")).toBeVisible();
    expect(dateFor("Démarré")).toHaveTextContent("3 août 2026, 09:00");
    expect(dateFor("Démarré")).toHaveAttribute("datetime", "2026-08-03T09:00:00.000Z");
    expect(dateFor("Clôturé")).toHaveTextContent("16 août 2026, 17:00");
    expect(dateFor("Clôturé")).toHaveAttribute("datetime", "2026-08-16T17:00:00.000Z");
    expect(container.textContent).not.toMatch(/0 pt.*historique indisponible/i);
    expect(container.textContent).not.toMatch(/\bpts?\b/);
    expect(screen.queryByRole("figure")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

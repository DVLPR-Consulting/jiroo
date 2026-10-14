import { render, screen, within } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { SprintReportView, type SerializableSprintReport } from "@/components/reports/sprint-report";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/app/actions/items", () => ({ updateItemAction: vi.fn() }));

const base = {
  statusLabel: "Données en cours" as const,
  sprint: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Sprint 7",
    goal: "Livrer le paiement",
    plannedStartAt: "2026-08-01T09:00:00.000Z",
    plannedEndAt: "2026-08-15T09:00:00.000Z",
    startedAt: "2026-08-01T09:00:00.000Z",
    completedAt: null,
  },
  metrics: {
    initialItemCount: 2,
    committedPoints: 5,
    initialUnestimatedCount: 1,
    currentItemCount: 2,
    currentScopePoints: 8,
    currentUnestimatedCount: 0,
    completedItemCount: 1,
    completedPoints: 8,
    grossPointsAdded: 3,
    grossPointsRemoved: 0,
    netEstimateDelta: 3,
    scopeEventCount: 2,
  },
  sections: { completed: 1, incomplete: 1, removed: 0, carried: 0 },
  items: {
    page: 1,
    pageSize: 1,
    total: 2,
    rows: [
      {
        itemId: "item-1",
        itemKey: "CASS-42",
        itemTitle: "Paiement invité",
        itemType: "tache" as const,
        itemKind: "feature" as const,
        firstJoinedAt: "2026-08-01T09:00:00.000Z",
        finalLeftAt: null,
        initialCommitment: true,
        addedAfterStart: false,
        removedAfterStart: false,
        estimateAtStart: 5,
        estimateAtFinalParticipation: 8,
        estimateAtCompletion: 8,
        statusCategory: "done" as const,
        outcome: "completed" as const,
        destinationSprint: null,
        section: "completed" as const,
      },
    ],
  },
  events: { page: 1, pageSize: 50, total: 0, rows: [] },
};

describe("SprintReportView", () => {
  it("keeps status labels discriminated by report kind", () => {
    expectTypeOf<Extract<SerializableSprintReport, { kind: "active" }>["statusLabel"]>()
      .toEqualTypeOf<"Données en cours">();
    expectTypeOf<Extract<SerializableSprintReport, { kind: "completed" }>["statusLabel"]>()
      .toEqualTypeOf<"Historique figé">();
  });

  it("renders explainable metrics, every non-empty heading, item evolution, and independent paging", () => {
    render(
      <SprintReportView
        backlogKey="CASS"
        report={{ kind: "active", ...base } satisfies SerializableSprintReport}
      />,
    );

    expect(screen.getByText("Données en cours")).toBeVisible();
    expect(screen.getByText("Engagement").parentElement).toHaveTextContent("2 éléments · 5 pts · 1 non estimé");
    expect(screen.getByText("Périmètre actuel").parentElement).toHaveTextContent("2 éléments · 8 pts");
    expect(screen.getByText("Évolution du périmètre").parentElement).toHaveTextContent("Ajoutés 3 pts");
    // Each section is the Backlog's card (JIR-97): heading, total, collapse.
    expect(screen.getByRole("heading", { level: 3, name: "Terminés" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Non terminés" })).toBeVisible();
    const completed = screen.getByRole("region", { name: "Terminés (1)" });
    expect(completed).toHaveAttribute("data-item-section");
    expect(within(completed).getByText("1 item")).toBeVisible();
    expect(within(completed).getByRole("button", { name: "Replier Terminés" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(within(completed).getByRole("link", { name: /CASS-42/ })).toHaveAttribute(
      "href",
      "/b/CASS?item=CASS-42",
    );
    expect(completed).toHaveTextContent("5 → 8 pts");
    // The Backlog row (JIR-93): status by category, points in the bubble.
    const row = within(completed).getByRole("listitem");
    expect(within(row).getByText("Terminé")).toBeVisible();
    expect(within(row).getByTitle("Points")).toHaveTextContent("8 pts");
    expect(row).not.toHaveTextContent("feature");
    expect(screen.getByRole("navigation", { name: "Pagination des éléments" })
      .querySelector('a[href*="eventPage=1"]')).not.toBeNull();
  });

  it("agrees metric and item labels with counts below two", () => {
    render(
      <SprintReportView
        backlogKey="CASS"
        report={{
          kind: "active",
          ...base,
          metrics: {
            ...base.metrics,
            initialItemCount: 1,
            committedPoints: 1,
            initialUnestimatedCount: 0,
            currentItemCount: 0,
            currentScopePoints: 0,
            currentUnestimatedCount: 2,
            completedItemCount: 1,
            completedPoints: 1.5,
            grossPointsAdded: 1,
            grossPointsRemoved: 0,
            netEstimateDelta: 1,
            scopeEventCount: 1,
          },
          items: {
            ...base.items,
            rows: [{ ...base.items.rows[0]!, estimateAtStart: 3, estimateAtFinalParticipation: 1 }],
          },
        } satisfies SerializableSprintReport}
      />,
    );

    expect(screen.getByText("Engagement").parentElement).toHaveTextContent("1 élément · 1 pt · 0 non estimé");
    expect(screen.getByText("Terminés", { selector: "dt" }).parentElement).toHaveTextContent("1 élément · 1,5 pt");
    expect(screen.getByText("Périmètre actuel").parentElement).toHaveTextContent("0 élément · 0 pt · 2 non estimés");
    expect(screen.getByText("Évolution du périmètre").parentElement)
      .toHaveTextContent("Ajoutés 1 pt · Retirés 0 pt · Delta 1 pt · 1 événement");
    expect(screen.getByRole("region", { name: "Terminés (1)" })).toHaveTextContent("3 → 1 pt");
  });

  it("renders frozen and legacy states without linking deleted identity or fabricating totals", () => {
    const completed: SerializableSprintReport = {
      kind: "completed",
      ...base,
      statusLabel: "Historique figé",
      snapshotAt: "2026-08-15T12:00:00.000Z",
      sprint: { ...base.sprint, completedAt: "2026-08-15T12:00:00.000Z" },
      items: {
        ...base.items,
        total: 1,
        rows: [{ ...base.items.rows[0]!, itemId: null }],
      },
      finalDestinationSummary: { backlog: 0, sprints: [] },
    };
    const { rerender } = render(<SprintReportView backlogKey="CASS" report={completed} />);
    expect(screen.getByText("Historique figé")).toBeVisible();
    expect(screen.getByText("Périmètre final")).toBeVisible();
    expect(screen.queryByText("Périmètre actuel")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Instantané du rapport")).toHaveAttribute(
      "datetime",
      "2026-08-15T12:00:00.000Z",
    );
    expect(screen.queryByRole("link", { name: /CASS-42/ })).not.toBeInTheDocument();

    rerender(
      <SprintReportView
        backlogKey="CASS"
        report={{
          kind: "legacy_unavailable",
          statusLabel: "Historique détaillé indisponible",
          sprint: {
            id: base.sprint.id,
            name: "Sprint ancien",
            goal: "Objectif historique",
            state: "completed",
            startedAt: base.sprint.startedAt,
            completedAt: "2026-08-10T09:00:00.000Z",
            hasSnapshot: false,
          },
        }}
      />,
    );
    expect(screen.getByText("Historique détaillé indisponible")).toBeVisible();
    expect(screen.getByText("Objectif historique")).toBeVisible();
    expect(screen.getByLabelText("Démarrage du sprint")).toHaveAttribute(
      "datetime",
      base.sprint.startedAt,
    );
    expect(screen.getByLabelText("Clôture du sprint")).toHaveAttribute(
      "datetime",
      "2026-08-10T09:00:00.000Z",
    );
    expect(screen.queryByText("Engagement")).not.toBeInTheDocument();
  });

  it("distinguishes an empty active sprint from work that is entirely unestimated", () => {
    const { rerender } = render(
      <SprintReportView
        backlogKey="CASS"
        report={{
          kind: "active",
          ...base,
          metrics: {
            ...base.metrics,
            initialItemCount: 0,
            committedPoints: 0,
            initialUnestimatedCount: 0,
            currentItemCount: 0,
            currentScopePoints: 0,
            currentUnestimatedCount: 0,
          },
          sections: { completed: 0, incomplete: 0, removed: 0, carried: 0 },
          items: { ...base.items, total: 0, rows: [] },
        }}
      />,
    );

    expect(screen.getByText("Ce sprint actif ne contient encore aucun élément.")).toBeVisible();

    rerender(
      <SprintReportView
        backlogKey="CASS"
        report={{
          kind: "active",
          ...base,
          metrics: {
            ...base.metrics,
            initialItemCount: 2,
            committedPoints: 0,
            initialUnestimatedCount: 2,
            currentItemCount: 2,
            currentScopePoints: 0,
            currentUnestimatedCount: 2,
          },
        }}
      />,
    );

    expect(screen.getByText("Tous les éléments actuels de ce sprint sont non estimés.")).toBeVisible();
    expect(screen.queryByText("Ce sprint actif ne contient encore aucun élément.")).not.toBeInTheDocument();
  });
});

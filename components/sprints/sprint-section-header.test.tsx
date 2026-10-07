import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SprintSectionHeader } from "@/components/sprints/sprint-section-header";

const sprint = {
  id: "sprint-1",
  name: "Sprint paiement",
  goal: "Livrer le paiement invité",
  state: "planned" as const,
  rank: "a0",
  capacityPoints: 10,
  plannedStartAt: new Date("2026-08-10T09:00:00.000Z"),
  plannedEndAt: new Date("2026-08-24T09:00:00.000Z"),
  startedAt: null,
  completedAt: null,
};
const metrics = {
  itemCount: 4,
  estimatedPoints: 13,
  completedPoints: 0,
  remainingPoints: 13,
  unestimatedCount: 1,
  capacityPoints: 10,
  overCapacityPoints: 3,
  velocityComparison: null,
  commitmentBasis: null,
};
const aboveVelocity = {
  state: "ready" as const,
  commitmentPoints: 13,
  averageCompletedPoints: 10,
  population: 3,
  difference: 3,
};

describe("SprintSectionHeader", () => {
  it("keeps Jira-like planning aggregates visible while collapsed", async () => {
    const user = userEvent.setup();
    const onExpandedChange = vi.fn();
    render(
      <SprintSectionHeader
        kind="planned"
        sprint={sprint}
        metrics={metrics}
        expanded={false}
        onExpandedChange={onExpandedChange}
        canManage
      />,
    );

    expect(screen.getByRole("heading", { name: "Sprint paiement" })).toBeVisible();
    expect(screen.getByText("Planifié")).toBeVisible();
    expect(screen.getByText("Livrer le paiement invité")).toBeVisible();
    expect(screen.getByText("13 / 10 pts")).toBeVisible();
    expect(screen.getByText("1 non estimé")).toBeVisible();
    expect(screen.getByText("Dépassement de 3 pts")).toBeVisible();
    expect(screen.getByText(/10 août 2026/)).toBeVisible();

    const toggle = screen.getByRole("button", { name: "Déplier Sprint paiement" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it("agrees task and unestimated counts with French singular below two", () => {
    const { rerender } = render(
      <SprintSectionHeader
        kind="planned"
        sprint={sprint}
        metrics={{ ...metrics, itemCount: 0, unestimatedCount: 0 }}
        expanded={false}
        onExpandedChange={vi.fn()}
        canManage
      />,
    );
    expect(screen.getByText("0 tâche")).toBeVisible();
    expect(screen.getByText("0 non estimé")).toBeVisible();

    rerender(
      <SprintSectionHeader
        kind="planned"
        sprint={sprint}
        metrics={{ ...metrics, itemCount: 2, unestimatedCount: 2 }}
        expanded={false}
        onExpandedChange={vi.fn()}
        canManage
      />,
    );
    expect(screen.getByText("2 tâches")).toBeVisible();
    expect(screen.getByText("2 non estimés")).toBeVisible();
  });

  it("agrees the points unit with the capacity and over-capacity values", () => {
    const { rerender } = render(
      <SprintSectionHeader
        kind="planned"
        sprint={sprint}
        metrics={{ ...metrics, estimatedPoints: 2.5, capacityPoints: 1.5, overCapacityPoints: 1 }}
        expanded={false}
        onExpandedChange={vi.fn()}
        canManage
      />,
    );
    expect(screen.getByText("2,5 / 1,5 pt")).toBeVisible();
    expect(screen.getByText("Dépassement de 1 pt")).toBeVisible();

    rerender(
      <SprintSectionHeader
        kind="planned"
        sprint={sprint}
        metrics={{ ...metrics, estimatedPoints: 4, capacityPoints: 2, overCapacityPoints: 2 }}
        expanded={false}
        onExpandedChange={vi.fn()}
        canManage
      />,
    );
    expect(screen.getByText("4 / 2 pts")).toBeVisible();
    expect(screen.getByText("Dépassement de 2 pts")).toBeVisible();

    rerender(
      <SprintSectionHeader
        kind="backlog"
        sprint={null}
        metrics={{ ...metrics, estimatedPoints: 1, capacityPoints: null, overCapacityPoints: 0 }}
        expanded={false}
        onExpandedChange={vi.fn()}
        canManage
      />,
    );
    expect(screen.getByText("1 pt")).toBeVisible();
  });

  it("renders supplied actions while keeping sprint management controls permissioned", () => {
    const { rerender } = render(
      <SprintSectionHeader
        kind="planned"
        sprint={sprint}
        metrics={metrics}
        expanded
        onExpandedChange={vi.fn()}
        canManage
        canMoveUp
        canMoveDown
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        actions={<button type="button">Démarrer</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Monter Sprint paiement" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Descendre Sprint paiement" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Démarrer" })).toBeVisible();

    rerender(
      <SprintSectionHeader
        kind="planned"
        sprint={sprint}
        metrics={metrics}
        expanded
        onExpandedChange={vi.fn()}
        canManage={false}
        canMoveUp
        canMoveDown
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        actions={undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: "Monter Sprint paiement" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descendre Sprint paiement" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Démarrer" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replier Sprint paiement" })).toBeVisible();
  });

  it("renders the unscheduled Backlog without sprint-only controls", () => {
    render(
      <SprintSectionHeader
        kind="backlog"
        sprint={null}
        metrics={{ ...metrics, capacityPoints: null, overCapacityPoints: 0 }}
        expanded
        onExpandedChange={vi.fn()}
        canManage
      />,
    );
    expect(screen.getByRole("heading", { name: "Backlog" })).toBeVisible();
    expect(screen.getByText("13 pts")).toBeVisible();
    expect(screen.queryByText("Planifié")).not.toBeInTheDocument();
  });

  it("lets a sprint manager reorder sprints without an item-edit capability", () => {
    render(
      <SprintSectionHeader
        kind="planned"
        sprint={sprint}
        metrics={metrics}
        expanded
        onExpandedChange={vi.fn()}
        canManage={false}
        capabilities={{ rank: false, reparent: false, assignSprint: false, manageSprints: true }}
        canMoveUp
        canMoveDown
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Monter Sprint paiement" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Descendre Sprint paiement" })).toBeVisible();
  });

  it("compares a planned commitment with recent velocity without blocking planning", () => {
    render(
      <SprintSectionHeader
        kind="planned"
        sprint={sprint}
        metrics={{ ...metrics, velocityComparison: aboveVelocity }}
        expanded
        onExpandedChange={vi.fn()}
        canManage
        canMoveUp
        canMoveDown
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        actions={<button type="button">Démarrer</button>}
      />,
    );

    expect(
      screen.getByText("Engagement 13 pts · moyenne des sprints précédents 10 pts · écart +3 pts"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Engagement supérieur à la moyenne des sprints précédents : avertissement non bloquant.",
      ),
    ).toBeVisible();
    expect(screen.getByText("13 / 10 pts")).toBeVisible();
    expect(screen.getByText("Dépassement de 3 pts")).toBeVisible();
    expect(screen.getByRole("button", { name: "Démarrer" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Monter Sprint paiement" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Descendre Sprint paiement" })).toBeEnabled();
  });

  it("compares the active sprint's start commitment and shows the current scope separately", () => {
    render(
      <SprintSectionHeader
        kind="active"
        sprint={{ ...sprint, state: "active" }}
        metrics={{
          ...metrics,
          estimatedPoints: 25,
          capacityPoints: 30,
          overCapacityPoints: 0,
          commitmentBasis: "sprint_start",
          velocityComparison: {
            ...aboveVelocity,
            commitmentPoints: 10,
            averageCompletedPoints: 6.25,
            difference: 3.75,
          },
        }}
        expanded
        onExpandedChange={vi.fn()}
        canManage
      />,
    );

    expect(
      screen.getByText("Engagement 10 pts · moyenne des sprints précédents 6,25 pts · écart +3,75 pts"),
    ).toBeVisible();
    expect(screen.getByText("Périmètre actuel 25 pts")).toBeVisible();
    expect(screen.queryByText(/avertissement non bloquant/)).not.toBeInTheDocument();
  });

  it("states an active commitment at or below recent velocity without a warning", () => {
    render(
      <SprintSectionHeader
        kind="active"
        sprint={{ ...sprint, state: "active" }}
        metrics={{
          ...metrics,
          commitmentBasis: "sprint_start",
          velocityComparison: { ...aboveVelocity, commitmentPoints: 8, difference: -2 },
        }}
        expanded
        onExpandedChange={vi.fn()}
        canManage
      />,
    );

    const comparison = screen.getByText(
      "Engagement 8 pts · moyenne des sprints précédents 10 pts · écart -2 pts",
    );
    expect(comparison).toBeVisible();
    expect(comparison.className).not.toMatch(/amber/);
    expect(screen.getByText("Périmètre actuel 13 pts")).toBeVisible();
    expect(screen.queryByText(/avertissement non bloquant/)).not.toBeInTheDocument();
  });

  it("shows only the current scope when an active sprint has no start commitment", () => {
    render(
      <SprintSectionHeader
        kind="active"
        sprint={{ ...sprint, state: "active" }}
        metrics={{
          ...metrics,
          estimatedPoints: 25,
          commitmentBasis: "sprint_start_unavailable",
          velocityComparison: null,
        }}
        expanded
        onExpandedChange={vi.fn()}
        canManage
      />,
    );

    expect(screen.getByText("Engagement au démarrage indisponible")).toBeVisible();
    expect(screen.getByText("Périmètre actuel 25 pts")).toBeVisible();
    expect(screen.queryByText(/moyenne des sprints précédents/)).not.toBeInTheDocument();
    expect(screen.queryByText(/écart/)).not.toBeInTheDocument();
  });

  it("does not label a planned sprint's scope as the current scope", () => {
    render(
      <SprintSectionHeader
        kind="planned"
        sprint={sprint}
        metrics={{
          ...metrics,
          commitmentBasis: "current_scope",
          velocityComparison: aboveVelocity,
        }}
        expanded
        onExpandedChange={vi.fn()}
        canManage
      />,
    );

    expect(screen.queryByText(/Périmètre actuel/)).not.toBeInTheDocument();
  });

  it("says when no recent velocity is comparable", () => {
    render(
      <SprintSectionHeader
        kind="planned"
        sprint={sprint}
        metrics={{
          ...metrics,
          velocityComparison: {
            state: "unavailable",
            commitmentPoints: 13,
            averageCompletedPoints: null,
            population: 0,
            difference: null,
          },
        }}
        expanded
        onExpandedChange={vi.fn()}
        canManage
      />,
    );

    expect(screen.getByText("Pas encore de vélocité comparable")).toBeVisible();
    expect(screen.queryByText(/moyenne des sprints précédents/)).not.toBeInTheDocument();
  });

  it("never renders velocity copy on the unscheduled Backlog", () => {
    render(
      <SprintSectionHeader
        kind="backlog"
        sprint={null}
        metrics={{
          ...metrics,
          capacityPoints: null,
          overCapacityPoints: 0,
          velocityComparison: aboveVelocity,
        }}
        expanded
        onExpandedChange={vi.fn()}
        canManage
      />,
    );

    expect(screen.queryByText(/moyenne des sprints précédents/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vélocité/)).not.toBeInTheDocument();
  });
});

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
    expect(screen.getByText("13 / 10 pt")).toBeVisible();
    expect(screen.getByText("1 non estimé")).toBeVisible();
    expect(screen.getByText("Dépassement de 3 pt")).toBeVisible();
    expect(screen.getByText(/10 août 2026/)).toBeVisible();

    const toggle = screen.getByRole("button", { name: "Déplier Sprint paiement" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
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
    expect(screen.getByText("13 pt")).toBeVisible();
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
      screen.getByText("Engagement 13 pts · moyenne récente 10 pts · écart +3 pts"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Engagement supérieur à la moyenne récente : avertissement non bloquant.",
      ),
    ).toBeVisible();
    expect(screen.getByText("13 / 10 pt")).toBeVisible();
    expect(screen.getByText("Dépassement de 3 pt")).toBeVisible();
    expect(screen.getByRole("button", { name: "Démarrer" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Monter Sprint paiement" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Descendre Sprint paiement" })).toBeEnabled();
  });

  it("states a commitment at or below recent velocity without a warning", () => {
    render(
      <SprintSectionHeader
        kind="active"
        sprint={{ ...sprint, state: "active" }}
        metrics={{
          ...metrics,
          velocityComparison: { ...aboveVelocity, commitmentPoints: 8, difference: -2 },
        }}
        expanded
        onExpandedChange={vi.fn()}
        canManage
      />,
    );

    const comparison = screen.getByText(
      "Engagement 8 pts · moyenne récente 10 pts · écart -2 pts",
    );
    expect(comparison).toBeVisible();
    expect(comparison.className).not.toMatch(/amber/);
    expect(screen.queryByText(/avertissement non bloquant/)).not.toBeInTheDocument();
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
    expect(screen.queryByText(/moyenne récente/)).not.toBeInTheDocument();
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

    expect(screen.queryByText(/moyenne récente/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vélocité/)).not.toBeInTheDocument();
  });
});

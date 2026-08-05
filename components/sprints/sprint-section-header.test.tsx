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
        canWrite
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

  it("renders writer controls and omits every mutation control for a reader", () => {
    const { rerender } = render(
      <SprintSectionHeader
        kind="planned"
        sprint={sprint}
        metrics={metrics}
        expanded
        onExpandedChange={vi.fn()}
        canWrite
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
        canWrite={false}
        canMoveUp
        canMoveDown
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        actions={<button type="button">Démarrer</button>}
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
        canWrite
      />,
    );
    expect(screen.getByRole("heading", { name: "Backlog" })).toBeVisible();
    expect(screen.getByText("13 pt")).toBeVisible();
    expect(screen.queryByText("Planifié")).not.toBeInTheDocument();
  });
});

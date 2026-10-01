import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CompleteSprintDialog,
  StartSprintDialog,
} from "@/components/sprints/sprint-lifecycle-dialogs";

const mocks = vi.hoisted(() => ({
  completeSprintAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  startSprintAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/sprints", () => ({
  completeSprintAction: mocks.completeSprintAction,
  startSprintAction: mocks.startSprintAction,
}));

const sprint = {
  id: "22222222-2222-4222-8222-222222222222",
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
  itemCount: 3,
  estimatedPoints: 13,
  completedPoints: 0,
  remainingPoints: 13,
  unestimatedCount: 1,
  capacityPoints: 10,
  overCapacityPoints: 3,
  velocityComparison: null,
};

const base = {
  backlogId: "11111111-1111-4111-8111-111111111111",
  backlogKey: "DEMO",
  sprint,
  metrics,
};

describe("sprint lifecycle dialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summarizes commitment and over-capacity, then opens the board only on success", async () => {
    const user = userEvent.setup();
    mocks.startSprintAction.mockResolvedValueOnce({
      ok: true,
      sprintId: sprint.id,
      committedItemCount: 3,
      committedPoints: 13,
      unestimatedCount: 1,
    });
    render(<StartSprintDialog {...base} />);

    await user.click(screen.getByRole("button", { name: "Démarrer Sprint paiement" }));
    expect(screen.getByText("3 tâches")).toBeVisible();
    expect(screen.getByText("13 / 10 pt")).toBeVisible();
    expect(screen.getByText("1 non estimée")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Dépassement de 3 pt");
    await user.click(screen.getByRole("button", { name: "Confirmer le démarrage" }));

    await waitFor(() => expect(mocks.startSprintAction).toHaveBeenCalledOnce());
    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?view=board");
  });

  it("retains start input and stays open after a server error", async () => {
    const user = userEvent.setup();
    mocks.startSprintAction.mockResolvedValueOnce({
      ok: false,
      error: "Un sprint est déjà actif pour ce backlog.",
    });
    render(<StartSprintDialog {...base} />);
    await user.click(screen.getByRole("button", { name: "Démarrer Sprint paiement" }));
    const goal = screen.getByRole("textbox", { name: "Objectif" });
    await user.clear(goal);
    await user.type(goal, "Objectif conservé");
    await user.click(screen.getByRole("button", { name: "Confirmer le démarrage" }));

    expect(await screen.findByText("Un sprint est déjà actif pour ce backlog."))
      .toBeVisible();
    expect(goal).toHaveValue("Objectif conservé");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("reports a rejected start request without closing or navigating", async () => {
    const user = userEvent.setup();
    mocks.startSprintAction.mockRejectedValueOnce(new Error("network"));
    render(<StartSprintDialog {...base} />);

    await user.click(screen.getByRole("button", { name: "Démarrer Sprint paiement" }));
    await user.click(screen.getByRole("button", { name: "Confirmer le démarrage" }));

    expect(await screen.findByText("Démarrage impossible.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("recalculates the over-capacity warning while capacity is edited", async () => {
    const user = userEvent.setup();
    render(<StartSprintDialog {...base} />);
    await user.click(screen.getByRole("button", { name: "Démarrer Sprint paiement" }));
    const capacity = screen.getByRole("spinbutton", { name: "Capacité (points)" });
    await user.clear(capacity);
    await user.type(capacity, "20");

    expect(screen.getByText("13 / 20 pt")).toBeVisible();
    expect(screen.queryByText(/Dépassement de/)).not.toBeInTheDocument();
  });

  it("shows global completion destinations and preserves blocker keys and selection", async () => {
    const user = userEvent.setup();
    mocks.completeSprintAction.mockResolvedValueOnce({
      ok: false,
      error: "Terminez les sous-tâches avant de clôturer le sprint.",
      itemKeys: ["DEMO-42", "DEMO-43"],
    });
    render(
      <CompleteSprintDialog
        {...base}
        sprint={{ ...sprint, state: "active" }}
        plannedSprints={[
          { id: "44444444-4444-4444-8444-444444444444", name: "Sprint suivant" },
        ]}
        completedMetrics={{ ...metrics, itemCount: 1, estimatedPoints: 5 }}
        incompleteMetrics={{ ...metrics, itemCount: 2, estimatedPoints: 8 }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Clôturer Sprint paiement" }));
    const destination = screen.getByRole("combobox", { name: "Destination des tâches incomplètes" });
    expect(destination).toHaveTextContent("Backlog");
    expect(destination).toHaveTextContent("Sprint suivant");
    expect(destination).toHaveTextContent("Nouveau sprint");
    await user.selectOptions(destination, "new");
    await user.type(screen.getByRole("textbox", { name: "Nom du nouveau sprint" }), "Sprint report");
    await user.click(screen.getByRole("button", { name: "Confirmer la clôture" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Terminez les sous-tâches avant de clôturer le sprint.",
    );
    expect(screen.getByText("DEMO-42")).toBeVisible();
    expect(screen.getByText("DEMO-43")).toBeVisible();
    expect(destination).toHaveValue("new");
    expect(screen.getByRole("textbox", { name: "Nom du nouveau sprint" }))
      .toHaveValue("Sprint report");
  });

  it("refreshes and closes after a successful completion to an existing sprint", async () => {
    const user = userEvent.setup();
    const futureId = "44444444-4444-4444-8444-444444444444";
    mocks.completeSprintAction.mockResolvedValueOnce({
      ok: true,
      sprintId: sprint.id,
      completedItemCount: 1,
      carriedItemCount: 2,
      destinationSprintId: futureId,
    });
    render(
      <CompleteSprintDialog
        {...base}
        sprint={{ ...sprint, state: "active" }}
        plannedSprints={[{ id: futureId, name: "Sprint suivant" }]}
        completedMetrics={{ ...metrics, itemCount: 1, estimatedPoints: 5 }}
        incompleteMetrics={{ ...metrics, itemCount: 2, estimatedPoints: 8 }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Clôturer Sprint paiement" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Destination des tâches incomplètes" }),
      `existing:${futureId}`,
    );
    await user.click(screen.getByRole("button", { name: "Confirmer la clôture" }));

    await waitFor(() =>
      expect(mocks.completeSprintAction).toHaveBeenCalledWith({
        backlogKey: "DEMO",
        backlogId: base.backlogId,
        id: sprint.id,
        destination: { type: "existing_sprint", sprintId: futureId },
      }),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports a rejected completion request and retains the destination", async () => {
    const user = userEvent.setup();
    mocks.completeSprintAction.mockRejectedValueOnce(new Error("network"));
    const futureId = "44444444-4444-4444-8444-444444444444";
    render(
      <CompleteSprintDialog
        {...base}
        sprint={{ ...sprint, state: "active" }}
        plannedSprints={[{ id: futureId, name: "Sprint suivant" }]}
        completedMetrics={{ ...metrics, itemCount: 1, estimatedPoints: 5 }}
        incompleteMetrics={{ ...metrics, itemCount: 2, estimatedPoints: 8 }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Clôturer Sprint paiement" }));
    const destination = screen.getByRole("combobox", {
      name: "Destination des tâches incomplètes",
    });
    await user.selectOptions(destination, `existing:${futureId}`);
    await user.click(screen.getByRole("button", { name: "Confirmer la clôture" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Clôture impossible.");
    expect(destination).toHaveValue(`existing:${futureId}`);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

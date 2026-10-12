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
  commitmentBasis: null,
};

const base = {
  backlogId: "11111111-1111-4111-8111-111111111111",
  backlogKey: "DEMO",
  sprint,
  metrics,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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

    await user.click(screen.getByRole("button", { name: "Démarrer le sprint Sprint paiement" }));
    expect(screen.getByText("3 tâches")).toBeVisible();
    expect(screen.getByText("13 / 10 pts")).toBeVisible();
    expect(screen.getByText("1 non estimée")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Dépassement de 3 pts");
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
    await user.click(screen.getByRole("button", { name: "Démarrer le sprint Sprint paiement" }));
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

  it("cannot be closed while a start request is pending, so its response stays in that opening", async () => {
    const user = userEvent.setup();
    const request = deferred<{ ok: false; error: string }>();
    mocks.startSprintAction.mockReturnValueOnce(request.promise);
    render(<StartSprintDialog {...base} />);
    await user.click(screen.getByRole("button", { name: "Démarrer le sprint Sprint paiement" }));
    await user.click(screen.getByRole("button", { name: "Confirmer le démarrage" }));
    expect(screen.getByRole("button", { name: "Démarrage…" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog")).toBeVisible();

    request.resolve({ ok: false, error: "Un sprint est déjà actif pour ce backlog." });
    expect(await screen.findByText("Un sprint est déjà actif pour ce backlog.")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmer le démarrage" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Démarrer le sprint Sprint paiement" }));
    expect(screen.queryByText("Un sprint est déjà actif pour ce backlog.")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("reports a rejected start request without closing or navigating", async () => {
    const user = userEvent.setup();
    mocks.startSprintAction.mockRejectedValueOnce(new Error("network"));
    render(<StartSprintDialog {...base} />);

    await user.click(screen.getByRole("button", { name: "Démarrer le sprint Sprint paiement" }));
    await user.click(screen.getByRole("button", { name: "Confirmer le démarrage" }));

    expect(await screen.findByText("Démarrage impossible.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("recalculates the over-capacity warning while capacity is edited", async () => {
    const user = userEvent.setup();
    render(<StartSprintDialog {...base} />);
    await user.click(screen.getByRole("button", { name: "Démarrer le sprint Sprint paiement" }));
    const capacity = screen.getByRole("spinbutton", { name: "Capacité (points)" });
    await user.clear(capacity);
    await user.type(capacity, "20");

    expect(screen.getByText("13 / 20 pts")).toBeVisible();
    expect(screen.queryByText(/Dépassement de/)).not.toBeInTheDocument();
  });

  it("agrees the start summary and over-capacity warning with singular points below two", async () => {
    const user = userEvent.setup();
    render(
      <StartSprintDialog
        {...base}
        sprint={{ ...sprint, capacityPoints: 1 }}
        metrics={{ ...metrics, estimatedPoints: 2, capacityPoints: 1, overCapacityPoints: 1 }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Démarrer le sprint Sprint paiement" }));

    expect(screen.getByText("2 / 1 pt")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Dépassement de 1 pt. Vous pouvez tout de même démarrer.",
    );

    const capacity = screen.getByRole("spinbutton", { name: "Capacité (points)" });
    await user.clear(capacity);
    expect(screen.getByText("2 pts")).toBeVisible();
    await user.type(capacity, "0");
    expect(screen.getByText("2 / 0 pt")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Dépassement de 2 pts.");
  });

  it("agrees each completion summary with its own points total", async () => {
    render(
      <CompleteSprintDialog
        {...base}
        sprint={{ ...sprint, state: "active" }}
        plannedSprints={[]}
        completedMetrics={{ ...metrics, itemCount: 1, estimatedPoints: 1 }}
        incompleteMetrics={{ ...metrics, itemCount: 2, estimatedPoints: 8 }}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Terminer le sprint Sprint paiement" }));

    expect(screen.getByText("1 tâche · 1 pt")).toBeVisible();
    expect(screen.getByText("2 tâches · 8 pts")).toBeVisible();
  });

  it("formats decimal points with the French comma in the start and completion dialogs", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <StartSprintDialog
        {...base}
        sprint={{ ...sprint, capacityPoints: 1.5 }}
        metrics={{ ...metrics, estimatedPoints: 2.5, capacityPoints: 1.5, overCapacityPoints: 1 }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Démarrer le sprint Sprint paiement" }));
    expect(screen.getByText("2,5 / 1,5 pt")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Dépassement de 1 pt. Vous pouvez tout de même démarrer.",
    );
    const capacity = screen.getByRole("spinbutton", { name: "Capacité (points)" });
    expect(capacity).toHaveValue(1.5);
    await user.clear(capacity);
    await user.type(capacity, "1.25");
    expect(screen.getByText("2,5 / 1,25 pt")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Dépassement de 1,25 pt.");
    await user.clear(capacity);
    expect(screen.getByText("2,5 pts")).toBeVisible();
    unmount();

    render(
      <CompleteSprintDialog
        {...base}
        sprint={{ ...sprint, state: "active" }}
        plannedSprints={[]}
        completedMetrics={{ ...metrics, itemCount: 1, estimatedPoints: 1.5 }}
        incompleteMetrics={{ ...metrics, itemCount: 2, estimatedPoints: 2.5 }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Terminer le sprint Sprint paiement" }));
    expect(screen.getByText("1 tâche · 1,5 pt")).toBeVisible();
    expect(screen.getByText("2 tâches · 2,5 pts")).toBeVisible();
  });

  it("opens with the sprint's current values after its props change and submits them", async () => {
    const user = userEvent.setup();
    mocks.startSprintAction.mockResolvedValueOnce({
      ok: true,
      sprintId: sprint.id,
      committedItemCount: 3,
      committedPoints: 13,
      unestimatedCount: 1,
    });
    const { rerender } = render(<StartSprintDialog {...base} />);
    const renamed = {
      ...sprint,
      name: "Recette 1",
      goal: "Sprint de test 1 semaine",
      capacityPoints: 15,
      plannedStartAt: new Date(2026, 8, 1, 9, 30),
      plannedEndAt: new Date(2026, 8, 8, 17, 0),
    };
    rerender(<StartSprintDialog {...base} sprint={renamed} />);

    await user.click(screen.getByRole("button", { name: "Démarrer le sprint Recette 1" }));
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveValue("Recette 1");
    expect(screen.getByRole("textbox", { name: "Objectif" }))
      .toHaveValue("Sprint de test 1 semaine");
    expect(screen.getByLabelText("Début")).toHaveValue("2026-09-01T09:30");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-09-08T17:00");
    expect(screen.getByRole("spinbutton", { name: "Capacité (points)" })).toHaveValue(15);
    await user.click(screen.getByRole("button", { name: "Confirmer le démarrage" }));

    await waitFor(() =>
      expect(mocks.startSprintAction).toHaveBeenCalledWith({
        backlogKey: "DEMO",
        backlogId: base.backlogId,
        id: sprint.id,
        name: "Recette 1",
        goal: "Sprint de test 1 semaine",
        startAt: renamed.plannedStartAt.toISOString(),
        endAt: renamed.plannedEndAt.toISOString(),
        capacityPoints: 15,
      }),
    );
  });

  it("keeps start edits made while open when the sprint props refresh", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StartSprintDialog {...base} />);
    await user.click(screen.getByRole("button", { name: "Démarrer le sprint Sprint paiement" }));
    const goal = screen.getByRole("textbox", { name: "Objectif" });
    await user.clear(goal);
    await user.type(goal, "Objectif en cours");
    rerender(<StartSprintDialog {...base} sprint={{ ...sprint, capacityPoints: 12 }} />);

    expect(goal).toHaveValue("Objectif en cours");
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

    await user.click(screen.getByRole("button", { name: "Terminer le sprint Sprint paiement" }));
    const destination = screen.getByRole("combobox", { name: "Destination des tâches incomplètes" });
    expect(destination).toHaveTextContent("Backlog");
    expect(destination).toHaveTextContent("Sprint suivant");
    expect(destination).toHaveTextContent("Nouveau sprint");
    await user.selectOptions(destination, "new");
    await user.type(screen.getByRole("textbox", { name: "Nom du nouveau sprint" }), "Sprint report");
    await user.click(screen.getByRole("button", { name: "Terminer le sprint" }));

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
    await user.click(screen.getByRole("button", { name: "Terminer le sprint Sprint paiement" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Destination des tâches incomplètes" }),
      `existing:${futureId}`,
    );
    await user.click(screen.getByRole("button", { name: "Terminer le sprint" }));

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

  it("cannot be closed while a completion request is pending", async () => {
    const user = userEvent.setup();
    const request = deferred<{ ok: false; error: string }>();
    mocks.completeSprintAction.mockReturnValueOnce(request.promise);
    render(
      <CompleteSprintDialog
        {...base}
        sprint={{ ...sprint, state: "active" }}
        plannedSprints={[]}
        completedMetrics={metrics}
        incompleteMetrics={metrics}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Terminer le sprint Sprint paiement" }));
    await user.click(screen.getByRole("button", { name: "Terminer le sprint" }));

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();

    request.resolve({ ok: false, error: "Le sprint a changé." });
    expect(await screen.findByText("Le sprint a changé.")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Terminer le sprint" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Terminer le sprint Sprint paiement" }));
    expect(screen.queryByText("Le sprint a changé.")).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Terminer le sprint Sprint paiement" }));
    const destination = screen.getByRole("combobox", {
      name: "Destination des tâches incomplètes",
    });
    await user.selectOptions(destination, `existing:${futureId}`);
    await user.click(screen.getByRole("button", { name: "Terminer le sprint" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de terminer le sprint.");
    expect(destination).toHaveValue(`existing:${futureId}`);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateSprintButton,
  EditSprintDialog,
} from "@/components/sprints/sprint-form-dialog";

const mocks = vi.hoisted(() => ({
  createSprintAction: vi.fn(),
  refresh: vi.fn(),
  updateSprintAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/sprints", () => ({
  createSprintAction: mocks.createSprintAction,
  updateSprintAction: mocks.updateSprintAction,
}));

const sprint = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Sprint paiement",
  goal: "Livrer le paiement invité",
  state: "planned" as const,
  plannedStartAt: "2026-08-10T09:00:00.000Z",
  plannedEndAt: "2026-08-24T09:00:00.000Z",
  capacityPoints: 20,
};

describe("sprint form dialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers a discoverable sprint creation and refreshes only after success", async () => {
    const user = userEvent.setup();
    mocks.createSprintAction.mockResolvedValueOnce({
      ok: true,
      sprint: { id: sprint.id, name: "Sprint 1" },
    });
    render(
      <CreateSprintButton
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Créer un sprint" }));

    expect(mocks.createSprintAction).toHaveBeenCalledWith({
      backlogId: "11111111-1111-4111-8111-111111111111",
      backlogKey: "DEMO",
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("retains edited values and exposes field errors after a server failure", async () => {
    const user = userEvent.setup();
    mocks.updateSprintAction.mockResolvedValueOnce({
      ok: false,
      error: "Le nom du sprint est requis.",
      fieldErrors: { name: ["Le nom du sprint est requis."] },
    });
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={sprint}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    const name = screen.getByRole("textbox", { name: "Nom" });
    await user.clear(name);
    await user.type(name, "Nom conservé");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le nom du sprint est requis.",
    );
    expect(name).toHaveValue("Nom conservé");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("submits planning values as ISO dates and closes after success", async () => {
    const user = userEvent.setup();
    mocks.updateSprintAction.mockResolvedValueOnce({ ok: true, sprint });
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={sprint}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    await user.clear(screen.getByRole("spinbutton", { name: "Capacité (points)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Capacité (points)" }), "21.5");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mocks.updateSprintAction).toHaveBeenCalledOnce());
    expect(mocks.updateSprintAction).toHaveBeenCalledWith(
      expect.objectContaining({
        backlogKey: "DEMO",
        id: sprint.id,
        capacityPoints: 21.5,
        plannedStartAt: expect.stringMatching(/^2026-08-10T/),
        plannedEndAt: expect.stringMatching(/^2026-08-24T/),
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("limits a completed sprint edit to its name and goal", async () => {
    const user = userEvent.setup();
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={{ ...sprint, state: "completed" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));

    expect(screen.getByRole("textbox", { name: "Nom" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Objectif" })).toBeVisible();
    expect(screen.queryByRole("spinbutton", { name: "Capacité (points)" }))
      .not.toBeInTheDocument();
    expect(screen.queryByLabelText("Début prévu")).not.toBeInTheDocument();
    expect(screen.getByText(/sprint terminé/i)).toBeVisible();
  });
});

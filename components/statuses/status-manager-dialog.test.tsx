import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createStatusAction: vi.fn(),
  deleteStatusAction: vi.fn(),
  refresh: vi.fn(),
  reorderStatusesAction: vi.fn(),
  updateStatusAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/statuses", () => ({
  createStatusAction: mocks.createStatusAction,
  deleteStatusAction: mocks.deleteStatusAction,
  reorderStatusesAction: mocks.reorderStatusesAction,
  updateStatusAction: mocks.updateStatusAction,
}));

import { StatusManagerDialog } from "@/components/statuses/status-manager-dialog";

const statuses = [
  { id: "todo", name: "À faire", category: "todo" as const, color: "#9aa0a6", order: 0, itemCount: 1 },
  { id: "doing", name: "En cours", category: "in_progress" as const, color: "#d99a2b", order: 1, itemCount: 2 },
  { id: "review", name: "En revue", category: "in_progress" as const, color: "#8b5cf6", order: 2, itemCount: 3 },
  { id: "done", name: "Terminé", category: "done" as const, color: "#3aa675", order: 3, itemCount: 0 },
];

function renderManager(rows = statuses) {
  return render(
    <StatusManagerDialog
      backlogId="backlog-1"
      backlogKey="DEMO"
      statuses={rows}
      capabilities={{ manage: true }}
    />,
  );
}

describe("StatusManagerDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render workflow mutations without the focused capability", () => {
    render(
      <StatusManagerDialog
        backlogId="backlog-1"
        backlogKey="DEMO"
        statuses={statuses}
        capabilities={{ manage: false }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Colonnes" })).not.toBeInTheDocument();
  });

  it("fails closed when a future consumer omits workflow capabilities", () => {
    render(
      <StatusManagerDialog
        backlogId="backlog-1"
        backlogKey="DEMO"
        statuses={statuses}
      />,
    );

    expect(screen.queryByRole("button", { name: "Colonnes" })).not.toBeInTheDocument();
  });

  it("makes column management discoverable and creates a persisted column", async () => {
    const user = userEvent.setup();
    mocks.createStatusAction.mockResolvedValue({
      ok: true,
      status: {
        id: "ready",
        name: "Prêt pour livraison",
        category: "in_progress",
        color: "#2b6cb0",
        order: 4,
      },
    });
    renderManager();

    await user.click(screen.getByRole("button", { name: "Colonnes" }));
    const dialog = screen.getByRole("dialog", { name: "Gérer les colonnes" });
    expect(within(dialog).getByText("À faire")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Ajouter une colonne" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Nom" }), "Prêt pour livraison");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Catégorie" }), "in_progress");
    await user.click(within(dialog).getByRole("button", { name: "Couleur #2b6cb0" }));
    await user.click(within(dialog).getByRole("button", { name: "Ajouter la colonne" }));

    await waitFor(() =>
      expect(mocks.createStatusAction).toHaveBeenCalledWith({
        backlogId: "backlog-1",
        backlogKey: "DEMO",
        name: "Prêt pour livraison",
        category: "in_progress",
        color: "#2b6cb0",
      }),
    );
    expect(await within(dialog).findByText("Prêt pour livraison")).toBeVisible();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("reorders the complete status set with labelled keyboard controls", async () => {
    const user = userEvent.setup();
    mocks.reorderStatusesAction.mockResolvedValue({ ok: true });
    renderManager();
    await user.click(screen.getByRole("button", { name: "Colonnes" }));

    await user.click(screen.getByRole("button", { name: "Monter En revue" }));

    await waitFor(() =>
      expect(mocks.reorderStatusesAction).toHaveBeenCalledWith({
        backlogId: "backlog-1",
        backlogKey: "DEMO",
        statusIds: ["todo", "review", "doing", "done"],
      }),
    );
  });

  it("requires a destination before deleting an occupied column", async () => {
    const user = userEvent.setup();
    mocks.deleteStatusAction.mockResolvedValue({ ok: true, deletedId: "review", migratedItems: 3 });
    renderManager();
    await user.click(screen.getByRole("button", { name: "Colonnes" }));
    await user.click(screen.getByRole("button", { name: "Supprimer En revue" }));

    expect(screen.getByText("3 items seront déplacés avant la suppression.")).toBeVisible();
    const destination = screen.getByRole("combobox", { name: "Statut de destination" });
    await user.selectOptions(destination, "doing");
    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    await waitFor(() =>
      expect(mocks.deleteStatusAction).toHaveBeenCalledWith({
        id: "review",
        backlogId: "backlog-1",
        backlogKey: "DEMO",
        replacementStatusId: "doing",
      }),
    );
    expect(screen.queryByText("En revue")).not.toBeInTheDocument();
  });

  it("keeps the form open with an explicit server error", async () => {
    const user = userEvent.setup();
    mocks.createStatusAction.mockResolvedValue({
      ok: false,
      error: "Un statut portant ce nom existe déjà.",
    });
    renderManager();
    await user.click(screen.getByRole("button", { name: "Colonnes" }));
    await user.click(screen.getByRole("button", { name: "Ajouter une colonne" }));
    await user.type(screen.getByRole("textbox", { name: "Nom" }), "En cours");
    await user.click(screen.getByRole("button", { name: "Ajouter la colonne" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Un statut portant ce nom existe déjà.",
    );
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveValue("En cours");
  });

  it("cannot be closed while a column request is pending", async () => {
    const user = userEvent.setup();
    let resolve!: (result: { ok: false; error: string }) => void;
    mocks.createStatusAction.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderManager();
    await user.click(screen.getByRole("button", { name: "Colonnes" }));
    await user.click(screen.getByRole("button", { name: "Ajouter une colonne" }));
    await user.type(screen.getByRole("textbox", { name: "Nom" }), "En cours");
    await user.click(screen.getByRole("button", { name: "Ajouter la colonne" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();

    resolve({ ok: false, error: "Un statut portant ce nom existe déjà." });
    expect(await screen.findByRole("alert")).toHaveTextContent("existe déjà");
    await waitFor(() => expect(screen.getByRole("button", { name: "Ajouter la colonne" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Colonnes" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reveals an exact replacement selector if an initially empty column becomes occupied", async () => {
    const user = userEvent.setup();
    const empty = {
      id: "empty",
      name: "Prêt",
      category: "in_progress" as const,
      color: "#2b6cb0",
      order: 4,
      itemCount: 0,
    };
    mocks.deleteStatusAction.mockResolvedValueOnce({
      ok: false,
      error: "Choisissez un statut de destination pour les items existants.",
      currentItemCount: 2,
    });
    renderManager([...statuses, empty]);
    await user.click(screen.getByRole("button", { name: "Colonnes" }));
    await user.click(screen.getByRole("button", { name: "Supprimer Prêt" }));

    expect(screen.getByText("Cette colonne est vide.")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Statut de destination" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    expect(await screen.findByText("2 items seront déplacés avant la suppression.")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Statut de destination" })).toBeVisible();
  });
});

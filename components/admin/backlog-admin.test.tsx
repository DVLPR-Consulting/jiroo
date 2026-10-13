import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveBacklogAction: vi.fn(),
  createBacklogAction: vi.fn(),
  updateBacklogAction: vi.fn(),
}));

vi.mock("@/app/actions/backlogs", () => ({
  archiveBacklogAction: mocks.archiveBacklogAction,
  createBacklogAction: mocks.createBacklogAction,
  updateBacklogAction: mocks.updateBacklogAction,
}));

import { BacklogAdmin } from "@/components/admin/backlog-admin";
import { expectNoBoundary, renderWithBoundary, transportError } from "@/test/action-rejection";

const backlog = {
  id: "backlog-1",
  key: "WEB",
  name: "Site web",
  color: "#7c3030",
  archivedAt: null,
};

describe("BacklogAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks for confirmation before changing a backlog key", async () => {
    const user = userEvent.setup();
    mocks.updateBacklogAction.mockResolvedValue({ ok: true });
    render(<BacklogAdmin backlogs={[backlog]} />);

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const dialog = await screen.findByRole("dialog");
    const keyInput = within(dialog).getByRole("textbox", { name: "Clé" });
    await user.clear(keyInput);
    await user.type(keyInput, "plat");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    expect(mocks.updateBacklogAction).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(
        "La clé et toutes les clés d’items seront renommées. Les anciens liens ne fonctionneront plus.",
      ),
    ).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Confirmer le renommage" }));
    await waitFor(() =>
      expect(mocks.updateBacklogAction).toHaveBeenCalledWith({
        id: "backlog-1",
        key: "PLAT",
        name: "Site web",
        color: "#7c3030",
      }),
    );
  });

  it("relie chaque backlog à ses réglages d’accès", () => {
    render(<BacklogAdmin backlogs={[backlog]} />);
    expect(screen.getByRole("link", { name: "Gérer les accès de Site web" })).toHaveAttribute("href", "/b/WEB/settings/access");
    expect(screen.getByRole("link", { name: "Connecter des dépôts à Site web" })).toHaveAttribute(
      "href",
      "/b/WEB/settings/development",
    );
  });

  it("keeps the edit dialog open and displays an action error", async () => {
    const user = userEvent.setup();
    mocks.updateBacklogAction.mockResolvedValue({
      ok: false,
      error: "Cette clé est déjà utilisée.",
    });
    render(<BacklogAdmin backlogs={[backlog]} />);

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    expect(await within(dialog).findByText("Cette clé est déjà utilisée.")).toBeVisible();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Cette clé est déjà utilisée.");
    expect(dialog).toBeVisible();
  });

  it("opens the edit dialog with the backlog's current values after its props change", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BacklogAdmin backlogs={[backlog]} />);
    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    rerender(<BacklogAdmin backlogs={[{ ...backlog, name: "Portail" }]} />);
    await user.click(screen.getByRole("button", { name: "Modifier" }));

    expect(within(screen.getByRole("dialog")).getByRole("textbox", { name: "Nom" })).toHaveValue("Portail");
  });

  it("cannot close backlog creation while the request is pending", async () => {
    const user = userEvent.setup();
    let resolve!: (result: { ok: false; error: string }) => void;
    mocks.createBacklogAction.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<BacklogAdmin backlogs={[backlog]} />);

    await user.click(screen.getByRole("button", { name: "Nouveau backlog" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "Clé" }), "OPS");
    await user.type(within(dialog).getByRole("textbox", { name: "Nom" }), "Opérations");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();

    resolve({ ok: false, error: "Cette clé est déjà utilisée." });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Cette clé est déjà utilisée.");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Enregistrer" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Nouveau backlog" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the create dialog open with a local error when the request fails in transport", async () => {
    const user = userEvent.setup();
    mocks.createBacklogAction.mockRejectedValueOnce(transportError()).mockResolvedValueOnce({ ok: true });
    renderWithBoundary(<BacklogAdmin backlogs={[]} />);
    await user.click(screen.getByRole("button", { name: "Nouveau backlog" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "Clé" }), "OPS");
    await user.type(within(dialog).getByRole("textbox", { name: "Nom" }), "Opérations");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Création impossible.");
    expectNoBoundary();
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.createBacklogAction).toHaveBeenCalledTimes(2);
  });

  it("keeps the edit dialog open with a local error when the request fails in transport", async () => {
    const user = userEvent.setup();
    mocks.updateBacklogAction.mockRejectedValue(transportError());
    renderWithBoundary(<BacklogAdmin backlogs={[backlog]} />);
    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Mise à jour impossible.");
    expectNoBoundary();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Enregistrer" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a local error when archiving fails in transport and allows a retry", async () => {
    const user = userEvent.setup();
    mocks.archiveBacklogAction.mockRejectedValueOnce(transportError()).mockResolvedValueOnce({ ok: true });
    renderWithBoundary(<BacklogAdmin backlogs={[backlog]} />);
    await user.click(screen.getByRole("button", { name: "Archiver" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Archivage impossible.");
    expectNoBoundary();
    await waitFor(() => expect(screen.getByRole("button", { name: "Archiver" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Archiver" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(mocks.archiveBacklogAction).toHaveBeenCalledTimes(2);
  });

  it("edits the backlog lead when candidates are offered (JIR-82)", async () => {
    const user = userEvent.setup();
    mocks.updateBacklogAction.mockResolvedValue({ ok: true });
    render(
      <BacklogAdmin
        backlogs={[{ ...backlog, leadUserId: "u1" }]}
        leadOptions={[
          { id: "u1", name: "Ada Lovelace" },
          { id: "u2", name: "Grace Hopper" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const dialog = await screen.findByRole("dialog");
    const lead = within(dialog).getByRole("combobox", { name: "Responsable" });
    expect(lead).toHaveValue("u1");
    await user.selectOptions(lead, "u2");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(mocks.updateBacklogAction).toHaveBeenLastCalledWith({
        id: "backlog-1",
        key: "WEB",
        name: "Site web",
        color: "#7c3030",
        leadUserId: "u2",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const reopened = await screen.findByRole("dialog");
    await user.selectOptions(within(reopened).getByRole("combobox", { name: "Responsable" }), "");
    await user.click(within(reopened).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(mocks.updateBacklogAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ leadUserId: null }),
      ),
    );
  });

  it("hides the lead field without candidates", async () => {
    const user = userEvent.setup();
    render(<BacklogAdmin backlogs={[backlog]} />);
    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("combobox", { name: "Responsable" })).not.toBeInTheDocument();
  });
});

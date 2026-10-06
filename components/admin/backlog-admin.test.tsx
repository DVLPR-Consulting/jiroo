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
});

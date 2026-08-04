import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewItemButton } from "@/components/items/new-item-dialog";

const mocks = vi.hoisted(() => ({
  createItemAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/app/actions/items", () => ({
  createItemAction: mocks.createItemAction,
}));

const statuses = [
  { id: "ready-id", name: "Prêt" },
  { id: "doing-id", name: "En cours" },
];

function dialogProps() {
  return {
    backlogId: "backlog-id",
    backlogKey: "DEMO",
    items: [],
    statuses,
  };
}

describe("NewItemButton", () => {
  beforeEach(() => {
    mocks.createItemAction.mockReset();
    mocks.refresh.mockReset();
  });

  it("opens from a custom trigger with the supplied initial status", async () => {
    const user = userEvent.setup();
    render(
      <NewItemButton
        {...dialogProps()}
        initialStatusId="doing-id"
        trigger={<button type="button" aria-label="Ajouter dans la colonne">+</button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter dans la colonne" }));

    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveValue("doing-id");
  });

  it("submits the supplied status and reports the created item", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const createdItem = { id: "item-id", key: "DEMO-7" };
    mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: createdItem });
    render(
      <NewItemButton
        {...dialogProps()}
        initialStatusId="doing-id"
        onCreated={onCreated}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    await user.type(screen.getByRole("textbox", { name: "Titre" }), "Carte créée");
    await user.click(screen.getByRole("button", { name: /Créer$/ }));

    await waitFor(() =>
      expect(mocks.createItemAction).toHaveBeenCalledWith({
        backlogKey: "DEMO",
        backlogId: "backlog-id",
        type: "composant",
        kind: "feature",
        parentId: null,
        title: "Carte créée",
        description: null,
        statusId: "doing-id",
        priority: 0,
      }),
    );
    expect(onCreated).toHaveBeenCalledOnce();
    expect(onCreated).toHaveBeenCalledWith(createdItem);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("restores the supplied initial status after close and reopen", async () => {
    const user = userEvent.setup();
    render(<NewItemButton {...dialogProps()} initialStatusId="doing-id" />);

    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Statut" }), "ready-id");
    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveValue("ready-id");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Nouvel item" }));

    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveValue("doing-id");
  });
});

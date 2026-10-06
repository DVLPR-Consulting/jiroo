import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const releaseOptions = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "2026.10",
    released: false,
    archived: false,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "2026.09",
    released: true,
    archived: false,
  },
];

function dialogProps() {
  return {
    backlogId: "backlog-id",
    backlogKey: "DEMO",
    items: [],
    statuses,
    releaseOptions,
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
    expect(screen.getByRole("button", { name: /^Créer$/ })).toBeVisible();
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
        fixVersionIds: [],
      }),
    );
    expect(onCreated).toHaveBeenCalledOnce();
    expect(onCreated).toHaveBeenCalledWith(createdItem);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("submits selected Fix versions in the create transaction", async () => {
    const user = userEvent.setup();
    mocks.createItemAction.mockResolvedValueOnce({
      ok: true,
      item: { id: "item-id", key: "DEMO-7" },
    });
    render(<NewItemButton {...dialogProps()} />);

    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    await user.click(screen.getByRole("button", { name: "Versions" }));
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: "2026.09 — Publiée" }),
    );
    await user.keyboard("{Escape}");
    await user.type(screen.getByRole("textbox", { name: "Titre" }), "Versionnée");
    await user.click(screen.getByRole("button", { name: /^Créer$/ }));

    await waitFor(() =>
      expect(mocks.createItemAction).toHaveBeenCalledWith(
        expect.objectContaining({ fixVersionIds: [releaseOptions[1]!.id] }),
      ),
    );
  });

  it("disables Fix version changes while creation is pending", async () => {
    const user = userEvent.setup();
    let resolve!: (result: { ok: false; error: string }) => void;
    mocks.createItemAction.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<NewItemButton {...dialogProps()} />);

    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    await user.type(screen.getByRole("textbox", { name: "Titre" }), "Versionnée");
    await user.click(screen.getByRole("button", { name: /^Créer$/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Versions" })).toBeDisabled());
    resolve({ ok: false, error: "Création impossible." });
    expect(await screen.findByText("Création impossible.")).toBeVisible();
  });

  it("cannot be closed while creation is pending, so its success cannot wipe a new draft", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    let resolve!: (result: { ok: true; item: { id: string; key: string } }) => void;
    mocks.createItemAction.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<NewItemButton {...dialogProps()} onCreated={onCreated} />);

    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    await user.type(screen.getByRole("textbox", { name: "Titre" }), "Première");
    await user.click(screen.getByRole("button", { name: /^Créer$/ }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Titre" })).toHaveValue("Première");
    resolve({ ok: true, item: { id: "item-id", key: "DEMO-7" } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it("creates a task in the supplied sprint context", async () => {
    const user = userEvent.setup();
    mocks.createItemAction.mockResolvedValueOnce({
      ok: true,
      item: { id: "item-id", key: "DEMO-8" },
    });
    render(
      <NewItemButton
        {...dialogProps()}
        items={[
          { id: "epic-id", key: "DEMO-2", type: "epic", title: "Paiement" },
        ]}
        sprintId="33333333-3333-4333-8333-333333333333"
        contextLabel="Sprint paiement"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    expect(screen.getByRole("heading", { name: "Nouvelle tâche — Sprint paiement" }))
      .toBeVisible();
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("tache");
    await user.selectOptions(screen.getByRole("combobox", { name: "Parent" }), "epic-id");
    await user.type(screen.getByRole("textbox", { name: "Titre" }), "Paiement invité");
    await user.click(screen.getByRole("button", { name: /Créer$/ }));

    await waitFor(() =>
      expect(mocks.createItemAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "tache",
          parentId: "epic-id",
          sprintId: "33333333-3333-4333-8333-333333333333",
        }),
      ),
    );
  });

  it("does not expose parent-bearing item types without scheduling permission", async () => {
    const user = userEvent.setup();
    render(
      <NewItemButton
        {...dialogProps()}
        items={[
          { id: "component-id", key: "DEMO-1", type: "composant", title: "Plateforme" },
          { id: "epic-id", key: "DEMO-2", type: "epic", title: "Paiement" },
        ]}
        canScheduleItems={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouvel item" }));

    expect(screen.getByRole("option", { name: "Composant" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Epic" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Tâche" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Parent" })).not.toBeInTheDocument();
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

  it("opens with C only when the shortcut is enabled", () => {
    render(<NewItemButton {...dialogProps()} enableShortcut />);

    fireEvent.keyDown(window, { key: "c" });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("consumes C before opening a dialog with an empty title", () => {
    render(<NewItemButton {...dialogProps()} enableShortcut />);

    const notCancelled = fireEvent.keyDown(window, { key: "c" });

    expect(notCancelled).toBe(false);
    expect(screen.getByRole("textbox", { name: "Titre" })).toHaveValue("");
  });

  it("announces the title limit and renders the server field error", async () => {
    const user = userEvent.setup();
    mocks.createItemAction.mockResolvedValueOnce({
      ok: false,
      error: "Titre trop long (200 max).",
      fieldErrors: { title: ["Titre trop long (200 max)."] },
    });
    render(<NewItemButton {...dialogProps()} />);
    await user.click(screen.getByRole("button", { name: "Nouvel item" }));

    const title = screen.getByRole("textbox", { name: "Titre" });
    expect(title).toHaveAttribute("maxlength", "200");
    expect(screen.getByText("0 / 200")).toBeVisible();

    await user.type(title, "Titre valide");
    await user.click(screen.getByRole("button", { name: /Créer$/ }));

    expect(await screen.findByText("Titre trop long (200 max)."))
      .toBeVisible();
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveFocus();
  });

  it("does not register the C shortcut by default", () => {
    render(<NewItemButton {...dialogProps()} />);

    fireEvent.keyDown(window, { key: "c" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores C while typing, with modifiers, when prevented, or while another dialog is open", () => {
    const { rerender } = render(
      <>
        <input aria-label="Champ" />
        <textarea aria-label="Zone de texte" />
        <select aria-label="Sélection"><option>Option</option></select>
        <div aria-label="Zone éditable" contentEditable />
        <NewItemButton {...dialogProps()} enableShortcut />
      </>,
    );

    for (const target of [
      screen.getByRole("textbox", { name: "Champ" }),
      screen.getByRole("textbox", { name: "Zone de texte" }),
      screen.getByRole("combobox", { name: "Sélection" }),
      screen.getByLabelText("Zone éditable"),
    ]) {
      fireEvent.keyDown(target, { key: "c" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }

    for (const modifier of ["ctrlKey", "metaKey", "altKey", "shiftKey"] as const) {
      fireEvent.keyDown(window, { key: "c", [modifier]: true });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }

    const preventedEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "c",
    });
    preventedEvent.preventDefault();
    window.dispatchEvent(preventedEvent);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <>
        <div role="dialog" aria-label="Autre dialogue" />
        <NewItemButton {...dialogProps()} enableShortcut />
      </>,
    );
    fireEvent.keyDown(window, { key: "c" });
    expect(screen.queryByRole("dialog", { name: "Nouvel item" })).not.toBeInTheDocument();
  });

  it("labels the enabled global trigger with its shortcut", () => {
    render(<NewItemButton {...dialogProps()} enableShortcut />);

    expect(screen.getByRole("button", { name: "Nouvel item" })).toHaveAttribute(
      "title",
      "Nouvel item (C)",
    );
  });
});

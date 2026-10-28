import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewItemButton } from "@/components/items/new-item-dialog";
import { enrichHierarchy, matchItem, type Filters } from "@/lib/items/filter";
import { sprintIdsByItem } from "@/lib/items/sprint-filter";
import { ITEM_TEMPLATES } from "@/lib/items/templates";
import { KeyboardShortcutsProvider } from "@/components/shortcuts/keyboard-shortcuts-provider";

const mocks = vi.hoisted(() => ({
  createItemAction: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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

/** Picks `option` in the dialog's Radix select named `name`. */
async function choose(user: UserEvent, name: string | RegExp, option: string) {
  await user.click(screen.getByRole("combobox", { name }));
  await user.click(screen.getByRole("option", { name: option }));
}

/** « c » goes through the app-wide shortcut layer, as in the real shell. */
function renderWithShortcuts(ui: React.ReactElement) {
  const result = render(<KeyboardShortcutsProvider>{ui}</KeyboardShortcutsProvider>);
  return {
    ...result,
    rerender: (next: React.ReactElement) =>
      result.rerender(<KeyboardShortcutsProvider>{next}</KeyboardShortcutsProvider>),
  };
}

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

  it("opens pre-filled with the title and parent typed in an inline creation", async () => {
    const user = userEvent.setup();
    const epic = { id: "epic-id", key: "DEMO-9", type: "epic" as const, title: "Connexion" };
    render(
      <NewItemButton
        {...dialogProps()}
        items={[epic]}
        contextLabel="Sprint 2"
        sprintId={null}
        initialTitle="Écran de vérification"
        initialParentId="epic-id"
        trigger={<button type="button">Plus d’options</button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Plus d’options" }));
    expect(screen.getByRole("heading", { name: "Nouvelle tâche — Sprint 2" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: /Titre/ })).toHaveValue("Écran de vérification");
    expect(screen.getByRole("combobox", { name: /Parent/ })).toHaveTextContent("DEMO-9 — Connexion");
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

    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveTextContent("En cours");
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
    await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Carte créée");
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
    await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Versionnée");
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
    await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Versionnée");
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
    await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Première");
    await user.click(screen.getByRole("button", { name: /^Créer$/ }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("textbox", { name: /Titre/ })).toHaveValue("Première");
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
    expect(screen.queryByRole("combobox", { name: "Type" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Type" })).toHaveTextContent("Tâche");
    await choose(user, /Parent/, "DEMO-2 — Paiement");
    await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Paiement invité");
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
    await user.click(screen.getByRole("combobox", { name: "Type" }));

    expect(screen.getByRole("option", { name: "Composant" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Epic" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Tâche" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Parent" })).not.toBeInTheDocument();
  });

  it("restores the supplied initial status after close and reopen", async () => {
    const user = userEvent.setup();
    render(<NewItemButton {...dialogProps()} initialStatusId="doing-id" />);

    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    await choose(user, "Statut", "Prêt");
    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveTextContent("Prêt");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Nouvel item" }));

    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveTextContent("En cours");
  });

  it("opens with C only when the shortcut is enabled", () => {
    renderWithShortcuts(<NewItemButton {...dialogProps()} enableShortcut />);

    fireEvent.keyDown(window, { key: "c" });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("consumes C before opening a dialog with an empty title", () => {
    renderWithShortcuts(<NewItemButton {...dialogProps()} enableShortcut />);

    const notCancelled = fireEvent.keyDown(window, { key: "c" });

    expect(notCancelled).toBe(false);
    expect(screen.getByRole("textbox", { name: /Titre/ })).toHaveValue("");
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

    const title = screen.getByRole("textbox", { name: /Titre/ });
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
    renderWithShortcuts(<NewItemButton {...dialogProps()} />);

    fireEvent.keyDown(window, { key: "c" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores C while typing, with modifiers, when prevented, or while another dialog is open", () => {
    const { rerender } = renderWithShortcuts(
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

  it("ignores C in an open menu or listbox and in a component with its own keys", () => {
    renderWithShortcuts(
      <>
        <div role="menu">
          <button type="button" role="menuitem">Action du menu</button>
        </div>
        <div role="listbox" aria-label="Liste">
          <div role="option" aria-selected="false" tabIndex={0}>Option de liste</div>
        </div>
        <div data-local-escape>
          <button type="button">Contrôle local</button>
        </div>
        <NewItemButton {...dialogProps()} enableShortcut />
      </>,
    );

    for (const target of [
      screen.getByRole("menuitem", { name: "Action du menu" }),
      screen.getByRole("option", { name: "Option de liste" }),
      screen.getByRole("button", { name: "Contrôle local" }),
    ]) {
      const notCancelled = fireEvent.keyDown(target, { key: "c" });
      expect(notCancelled).toBe(true);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
  });

  it("ignores C while composing text (IME) or when the key auto-repeats", () => {
    renderWithShortcuts(<NewItemButton {...dialogProps()} enableShortcut />);

    fireEvent.keyDown(window, { key: "c", isComposing: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "c", repeat: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores C when single-key shortcuts are turned off", () => {
    window.localStorage.setItem("jiroo-shortcuts-enabled", "false");
    try {
      renderWithShortcuts(<NewItemButton {...dialogProps()} enableShortcut />);
      fireEvent.keyDown(window, { key: "c" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      window.localStorage.removeItem("jiroo-shortcuts-enabled");
    }
  });

  it("labels the enabled global trigger with its shortcut", () => {
    renderWithShortcuts(<NewItemButton {...dialogProps()} enableShortcut />);

    expect(screen.getByRole("button", { name: "Nouvel item" })).toHaveAttribute(
      "title",
      "Nouvel item (C)",
    );
  });

  describe("Jira-style create screen (JIR-73)", () => {
    const fieldOptions = {
      users: [
        { id: "me", name: "Marie Lemaire" },
        { id: "paul", name: "Paul Martin" },
      ],
      canAssign: true,
      currentUserId: "me",
      sprints: [{ id: "44444444-4444-4444-8444-444444444444", name: "Sprint 4" }],
      labels: [{ id: "55555555-5555-4555-8555-555555555555", name: "front", color: "--label-1" }],
    };
    const items = [{ id: "epic-id", key: "DEMO-2", type: "epic" as const, title: "Paiement" }];

    beforeEach(() => {
      mocks.toastSuccess.mockReset();
      mocks.push.mockReset();
    });

    it("sends every field set in the Détails section", async () => {
      const user = userEvent.setup();
      mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: { id: "i", key: "DEMO-9" } });
      render(
        <NewItemButton
          {...dialogProps()}
          items={items}
          fieldOptions={fieldOptions}
          initialType="tache"
          initialParentId="epic-id"
        />,
      );

      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      const dialog = screen.getByRole("dialog", { name: "Nouvel item" });
      expect(dialog).toHaveTextContent("DEMO");
      expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Tâche");
      expect(screen.getByRole("combobox", { name: /Parent/ })).toHaveTextContent("DEMO-2 — Paiement");
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Tâche complète");
      expect(screen.getByRole("combobox", { name: "Assigné" })).toHaveTextContent("Non assigné");
      await user.click(screen.getByRole("button", { name: "M’assigner" }));
      expect(screen.getByRole("combobox", { name: "Assigné" })).toHaveTextContent("Marie Lemaire");
      expect(screen.queryByRole("button", { name: "M’assigner" })).not.toBeInTheDocument();
      await user.type(screen.getByRole("spinbutton", { name: "Points" }), "3.5");
      await choose(user, "Sprint", "Sprint 4");
      await user.click(screen.getByRole("button", { name: "Labels" }));
      await user.click(screen.getByRole("menuitemcheckbox", { name: "front" }));
      await user.keyboard("{Escape}");
      await user.type(screen.getByLabelText("Échéance"), "2026-11-02");
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));

      await waitFor(() =>
        expect(mocks.createItemAction).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "tache",
            parentId: "epic-id",
            title: "Tâche complète",
            assigneeId: "me",
            estimatePoints: 3.5,
            sprintId: "44444444-4444-4444-8444-444444444444",
            labelIds: ["55555555-5555-4555-8555-555555555555"],
            dueDate: "2026-11-02",
          }),
        ),
      );
    });

    it("shows Points and Sprint for tasks only, and no Assigné without the right", async () => {
      const user = userEvent.setup();
      render(<NewItemButton {...dialogProps()} fieldOptions={{ ...fieldOptions, canAssign: false }} />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      expect(screen.queryByRole("spinbutton", { name: "Points" })).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: "Sprint" })).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: "Assigné" })).not.toBeInTheDocument();
    });

    it("« Créer un autre » keeps the dialog, type and parent, and clears the text", async () => {
      const user = userEvent.setup();
      mocks.createItemAction.mockResolvedValue({ ok: true, item: { id: "i", key: "DEMO-9" } });
      render(<NewItemButton {...dialogProps()} items={items} initialType="tache" initialParentId="epic-id" />);

      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      await user.click(screen.getByRole("checkbox", { name: "Créer un autre" }));
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Première");
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));

      await waitFor(() => expect(screen.getByRole("textbox", { name: /Titre/ })).toHaveValue(""));
      expect(screen.getByRole("dialog", { name: "Nouvel item" })).toBeVisible();
      expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Tâche");
      expect(screen.getByRole("combobox", { name: /Parent/ })).toHaveTextContent("DEMO-2 — Paiement");
      expect(screen.getByRole("textbox", { name: /Titre/ })).toHaveFocus();
    });

    it("announces « <clé> créé » with « Ouvrir » and « Annuler »", async () => {
      const user = userEvent.setup();
      mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: { id: "i", key: "DEMO-9" } });
      window.history.replaceState({}, "", "/b/DEMO?view=list");
      render(<NewItemButton {...dialogProps()} />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Nouveau");
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));

      await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
      const [message, options] = mocks.toastSuccess.mock.calls[0]!;
      expect(message).toBe("DEMO-9 créé");
      expect(options.action.label).toBe("Annuler");
      expect(options.secondaryAction.label).toBe("Ouvrir");
      options.secondaryAction.run();
      expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?view=list&item=DEMO-9");
    });

    it("opens the created item in the backlog view from a page without a drawer (JIR-112)", async () => {
      const user = userEvent.setup();
      mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: { id: "i", key: "DEMO-9" } });
      window.history.replaceState({}, "", "/b/DEMO/releases");
      render(<NewItemButton {...dialogProps()} openCreatedAt="/b/DEMO" />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Nouveau");
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));

      await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
      mocks.toastSuccess.mock.calls[0]![1].secondaryAction.run();
      expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?item=DEMO-9");
    });

    it.each([
      ["#ffeeaa", "rgb(0, 0, 0)"],
      ["#7c3030", "rgb(255, 255, 255)"],
    ])("keeps the key tag readable on the backlog color %s (JIR-112)", async (color, text) => {
      const user = userEvent.setup();
      render(<NewItemButton {...dialogProps()} backlogColor={color} />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      const tag = within(screen.getByRole("dialog", { name: "Nouvel item" })).getByText("DEMO");
      expect(tag).toHaveStyle({ color: text });
    });

    describe("under the view's filters (JIR-92)", () => {
      const versionFilter = {
        q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [],
        releaseIds: [releaseOptions[0]!.id], sprintIds: [], kind: [], underIds: [],
      };
      function createdRow(title: string, type = "composant") {
        return {
          id: "i",
          key: "DEMO-9",
          type,
          kind: "feature",
          title,
          statusId: statuses[0]!.id,
          priority: 0,
          assigneeId: null,
          path: "root.i",
        };
      }

      it("says the filters hide an item created without the filtered Version", async () => {
        const user = userEvent.setup();
        mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: createdRow("Nouveau") });
        window.history.replaceState({}, "", "/b/DEMO?view=list");
        render(<NewItemButton {...dialogProps()} viewFilters={versionFilter} />);
        await user.click(screen.getByRole("button", { name: "Nouvel item" }));
        await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Nouveau");
        await user.click(screen.getByRole("button", { name: /^Créer$/ }));

        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
        const [message, options] = mocks.toastSuccess.mock.calls[0]!;
        expect(message).toBe("DEMO-9 créé — masqué par les filtres de la vue.");
        expect(options.action.label).toBe("Annuler");
        expect(options.secondaryAction.label).toBe("Ouvrir");
        options.secondaryAction.run();
        expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?view=list&item=DEMO-9");
      });

      // The reader's contract (Sprint filter, JIR-81): would the view list the
      // created item, given its real sprint memberships?
      const sprintA = fieldOptions.sprints![0]!.id;
      function readerShows(
        created: { id: string; type: "tache" | "epic" | "soustache"; parentId: string | null },
        memberships: { itemId: string; sprintId: string }[],
        filters: Filters,
      ) {
        const sprintIds = sprintIdsByItem(
          memberships.map((m) => ({ ...m, joinedAt: new Date(0), leftAt: null, outcome: null })),
          [created],
        ).get(created.id) ?? [];
        const [row] = enrichHierarchy([{
          ...created, key: "DEMO-9", kind: "feature", title: "x",
          statusId: statuses[0]!.id, priority: 0, assigneeId: null, path: "root.i", depth: 0,
          dueDate: null, createdAt: new Date(0), updatedAt: new Date(0), rank: "a",
          labelIds: [], fixVersionIds: [], sprintIds, statusOrder: 0,
        }]);
        return matchItem(row!, filters);
      }
      const sprintFilter = (sprintIds: string[]) => ({ ...versionFilter, releaseIds: [], sprintIds });

      it("never claims « masqué » for a Sous-tâche from the Sprint it inherits", async () => {
        const user = userEvent.setup();
        const task = { id: "task-id", key: "DEMO-4", type: "tache" as const, title: "Saisie" };
        const filters = sprintFilter([sprintA]);
        // Its parent tâche is in Sprint A: the reader lists the Sous-tâche.
        expect(readerShows(
          { id: "i", type: "soustache", parentId: task.id },
          [{ itemId: task.id, sprintId: sprintA }],
          filters,
        )).toBe(true);
        mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: createdRow("Sous", "soustache") });
        render(
          <NewItemButton
            {...dialogProps()}
            items={[task]}
            fieldOptions={fieldOptions}
            initialType="soustache"
            initialParentId={task.id}
            viewFilters={filters}
          />,
        );
        await user.click(screen.getByRole("button", { name: "Nouvel item" }));
        await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Sous");
        await user.click(screen.getByRole("button", { name: /^Créer$/ }));

        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
        expect(mocks.toastSuccess.mock.calls[0]![0]).toBe("DEMO-9 créé");
      });

      it("drops a Tâche draft's Sprint once switched to Epic, like the payload", async () => {
        const user = userEvent.setup();
        const composant = { id: "comp-id", key: "DEMO-1", type: "composant" as const, title: "Produit" };
        const filters = sprintFilter([sprintA]);
        // An Epic never joins a sprint: the reader leaves it out of Sprint A.
        expect(readerShows({ id: "i", type: "epic", parentId: composant.id }, [], filters)).toBe(false);
        mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: createdRow("Lot", "epic") });
        render(
          <NewItemButton
            {...dialogProps()}
            items={[...items, composant]}
            fieldOptions={fieldOptions}
            initialType="tache"
            initialParentId="epic-id"
            viewFilters={filters}
          />,
        );
        await user.click(screen.getByRole("button", { name: "Nouvel item" }));
        await choose(user, "Sprint", "Sprint 4");
        await choose(user, "Type", "Epic");
        await choose(user, /Parent/, "DEMO-1 — Produit");
        await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Lot");
        await user.click(screen.getByRole("button", { name: /^Créer$/ }));

        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
        expect(mocks.createItemAction.mock.calls[0]![0]).not.toHaveProperty("sprintId");
        expect(mocks.toastSuccess.mock.calls[0]![0]).toBe("DEMO-9 créé — masqué par les filtres de la vue.");
      });

      it("checks a Tâche against the Sprint actually sent", async () => {
        const user = userEvent.setup();
        const filters = sprintFilter(["none"]);
        // Planned in Sprint A: the reader leaves it out of « Aucun sprint ».
        expect(readerShows(
          { id: "i", type: "tache", parentId: "epic-id" },
          [{ itemId: "i", sprintId: sprintA }],
          filters,
        )).toBe(false);
        mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: createdRow("Planifiée", "tache") });
        render(
          <NewItemButton
            {...dialogProps()}
            items={items}
            fieldOptions={fieldOptions}
            initialType="tache"
            initialParentId="epic-id"
            viewFilters={filters}
          />,
        );
        await user.click(screen.getByRole("button", { name: "Nouvel item" }));
        await choose(user, "Sprint", "Sprint 4");
        await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Planifiée");
        await user.click(screen.getByRole("button", { name: /^Créer$/ }));

        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
        expect(mocks.createItemAction.mock.calls[0]![0]).toEqual(expect.objectContaining({ sprintId: sprintA }));
        expect(mocks.toastSuccess.mock.calls[0]![0]).toBe("DEMO-9 créé — masqué par les filtres de la vue.");
      });

      describe("filters changed while the create runs (JIR-92 R2)", () => {
        const versionV = releaseOptions[0]!.id;
        const versionW = releaseOptions[1]!.id;
        const onVersion = (id: string) => ({ ...versionFilter, releaseIds: [id] });

        /**
         * Submits with `before`, re-renders the view with `after` while the
         * action is pending, then resolves it: returns the success message.
         */
        async function messageAfterChange(
          before: typeof versionFilter | undefined,
          after: typeof versionFilter | undefined,
          sentVersion?: "2026.09",
        ) {
          const user = userEvent.setup();
          let resolve!: (value: unknown) => void;
          mocks.createItemAction.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
          const { rerender } = render(<NewItemButton {...dialogProps()} viewFilters={before} />);
          await user.click(screen.getByRole("button", { name: "Nouvel item" }));
          await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Nouveau");
          if (sentVersion) {
            await user.click(screen.getByRole("button", { name: "Versions" }));
            await user.click(screen.getByRole("menuitemcheckbox", { name: /^2026\.09/ }));
            await user.keyboard("{Escape}");
          }
          await user.click(screen.getByRole("button", { name: /^Créer$/ }));
          await waitFor(() => expect(mocks.createItemAction).toHaveBeenCalled());
          rerender(<NewItemButton {...dialogProps()} viewFilters={after} />);
          resolve({ ok: true, item: createdRow("Nouveau") });
          await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
          return mocks.toastSuccess.mock.calls[0]![0];
        }

        it("shows the plain message once the Version filter is cleared", async () => {
          expect(await messageAfterChange(onVersion(versionV), undefined)).toBe("DEMO-9 créé");
        });

        it("still says « masqué » when the new Version does not match either", async () => {
          expect(await messageAfterChange(onVersion(versionV), onVersion(versionW)))
            .toBe("DEMO-9 créé — masqué par les filtres de la vue.");
        });

        it("shows the plain message when the new Version matches what was sent", async () => {
          expect(await messageAfterChange(onVersion(versionV), onVersion(versionW), "2026.09"))
            .toBe("DEMO-9 créé");
        });

        it("falls back to the plain message once the dialog left the view", async () => {
          const user = userEvent.setup();
          let resolve!: (value: unknown) => void;
          mocks.createItemAction.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
          const { unmount } = render(<NewItemButton {...dialogProps()} viewFilters={onVersion(versionV)} />);
          await user.click(screen.getByRole("button", { name: "Nouvel item" }));
          await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Nouveau");
          await user.click(screen.getByRole("button", { name: /^Créer$/ }));
          await waitFor(() => expect(mocks.createItemAction).toHaveBeenCalled());
          unmount();
          resolve({ ok: true, item: createdRow("Nouveau") });
          await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
          expect(mocks.toastSuccess.mock.calls[0]![0]).toBe("DEMO-9 créé");
        });

        it("says « masqué » for a filter set during the wait", async () => {
          expect(await messageAfterChange(undefined, onVersion(versionV)))
            .toBe("DEMO-9 créé — masqué par les filtres de la vue.");
        });
      });

      it("keeps the plain message when the item gets the filtered Version", async () => {
        const user = userEvent.setup();
        mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: createdRow("Versionné") });
        render(<NewItemButton {...dialogProps()} viewFilters={versionFilter} />);
        await user.click(screen.getByRole("button", { name: "Nouvel item" }));
        await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Versionné");
        await user.click(screen.getByRole("button", { name: "Versions" }));
        await user.click(screen.getByRole("menuitemcheckbox", { name: /^2026\.10/ }));
        await user.keyboard("{Escape}");
        await user.click(screen.getByRole("button", { name: /^Créer$/ }));

        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
        expect(mocks.toastSuccess.mock.calls[0]![0]).toBe("DEMO-9 créé");
      });
    });

    it("closes with « Annuler »", async () => {
      const user = userEvent.setup();
      render(<NewItemButton {...dialogProps()} />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      await user.click(screen.getByRole("button", { name: "Annuler" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("prefilled parent consistency (JIR-73 R3)", () => {
    it("never shows one parent while sending another when the prefilled one is not a candidate", async () => {
      const user = userEvent.setup();
      render(
        <NewItemButton
          {...dialogProps()}
          items={[{ id: "other-epic", key: "DEMO-5", type: "epic", title: "Autre epic" }]}
          initialType="tache"
          initialParentId="opened-epic"
        />,
      );
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      expect(screen.getByRole("combobox", { name: /Parent/ })).toHaveTextContent("Choisir une epic…");
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Tâche");
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));
      expect(screen.getByRole("combobox", { name: /Parent/ })).toHaveAttribute("aria-invalid", "true");
      expect(mocks.createItemAction).not.toHaveBeenCalled();
    });

    it("refuses the create when no parent candidate exists", async () => {
      const user = userEvent.setup();
      render(
        <NewItemButton {...dialogProps()} items={[]} initialType="tache" initialParentId="opened-epic" />,
      );
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Tâche");
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));
      expect(screen.getByText("Parent obligatoire : créez d’abord une Epic.")).toBeVisible();
      expect(mocks.createItemAction).not.toHaveBeenCalled();
    });
  });

  describe("select fields (JIR-80)", () => {
    it("chooses type, priority, nature and template through the selects, icons included", async () => {
      const user = userEvent.setup();
      mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: { id: "i", key: "DEMO-9" } });
      render(
        <NewItemButton
          {...dialogProps()}
          items={[{ id: "component-id", key: "DEMO-1", type: "composant", title: "Plateforme" }]}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));

      const type = screen.getByRole("combobox", { name: "Type" });
      expect(type).toHaveTextContent("Composant");
      expect(type.querySelector('svg[aria-label="Composant"]')).toBeInTheDocument();
      await choose(user, "Type", "Epic");
      expect(type).toHaveTextContent("Epic");
      await choose(user, /Parent/, "DEMO-1 — Plateforme");

      const priority = screen.getByRole("combobox", { name: "Priorité" });
      expect(priority).toHaveTextContent("Aucune");
      await choose(user, "Priorité", "Haute");
      expect(priority).toHaveTextContent("Haute");
      await choose(user, "Nature", "Bug");
      await choose(user, "Modèle", "Aucun");
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Epic choisie");
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));

      await waitFor(() =>
        expect(mocks.createItemAction).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "epic",
            parentId: "component-id",
            priority: 3,
            kind: "bug",
            statusId: undefined,
          }),
        ),
      );
    });

    it("names the status a create without a pick lands in, and still sends none", async () => {
      const user = userEvent.setup();
      mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: { id: "i", key: "DEMO-9" } });
      render(
        <NewItemButton
          {...dialogProps()}
          statuses={[
            { id: "doing-id", name: "En cours", category: "in_progress" },
            { id: "todo-id", name: "À faire", category: "todo" },
          ]}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));

      expect(screen.getByRole("combobox", { name: "Statut" })).toHaveTextContent("À faire");
      expect(screen.queryByText("(par défaut)")).not.toBeInTheDocument();
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Statut par défaut");
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));

      await waitFor(() =>
        expect(mocks.createItemAction).toHaveBeenCalledWith(
          expect.objectContaining({ statusId: undefined }),
        ),
      );
    });

    it("shows a sprint task as a fixed « Tâche » even without the scheduling right", async () => {
      const user = userEvent.setup();
      render(
        <NewItemButton
          {...dialogProps()}
          items={[{ id: "epic-id", key: "DEMO-2", type: "epic", title: "Paiement" }]}
          sprintId={null}
          contextLabel="Sprint 2"
          canScheduleItems={false}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));

      expect(screen.getByRole("group", { name: "Type" })).toHaveTextContent("Tâche");
      expect(screen.queryByText("Composant")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Créer$/ })).toHaveAccessibleName("Créer");
      expect(screen.getByText(/il faut le droit de planifier/)).toBeVisible();
    });

    it("keeps « M’assigner » beside the Assigné field", async () => {
      const user = userEvent.setup();
      render(
        <NewItemButton
          {...dialogProps()}
          fieldOptions={{ users: [{ id: "me", name: "Marie Lemaire" }], canAssign: true, currentUserId: "me" }}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));

      const assignee = screen.getByRole("combobox", { name: "Assigné" });
      expect(assignee.parentElement).toContainElement(screen.getByRole("button", { name: "M’assigner" }));
    });

    it("renders the due date as a French date field", async () => {
      const user = userEvent.setup();
      render(<NewItemButton {...dialogProps()} />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));

      expect(screen.getByLabelText("Échéance")).toHaveAttribute("lang", "fr");
    });
  });

  describe("required parent (JIR-69)", () => {
    const composant = { id: "component-id", key: "DEMO-1", type: "composant" as const, title: "Plateforme" };
    const epic = { id: "epic-id", key: "DEMO-2", type: "epic" as const, title: "Connexion" };
    const tache = { id: "task-id", key: "DEMO-3", type: "tache" as const, title: "Formulaire" };

    it("marks the Parent field required and states the rule of each type", async () => {
      const user = userEvent.setup();
      render(<NewItemButton {...dialogProps()} items={[composant, epic, tache]} />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      expect(screen.queryByRole("combobox", { name: /Parent/ })).not.toBeInTheDocument();

      for (const [type, rule] of [
        ["Epic", "Une Epic se rattache toujours à un Composant."],
        ["Tâche", "Une Tâche se rattache toujours à une Epic."],
        ["Sous-tâche", "Une Sous-tâche se rattache toujours à une Tâche."],
      ] as const) {
        await choose(user, "Type", type);
        const parent = screen.getByRole("combobox", { name: "Parent (obligatoire)" });
        expect(parent).toHaveAttribute("aria-required", "true");
        expect(parent).not.toHaveAttribute("aria-invalid");
        expect(parent).toHaveAccessibleDescription(rule);
      }
      // The asterisk is visual only; the label says « (obligatoire) » to assistive tech.
      const label = document.querySelector('label[for="item-parent"]')!;
      expect(label.querySelector('[aria-hidden="true"]')).toHaveTextContent("*");
      expect(document.querySelectorAll("select[required]")).toHaveLength(0);
    });

    it("explains a missing parent on « Créer » and focuses the field once the error shows", async () => {
      const user = userEvent.setup();
      render(<NewItemButton {...dialogProps()} items={[epic]} initialType="tache" />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Écran de vérification");
      const submit = screen.getByRole("button", { name: /^Créer$/ });
      expect(submit).toBeEnabled();

      // What the Parent field says at the moment it receives focus.
      const parent = screen.getByRole("combobox", { name: /Parent/ });
      const atFocus: (string | null)[] = [];
      parent.addEventListener("focus", () => {
        atFocus.push(parent.getAttribute("aria-invalid"));
        atFocus.push(document.getElementById(parent.getAttribute("aria-describedby")!.split(" ")[0]!)?.textContent ?? null);
      });
      await user.click(submit);

      expect(parent).toHaveFocus();
      expect(atFocus).toEqual(["true", "Parent obligatoire : choisissez une Epic."]);
      expect(parent).toHaveAccessibleDescription(
        "Parent obligatoire : choisissez une Epic. Une Tâche se rattache toujours à une Epic.",
      );
      expect(mocks.createItemAction).not.toHaveBeenCalled();

      // A second « Créer » focuses the field again, the error unchanged.
      screen.getByRole("textbox", { name: /Titre/ }).focus();
      await user.click(submit);
      expect(parent).toHaveFocus();
    });

    it("clears the error once a parent is chosen, then creates", async () => {
      const user = userEvent.setup();
      mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: { id: "i", key: "DEMO-4" } });
      render(<NewItemButton {...dialogProps()} items={[epic]} initialType="tache" />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Écran de vérification");
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));
      expect(screen.getByText("Parent obligatoire : choisissez une Epic.")).toBeVisible();

      await choose(user, /Parent/, "DEMO-2 — Connexion");
      const parent = screen.getByRole("combobox", { name: /Parent/ });
      expect(parent).not.toHaveAttribute("aria-invalid");
      expect(parent).toHaveAccessibleDescription("Une Tâche se rattache toujours à une Epic.");
      expect(screen.queryByText(/Parent obligatoire/)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));

      await waitFor(() =>
        expect(mocks.createItemAction).toHaveBeenCalledWith(
          expect.objectContaining({ type: "tache", parentId: "epic-id", title: "Écran de vérification" }),
        ),
      );
    });

    it("drops the error when the type changes, and names the new parent next time", async () => {
      const user = userEvent.setup();
      render(<NewItemButton {...dialogProps()} items={[composant, epic]} initialType="tache" />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Brouillon");
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));
      expect(screen.getByText("Parent obligatoire : choisissez une Epic.")).toBeVisible();

      await choose(user, "Type", "Epic");
      expect(screen.queryByText(/Parent obligatoire/)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));
      expect(screen.getByText("Parent obligatoire : choisissez un Composant.")).toBeVisible();
    });

    it("keeps « Créer » disabled for an empty title, as before", async () => {
      const user = userEvent.setup();
      render(<NewItemButton {...dialogProps()} items={[epic]} initialType="tache" />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      expect(screen.getByRole("button", { name: /^Créer$/ })).toBeDisabled();
    });
  });

  describe("missing parent (JIR-91)", () => {
    it("offers « Créer un Composant » for an Epic in a backlog without Composant", async () => {
      const user = userEvent.setup();
      render(<NewItemButton {...dialogProps()} items={[]} />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      await choose(user, "Type", "Epic");

      const parent = screen.getByRole("combobox", { name: /Parent/ });
      expect(parent).toHaveAccessibleDescription(
        "Aucun Composant dans ce backlog : une Epic se rattache toujours à un Composant.",
      );
      expect(screen.getByRole("button", { name: "Créer un Composant" })).toBeVisible();
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Connexion");
      // JIR-69: « Créer » explains instead of staying disabled, without repeating the rule.
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));
      expect(parent).toHaveAccessibleDescription(
        "Parent obligatoire : créez d’abord un Composant. Aucun Composant dans ce backlog : une Epic se rattache toujours à un Composant.",
      );
      expect(parent).toHaveFocus();
      expect(screen.queryByText("Une Epic se rattache toujours à un Composant.")).not.toBeInTheDocument();
      expect(mocks.createItemAction).not.toHaveBeenCalled();
    });

    it("switches the same draft to a Composant, keeping its title and description", async () => {
      const user = userEvent.setup();
      const template = ITEM_TEMPLATES[0]!;
      mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: { id: "i", key: "DEMO-1" } });
      render(<NewItemButton {...dialogProps()} items={[]} />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      await choose(user, "Type", "Epic");
      await choose(user, "Modèle", template.name);
      await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Espace usagers");

      // What the Type field says at the moment it receives focus.
      const typeAtFocus: string[] = [];
      screen.getByRole("combobox", { name: "Type" }).addEventListener("focus", (event) => {
        typeAtFocus.push((event.currentTarget as HTMLElement).textContent ?? "");
      });
      await user.click(screen.getByRole("button", { name: "Créer un Composant" }));

      const type = screen.getByRole("combobox", { name: "Type" });
      expect(type).toHaveTextContent("Composant");
      expect(type).toHaveFocus();
      expect(typeAtFocus).toEqual(["Composant"]);
      expect(screen.queryByRole("combobox", { name: /Parent/ })).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /Titre/ })).toHaveValue("Espace usagers");
      await user.click(screen.getByRole("button", { name: /^Créer$/ }));

      await waitFor(() =>
        expect(mocks.createItemAction).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "composant",
            parentId: null,
            title: "Espace usagers",
            description: template.description,
          }),
        ),
      );
    });

    it("follows the hierarchy: « Créer une Epic » for a Tâche, « Créer une Tâche » for a Sous-tâche", async () => {
      const user = userEvent.setup();
      const composant = { id: "component-id", key: "DEMO-1", type: "composant" as const, title: "Plateforme" };
      const { unmount } = render(
        <NewItemButton {...dialogProps()} items={[composant]} initialType="tache" />,
      );
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      expect(screen.getByRole("combobox", { name: /Parent/ })).toHaveAccessibleDescription(
        "Aucune Epic dans ce backlog : une Tâche se rattache toujours à une Epic.",
      );
      await user.click(screen.getByRole("button", { name: "Créer une Epic" }));
      expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Epic");
      // The Epic finds its Composant: the parent field is a normal choice again.
      expect(screen.getByRole("combobox", { name: /Parent/ })).toHaveAccessibleDescription(
        "Une Epic se rattache toujours à un Composant.",
      );
      unmount();

      render(<NewItemButton {...dialogProps()} items={[composant]} initialType="soustache" />);
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));
      await user.click(screen.getByRole("button", { name: "Créer une Tâche" }));
      expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Tâche");
      expect(screen.getByRole("button", { name: "Créer une Epic" })).toBeVisible();
    });

    it("only explains in a sprint-contextual create, which must stay a task", async () => {
      const user = userEvent.setup();
      render(
        <NewItemButton {...dialogProps()} items={[]} sprintId={null} contextLabel="Sprint 2" />,
      );
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));

      expect(screen.getByRole("combobox", { name: /Parent/ })).toHaveAccessibleDescription(
        "Aucune Epic dans ce backlog : une Tâche se rattache toujours à une Epic.",
      );
      expect(screen.queryByRole("button", { name: /^Créer une/ })).not.toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Type" })).toHaveTextContent("Tâche");
    });

    it("never offers an Epic, nor its missing parent, without the scheduling right", async () => {
      const user = userEvent.setup();
      render(
        <NewItemButton {...dialogProps()} items={[]} initialType="epic" canScheduleItems={false} />,
      );
      await user.click(screen.getByRole("button", { name: "Nouvel item" }));

      expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Composant");
      expect(screen.queryByRole("combobox", { name: /Parent/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Créer une?/ })).not.toBeInTheDocument();
    });
  });
});

describe("NewItemButton directory access", () => {
  it("explains the missing global permission in the assignee menu", async () => {
    const user = userEvent.setup();
    render(<NewItemButton {...dialogProps()} fieldOptions={{ users: [], canAssign: true, canBrowseUsers: false }} />);
    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    await user.click(screen.getByRole("combobox", { name: "Assigné" }));
    expect(screen.getByRole("option", { name: "Non assigné" })).toBeVisible();
    expect(screen.getByText(/Il vous manque la permission globale/)).toBeVisible();
  });
  it("keeps self assignment when the caller supplies the current user", async () => {
    const user = userEvent.setup();
    render(<NewItemButton {...dialogProps()} fieldOptions={{ users: [{ id: "me", name: "Moi" }], currentUserId: "me", canAssign: true, canBrowseUsers: false }} />);
    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    await user.click(screen.getByRole("button", { name: "M’assigner" }));
    expect(screen.getByRole("combobox", { name: "Assigné" })).toHaveTextContent("Moi");
  });
});
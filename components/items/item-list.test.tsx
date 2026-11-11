import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentHref } from "@/test/history";
import { ItemList, ListColumnsMenu } from "@/components/items/item-list";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";

const mocks = vi.hoisted(() => ({
  bulkUpdateItemsAction: vi.fn(),
  createItemAction: vi.fn(),
  softDeleteItemAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  updateItemAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/DEMO",
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/app/actions/items", () => ({
  bulkUpdateItemsAction: mocks.bulkUpdateItemsAction,
  createItemAction: mocks.createItemAction,
  softDeleteItemAction: mocks.softDeleteItemAction,
  updateItemAction: mocks.updateItemAction,
}));

vi.mock("@/app/actions/item-choices", () => ({
  searchBacklogItemsAction: vi.fn(async () => ({ ok: true as const, items: [], limit: 20 })),
}));

const todoStatusId = "11111111-1111-4111-8111-111111111111";

const statuses: Array<{
  id: string;
  name: string;
  color: string;
  category: "todo" | "in_progress" | "done";
  order: number;
}> = [
  { id: todoStatusId, name: "À faire", color: "#9aa0a6", category: "todo", order: 0 },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "En cours",
    color: "#d99a2b",
    category: "in_progress",
    order: 1,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "En revue",
    color: "#8b5cf6",
    category: "in_progress",
    order: 2,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Terminé",
    color: "#3aa675",
    category: "done",
    order: 3,
  },
];

const users = [
  { id: "marie", name: "Marie Lemaire" },
  { id: "nora", name: "Nora Benali" },
];

function item(
  id: string,
  key: string,
  title: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    key,
    type: "tache" as const,
    kind: "feature" as const,
    title,
    statusId: todoStatusId,
    priority: 2,
    estimatePoints: null,
    depth: 0,
    dueDate: "2026-08-12T00:00:00.000Z",
    assigneeId: "marie",
    assigneeName: "Marie Lemaire",
    labels: [{ id: "urgent", name: "Urgent", color: "--label-3" }],
    blocked: false,
    statusOrder: 0,
    ancestorIds: [],
    componentId: null,
    ...overrides,
  };
}

const groups = [
  {
    key: "platform",
    label: "Plateforme",
    items: [item("item-1", "DEMO-1", "Authentication")],
  },
  {
    key: "billing",
    label: "Facturation",
    items: [item("item-2", "DEMO-2", "Invoices", { assigneeId: null, assigneeName: null })],
  },
];

const initialUrlParams = {
  view: "list",
  item: "DEMO-9",
  v: "saved-view",
  q: "auth",
};

function listProps(): React.ComponentProps<typeof ItemList> {
  return {
    groups,
    grouped: false,
    statuses,
    users,
    backlogId: "backlog-id",
    backlogKey: "DEMO",
    currentSort: null,
  };
}

function renderList(props = listProps()) {
  return render(
    <ViewUrlStateProvider initialEntries={Object.entries(initialUrlParams)}>
      <ItemList {...props} />
    </ViewUrlStateProvider>,
  );
}

describe("ItemList", () => {
  beforeEach(() => {
    mocks.bulkUpdateItemsAction.mockReset();
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.replace.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it("shows Fix versions as two compact row chips and a remainder when the column is on", () => {
    const versions = [
      { id: "release-1", name: "2026.10", released: false, archived: false },
      { id: "release-2", name: "2026.09", released: true, archived: false },
      { id: "release-3", name: "Legacy", released: true, archived: true },
    ];
    renderList({
      ...listProps(),
      showFixVersions: true,
      groups: [{
        key: "",
        label: "",
        items: [item("item-1", "DEMO-1", "Authentication", { fixVersions: versions })],
      }],
    });

    const row = screen.getByRole("listitem", { name: /DEMO-1 — Authentication/ });
    expect(within(row).getByText("2026.10")).toBeVisible();
    expect(within(row).getByText("2026.09")).toBeVisible();
    expect(within(row).getByText("+1")).toBeVisible();
    expect(within(row).queryByText("Legacy")).not.toBeInTheDocument();
  });

  it("keeps the optional columns URL-configurable from « Colonnes »", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <ViewUrlStateProvider initialEntries={Object.entries(initialUrlParams)}>
        <ListColumnsMenu />
      </ViewUrlStateProvider>,
    );

    for (const [label, param] of [
      ["Labels", "lblcol=1"],
      ["Échéance", "duecol=1"],
      ["Fix versions", "fvcol=1"],
    ] as const) {
      await user.click(screen.getByRole("button", { name: "Configurer les colonnes" }));
      const option = screen.getByRole("menuitemcheckbox", { name: label });
      expect(option).not.toBeChecked();
      await user.click(option);
      expect(mocks.replace).toHaveBeenLastCalledWith(
        expect.stringContaining(param),
        { scroll: false },
      );
    }
    unmount();

    render(
      <ViewUrlStateProvider
        initialEntries={Object.entries({ ...initialUrlParams, lblcol: "1" })}
      >
        <ListColumnsMenu showLabels />
      </ViewUrlStateProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Configurer les colonnes" }));
    const labels = screen.getByRole("menuitemcheckbox", { name: "Labels" });
    expect(labels).toBeChecked();
    await user.click(labels);
    expect(mocks.replace).toHaveBeenLastCalledWith(
      expect.not.stringContaining("lblcol"),
      { scroll: false },
    );
  });

  it("shows labels and the due date as row pills only when their columns are on", () => {
    const { unmount } = renderList();
    let row = screen.getByRole("listitem", { name: "DEMO-1 — Authentication" });
    expect(within(row).queryByText("Urgent")).not.toBeInTheDocument();
    expect(within(row).queryByTitle("Échéance")).not.toBeInTheDocument();
    unmount();

    renderList({ ...listProps(), showLabels: true, showDueDate: true });
    row = screen.getByRole("listitem", { name: "DEMO-1 — Authentication" });
    expect(within(row).getByText("Urgent")).toBeVisible();
    expect(within(row).getByTitle("Échéance")).toHaveTextContent("12 août 2026");
  });

  it("renders a flat list with each parent as a pill", () => {
    renderList({
      ...listProps(),
      groups: [{
        key: "",
        label: "",
        items: [
          item("item-3", "DEMO-3", "Sous-tâche", {
            type: "soustache",
            depth: 3,
            parent: { key: "DEMO-1", title: "Authentication", type: "tache" },
          }),
        ],
      }],
    });

    const row = screen.getByRole("listitem", { name: "DEMO-3 — Sous-tâche" });
    expect(within(row).getByTitle("DEMO-1 — Authentication")).toHaveTextContent("Authentication");
    // No hierarchy indentation (that is the Arbre), and no estimate below a task.
    expect(row.querySelector("[style*='padding-left']")).toBeNull();
    expect(within(row).queryByRole("button", { name: /^Estimation/ })).not.toBeInTheDocument();
    // No drag handle outside the Backlog.
    expect(within(row).queryByRole("button", { name: /^Déplacer/ })).not.toBeInTheDocument();
  });

  it("enables selection for release-only bulk assignment", async () => {
    const user = userEvent.setup();
    renderList({
      ...listProps(),
      canBulkChangeItems: false,
      releaseOptions: [
        { id: "release-1", name: "2026.10", released: false, archived: false },
      ],
      releaseCapabilities: {
        manage: false,
        assignItems: false,
        bulkAssignItems: true,
      },
    });

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-1" }));
    expect(screen.getByRole("button", { name: "Versions" })).toBeVisible();
  });

  it("guides an empty backlog to its first Composant (JIR-88)", async () => {
    const user = userEvent.setup();
    renderList({
      ...listProps(),
      groups: [{ key: "", label: "", items: [] }],
      filtersActive: false,
      clearFiltersHref: "/b/DEMO?view=list",
      startStep: "composant",
      createDialogProps: {
        backlogId: "backlog-id",
        structure: [],
        statuses: [{ id: todoStatusId, name: "À faire" }],
      },
    });

    expect(
      screen.getByRole("heading", { name: "Commencez par créer un Composant (un domaine ou un produit)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Aucun item" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nouveau Composant" }));
    const dialog = screen.getByRole("dialog", { name: /Nouvel item/ });
    expect(within(dialog).getByRole("combobox", { name: "Type" })).toHaveTextContent("Composant");
  });

  it("asks for an Epic above the rows while only Composants exist (JIR-88)", async () => {
    const user = userEvent.setup();
    const composants = [
      { id: "comp-1", key: "DEMO-1", type: "composant" as const, title: "Portail" },
      { id: "comp-2", key: "DEMO-2", type: "composant" as const, title: "Greffe" },
    ];
    renderList({
      ...listProps(),
      groups: [
        {
          key: "",
          label: "",
          items: composants.map((row) => item(row.id, row.key, row.title, { type: "composant" })),
        },
      ],
      startStep: "epic",
      createDialogProps: {
        backlogId: "backlog-id",
        structure: composants,
        statuses: [{ id: todoStatusId, name: "À faire" }],
      },
    });

    const note = screen.getByRole("note", { name: "Créez une Epic dans un Composant" });
    expect(screen.getByRole("list", { name: "Liste des items" })).toBeInTheDocument();
    // As in the Backlog, the button sits in place of « Créer un item » at the
    // bottom of the card, not twice.
    expect(within(note).queryByRole("button")).not.toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Tous les items" });
    expect(within(card).queryByRole("button", { name: /Créer un item/ })).not.toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Nouvelle Epic (Tous les items)" }));
    const dialog = screen.getByRole("dialog", { name: /Nouvel item/ });
    expect(within(dialog).getByRole("combobox", { name: "Type" })).toHaveTextContent("Epic");
    // Two Composants: the parent is left to choose.
    expect(within(dialog).getByRole("combobox", { name: /Parent/ })).toHaveValue("");
    expect(within(dialog).getByRole("combobox", { name: /Parent/ })).toHaveAttribute(
      "placeholder",
      "Choisir un composant…",
    );
  });

  it("only states the missing Epic to a viewer", () => {
    renderList({
      ...listProps(),
      startStep: "epic",
      createDialogProps: {
        backlogId: "backlog-id",
        structure: [{ id: "comp-1", key: "DEMO-9", type: "composant", title: "Portail" }],
        statuses: [{ id: todoStatusId, name: "À faire" }],
      },
      canCreateItems: false,
    });

    expect(screen.getByRole("note", { name: "Aucune Epic pour l’instant" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Nouvelle Epic" })).not.toBeInTheDocument();
  });

  it("offers a shareable filter reset when the list has no matches", () => {
    renderList({
      ...listProps(),
      groups: [{ key: "", label: "", items: [] }],
      filtersActive: true,
      hasItems: true,
      clearFiltersHref: "/b/DEMO?view=list",
    });

    expect(screen.getByRole("heading", { name: "Aucun résultat" })).toBeInTheDocument();
    expect(screen.getByText("Aucun item ne correspond aux filtres actifs.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Effacer les filtres" })).toHaveAttribute(
      "href",
      "/b/DEMO?view=list",
    );
  });

  it("keeps creation available when active filters belong to an empty backlog", async () => {
    const user = userEvent.setup();
    renderList({
      ...listProps(),
      groups: [{ key: "", label: "", items: [] }],
      filtersActive: true,
      hasItems: false,
      clearFiltersHref: "/b/DEMO?view=list",
      startStep: "composant",
      createDialogProps: {
        backlogId: "backlog-id",
        structure: [],
        statuses: [{ id: todoStatusId, name: "À faire" }],
      },
    });

    expect(
      screen.getByRole("heading", { name: "Commencez par créer un Composant (un domaine ou un produit)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Effacer les filtres" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nouveau Composant" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders rows as a list in the Backlog card, sorted from its header, not a table", () => {
    renderList();

    // Regression (JIR-93 review): no fake table, no column headers.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("columnheader")).toHaveLength(0);
    expect(screen.queryAllByRole("row")).toHaveLength(0);
    expect(document.querySelector("[aria-sort]")).toBeNull();
    const list = screen.getByRole("list", { name: "Liste des items" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);

    const sort = screen.getByRole("group", { name: "Trier la liste" });
    for (const label of ["Clé", "Titre", "Échéance", "Priorité", "Statut"]) {
      expect(within(sort).getByRole("button", { name: `Trier par ${label}` }))
        .toHaveAttribute("aria-pressed", "false");
    }
    // No separate strip: the sort sits on the card header's second line.
    const card = screen.getByRole("region", { name: "Tous les items" });
    expect(within(card).getByRole("banner")).toContainElement(sort);
    expect(sort.parentElement).toHaveClass("basis-full");
    expect(screen.getAllByRole("img", { name: "À faire" })[0]).toBeVisible();
    // Rows wrap instead of flooring a table width: no horizontal page scroll.
    expect(list.getAttribute("style")).toBeNull();
  });

  it("labels each group of a grouped list", () => {
    renderList({ ...listProps(), grouped: true });
    expect(screen.getByRole("region", { name: "Liste des items" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Plateforme" })).getByRole("listitem"))
      .toHaveAccessibleName("DEMO-1 — Authentication");
  });

  it.each([
    ["Clé", "key"],
    ["Titre", "title"],
    ["Échéance", "dueDate"],
    ["Priorité", "priority"],
    ["Statut", "status"],
  ] as const)("sorts by %s through the URL and states the pressed direction", async (label, field) => {
    const user = userEvent.setup();
    const props = listProps();
    const { rerender } = renderList(props);

    await user.click(screen.getByRole("button", { name: `Trier par ${label}` }));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      expect.stringContaining(`sort=${field}%3Aasc`),
      { scroll: false },
    );

    rerender(
      <ViewUrlStateProvider
        initialEntries={Object.entries({ ...initialUrlParams, sort: `${field}:asc` })}
      >
        <ItemList {...props} currentSort={{ field, dir: "asc" }} />
      </ViewUrlStateProvider>,
    );
    const ascending = screen.getByRole("button", { name: `Trier par ${label}, croissant` });
    expect(ascending).toHaveAttribute("aria-pressed", "true");
    // The name carries the direction once; no description repeats it.
    expect(ascending).toHaveAccessibleDescription("");
    for (const other of screen.getAllByRole("button", { name: /^Trier par / })) {
      if (other !== ascending) expect(other).toHaveAttribute("aria-pressed", "false");
    }
    // Keyboard: the sort control is a native button.
    ascending.focus();
    await user.keyboard("{Enter}");
    expect(mocks.replace).toHaveBeenLastCalledWith(
      expect.stringContaining(`sort=${field}%3Adesc`),
      { scroll: false },
    );

    rerender(
      <ViewUrlStateProvider
        initialEntries={Object.entries({ ...initialUrlParams, sort: `${field}:desc` })}
      >
        <ItemList {...props} currentSort={{ field, dir: "desc" }} />
      </ViewUrlStateProvider>,
    );
    expect(screen.getByRole("button", { name: `Trier par ${label}, décroissant` }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("toggles title sorting while preserving unrelated URL parameters", async () => {
    const user = userEvent.setup();
    const props = listProps();
    const { rerender } = renderList(props);

    await user.click(screen.getByRole("button", { name: /^Trier par Titre/ }));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=list&item=DEMO-9&v=saved-view&q=auth&sort=title%3Aasc",
      { scroll: false },
    );

    rerender(
      <ViewUrlStateProvider
        initialEntries={Object.entries({ ...initialUrlParams, sort: "title:asc" })}
      >
        <ItemList
          {...props}
          currentSort={{ field: "title", dir: "asc" }}
        />
      </ViewUrlStateProvider>,
    );
    await user.click(screen.getByRole("button", { name: /^Trier par Titre/ }));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=list&item=DEMO-9&v=saved-view&q=auth&sort=title%3Adesc",
      { scroll: false },
    );
  });

  it("opens a row from non-interactive content but isolates inline editor clicks", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByText("Authentication"));
    expect(currentHref()).toBe("/b/DEMO?view=list&item=DEMO-1&v=saved-view&q=auth");
    expect(mocks.push).not.toHaveBeenCalled();

    mocks.push.mockClear();
    const row = screen.getByRole("listitem", { name: "DEMO-1 — Authentication" });
    await user.click(within(row).getByRole("button", { name: /Priorité.*Moyenne/i }));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("edits a task estimate without opening the row", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true, item: {} });
    renderList();

    const row = screen.getByRole("listitem", { name: "DEMO-1 — Authentication" });
    await user.click(within(row).getByRole("button", { name: "Estimation : Non estimé" }));
    const input = screen.getByRole("spinbutton", { name: "Points" });
    await user.type(input, "3");
    await user.click(screen.getByRole("button", { name: "Enregistrer l’estimation" }));

    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      estimatePoints: 3,
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("keeps rows navigable but renders item fields without editors for viewers", async () => {
    const user = userEvent.setup();
    renderList({
      ...listProps(),
      canCreateItems: false,
      canEditItems: false,
      canTransitionItems: false,
      canAssignItems: false,
      itemCapabilities: {
        create: false,
        edit: false,
        transition: false,
        assign: false,
        delete: false,
        restore: false,
        addComments: false,
        editOwnComments: false,
        deleteOwnComments: false,
        deleteAllComments: false,
        link: false,
      },
      bulkCapabilities: { edit: false, transition: false, assign: false, schedule: false },
    });

    const row = screen.getByRole("listitem", { name: "DEMO-1 — Authentication" });
    expect(within(row).queryByRole("button", { name: /Statut/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Priorité/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Assigné/i })).not.toBeInTheDocument();
    expect(within(row).getByText("À faire")).toBeVisible();
    expect(within(row).getByRole("img", { name: "Marie Lemaire" })).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await user.click(within(row).getByText("Authentication"));
    expect(currentHref()).toBe("/b/DEMO?view=list&item=DEMO-1&v=saved-view&q=auth");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("requires edit plus transition or assign for inline update editors", () => {
    const base = {
      ...listProps(),
      canCreateItems: false,
      canEditItems: false,
      canTransitionItems: false,
      canAssignItems: false,
    };

    const transitioned = renderList({ ...base, canTransitionItems: true });
    let row = screen.getByRole("listitem", { name: "DEMO-1 — Authentication" });
    expect(within(row).queryByRole("button", { name: /Statut/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Priorité/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Assigné/i })).not.toBeInTheDocument();
    transitioned.unmount();

    const editedAndTransitioned = renderList({
      ...base,
      canEditItems: true,
      canTransitionItems: true,
    });
    row = screen.getByRole("listitem", { name: "DEMO-1 — Authentication" });
    expect(within(row).getByRole("button", { name: /Statut/i })).toBeVisible();
    expect(within(row).queryByRole("button", { name: /Assigné/i })).not.toBeInTheDocument();
    editedAndTransitioned.unmount();

    const assigned = renderList({ ...base, canAssignItems: true });
    row = screen.getByRole("listitem", { name: "DEMO-1 — Authentication" });
    expect(within(row).queryByRole("button", { name: /Assigné/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Statut/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Priorité/i })).not.toBeInTheDocument();
    assigned.unmount();

    const editedAndAssigned = renderList({
      ...base,
      canEditItems: true,
      canAssignItems: true,
    });
    row = screen.getByRole("listitem", { name: "DEMO-1 — Authentication" });
    expect(within(row).getByRole("button", { name: /Assigné/i })).toBeVisible();
    expect(within(row).queryByRole("button", { name: /Statut/i })).not.toBeInTheDocument();
    editedAndAssigned.unmount();

    renderList({ ...base, canEditItems: true });
    row = screen.getByRole("listitem", { name: "DEMO-1 — Authentication" });
    expect(within(row).getByRole("button", { name: /Priorité.*Moyenne/i })).toBeVisible();
    expect(within(row).getByRole("button", { name: "Estimation : Non estimé" })).toBeVisible();
    expect(within(row).queryByRole("button", { name: /Statut/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Assigné/i })).not.toBeInTheDocument();
  });

  it("selects a visible range without opening item detail", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-1" }));
    const header = screen.getByRole("checkbox", { name: "Sélectionner tous les items visibles" });
    expect(header).toBePartiallyChecked();
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-2" }));
    await user.keyboard("{/Shift}");

    expect(screen.getByText("2 items sélectionnés")).toBeVisible();
    expect(header).toBeChecked();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("supports guarded keyboard select-all and Escape", async () => {
    const user = userEvent.setup();
    renderList();

    const row = screen.getByRole("listitem", { name: "DEMO-1 — Authentication" });
    row.focus();
    await user.keyboard("{Meta>}a{/Meta}");
    expect(screen.getByText("2 items sélectionnés")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Actions groupées" })).not.toBeInTheDocument();

    const priority = within(row).getByRole("button", { name: /Priorité.*Moyenne/i });
    priority.focus();
    await user.keyboard("{Meta>}a{/Meta}");
    expect(screen.queryByRole("region", { name: "Actions groupées" })).not.toBeInTheDocument();
  });

  it("keeps the selection when Escape only closes a bulk toolbar menu", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-1" }));
    await user.click(screen.getByRole("button", { name: "Modifier la priorité" }));
    expect(screen.getByRole("menu")).toBeVisible();
    // The portaled menu bubbles through React, not through the list's DOM.
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByText("1 item sélectionné")).toBeVisible();
  });

  it("reconciles selection when visible list results change", async () => {
    const user = userEvent.setup();
    const input = listProps();
    const { rerender } = renderList(input);

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-2" }));
    expect(screen.getByText("1 item sélectionné")).toBeVisible();
    rerender(
      <ViewUrlStateProvider initialEntries={Object.entries(initialUrlParams)}>
        <ItemList {...input} groups={[groups[0]!]} filtersActive />
      </ViewUrlStateProvider>,
    );

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Actions groupées" })).not.toBeInTheDocument(),
    );
  });

  it("does not offer creation to a viewer in an empty backlog", () => {
    renderList({
      ...listProps(),
      groups: [{ key: "", label: "", items: [] }],
      startStep: "composant",
      createDialogProps: {
        backlogId: "backlog-id",
        structure: [],
        statuses: [{ id: todoStatusId, name: "À faire" }],
      },
      canCreateItems: false,
      canEditItems: false,
      canTransitionItems: false,
      canAssignItems: false,
    });

    expect(screen.getByRole("heading", { name: "Ce backlog est vide" })).toBeVisible();
    expect(screen.getByText("Aucun Composant n’y a encore été créé.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Nouveau Composant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nouvel item" })).not.toBeInTheDocument();
  });

  it("collapses and restores a group only in the current component session", async () => {
    const user = userEvent.setup();
    renderList({ ...listProps(), grouped: true, groups });

    const toggle = screen.getByRole("button", { name: "Replier Plateforme" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Authentication")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName("Déplier Plateforme");
    expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();

    await user.click(toggle);
    await waitFor(() => expect(screen.getByText("Authentication")).toBeInTheDocument());
  });

  it("frames the ungrouped Liste in one Backlog card with counts and points (JIR-97)", () => {
    renderList({
      ...listProps(),
      groups: [
        {
          key: "",
          label: "",
          items: [
            item("item-1", "DEMO-1", "Authentication", { estimatePoints: 3 }),
            item("item-2", "DEMO-2", "Invoices", {
              estimatePoints: 5,
              statusId: "22222222-2222-4222-8222-222222222222",
            }),
            item("item-3", "DEMO-3", "Audit"),
            // Not a task: neither points nor « non estimé ».
            item("item-4", "DEMO-4", "Portail", { type: "epic", estimatePoints: 8 }),
          ],
        },
      ],
    });

    const card = screen.getByRole("region", { name: "Tous les items" });
    expect(card).toHaveAttribute("data-item-section");
    const header = within(card).getByRole("banner");
    expect(within(header).getByRole("heading", { level: 2, name: "Tous les items" })).toBeVisible();
    expect(within(header).getByText("4 items · 1 non estimé")).toBeVisible();
    expect(within(header).getByText("Points par statut : À faire 3, En cours 5, Terminé 0"))
      .toBeInTheDocument();
    expect(within(header).getByRole("checkbox", { name: "Sélectionner tous les items visibles" }))
      .not.toBeChecked();
    expect(within(header).getByRole("button", { name: "Replier Tous les items" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(within(card).getAllByRole("listitem")).toHaveLength(4);
    // No drag handle: the Liste follows its sort.
    expect(screen.queryByRole("button", { name: /^Déplacer/ })).not.toBeInTheDocument();
  });

  it("shows the figures the server counted over the whole group, not over its rows (JIR-143)", () => {
    renderList({
      ...listProps(),
      grouped: true,
      groups: [
        {
          key: "billing",
          label: "Facturation",
          items: [item("item-2", "DEMO-2", "Invoices", { estimatePoints: 2 })],
          summary: { count: 140, unestimated: 12, points: { todo: 21.5, inProgress: 8, done: 3.25 } },
        },
      ],
    });

    const billing = screen.getByRole("region", { name: "Facturation" });
    expect(within(billing).getByText("140 items · 12 non estimés")).toBeVisible();
    expect(within(billing).getByText("Points par statut : À faire 21,5, En cours 8, Terminé 3,25"))
      .toBeInTheDocument();
  });

  it("collapses the card and drops its hidden rows from the selection", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-1" }));
    expect(screen.getByText("1 item sélectionné")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Replier Tous les items" }));

    expect(screen.queryByRole("list", { name: "Liste des items" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Actions groupées" })).not.toBeInTheDocument(),
    );
    // Still sortable and counted while collapsed.
    expect(screen.getByRole("group", { name: "Trier la liste" })).toBeVisible();
    expect(screen.getByText("2 items · 2 non estimés")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Déplier Tous les items" }));
    expect(screen.getByRole("list", { name: "Liste des items" })).toBeVisible();
  });

  it("gives each group its own card, counts, points and select-all, sorted once (JIR-97)", async () => {
    const user = userEvent.setup();
    renderList({
      ...listProps(),
      grouped: true,
      groups: [
        groups[0]!,
        {
          key: "billing",
          label: "Facturation",
          items: [
            item("item-2", "DEMO-2", "Invoices", { estimatePoints: 2 }),
            item("item-3", "DEMO-3", "Refunds"),
          ],
        },
      ],
    });

    const platform = screen.getByRole("region", { name: "Plateforme" });
    const billing = screen.getByRole("region", { name: "Facturation" });
    expect(within(platform).getByText("1 item · 1 non estimé")).toBeVisible();
    expect(within(billing).getByText("2 items · 1 non estimé")).toBeVisible();
    expect(within(billing).getByText("Points par statut : À faire 2, En cours 0, Terminé 0"))
      .toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Trier la liste" })).toHaveLength(1);
    expect(within(platform).getByRole("group", { name: "Trier la liste" })).toBeVisible();
    // A grouped card is no place for a new item.
    expect(screen.queryByRole("button", { name: /Créer un item/ })).not.toBeInTheDocument();

    await user.click(
      within(billing).getByRole("checkbox", { name: "Sélectionner tous les items de Facturation" }),
    );
    expect(screen.getByText("2 items sélectionnés")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Sélectionner DEMO-1" })).not.toBeChecked();
    await user.click(within(billing).getByRole("button", { name: "Replier Facturation" }));
    expect(within(billing).queryByRole("list")).not.toBeInTheDocument();
    expect(within(platform).getByRole("list", { name: "Plateforme" })).toBeVisible();
  });

  it("creates a task under the only Epic from the bottom of the card (JIR-97)", async () => {
    const user = userEvent.setup();
    mocks.createItemAction.mockResolvedValue({
      ok: true,
      item: { id: "new-id", key: "DEMO-10", type: "tache", kind: "feature", title: "Relance", statusId: todoStatusId, priority: 2, assigneeId: null, parentId: "epic-1", labelIds: [], fixVersionIds: [] },
    });
    renderList({
      ...listProps(),
      createDialogProps: {
        backlogId: "backlog-id",
        structure: [{ id: "epic-1", key: "DEMO-5", type: "epic", title: "Paiements" }],
        statuses: [{ id: todoStatusId, name: "À faire" }],
      },
    });

    const card = screen.getByRole("region", { name: "Tous les items" });
    await user.click(within(card).getByRole("button", { name: "Créer un item dans Tous les items" }));
    expect(within(card).getByRole("combobox", { name: "Epic parent" })).toHaveTextContent("DEMO-5 — Paiements");
    await user.type(
      within(card).getByRole("textbox", { name: "Titre du nouvel item dans Tous les items" }),
      "Relance{Enter}",
    );

    await waitFor(() => expect(mocks.createItemAction).toHaveBeenCalledTimes(1));
    expect(mocks.createItemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        backlogKey: "DEMO",
        backlogId: "backlog-id",
        type: "tache",
        parentId: "epic-1",
        title: "Relance",
        sprintId: null,
      }),
    );
  });

  it.each([
    ["a viewer", { canCreateItems: false }],
    ["a creator without the scheduling right", { canScheduleItems: false }],
  ])("does not offer inline creation to %s", (_name, rights) => {
    renderList({
      ...listProps(),
      ...rights,
      createDialogProps: {
        backlogId: "backlog-id",
        structure: [{ id: "epic-1", key: "DEMO-5", type: "epic", title: "Paiements" }],
        statuses: [{ id: todoStatusId, name: "À faire" }],
      },
    });
    expect(screen.queryByRole("button", { name: /Créer un item/ })).not.toBeInTheDocument();
  });

  it("points to clearing the filters while the Epic step is missing under filters", () => {
    renderList({
      ...listProps(),
      filtersActive: true,
      clearFiltersHref: "/b/DEMO?view=list",
      startStep: "epic",
      createDialogProps: {
        backlogId: "backlog-id",
        structure: [{ id: "comp-1", key: "DEMO-9", type: "composant", title: "Portail" }],
        statuses: [{ id: todoStatusId, name: "À faire" }],
      },
    });
    const card = screen.getByRole("region", { name: "Tous les items" });
    expect(within(card).getByText(/il faut d’abord une Epic : effacez les filtres/)).toBeVisible();
    expect(within(card).getByRole("link", { name: "Effacer les filtres" }))
      .toHaveAttribute("href", "/b/DEMO?view=list");
  });
});

it("passes denied directory access to a list row's assignee menu", async () => {
  const user = userEvent.setup();
  renderList({ ...listProps(), users: [], canBrowseUsers: false });
  await user.click(screen.getAllByRole("button", { name: /^Assigné :/ })[0]!);
  expect(screen.getByText(/Il vous manque la permission globale/)).toBeVisible();
});
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemList } from "@/components/items/item-list";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";

const mocks = vi.hoisted(() => ({
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
  updateItemAction: mocks.updateItemAction,
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
    backlogKey: "DEMO",
    selectedKey: undefined,
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
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.replace.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it("offers item creation when the list has no rows", async () => {
    const user = userEvent.setup();
    renderList({
      ...listProps(),
      groups: [{ key: "", label: "", items: [] }],
      filtersActive: false,
      clearFiltersHref: "/b/DEMO?view=list",
      createDialogProps: {
        backlogId: "backlog-id",
        items: [],
        statuses: [{ id: todoStatusId, name: "À faire" }],
      },
    });

    expect(screen.getByRole("heading", { name: "Aucun item" })).toBeInTheDocument();
    expect(
      screen.getByText("Créez votre premier item pour commencer à organiser ce backlog."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
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
      createDialogProps: {
        backlogId: "backlog-id",
        items: [],
        statuses: [{ id: todoStatusId, name: "À faire" }],
      },
    });

    expect(screen.getByRole("heading", { name: "Aucun item" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Effacer les filtres" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders the dense list as a semantic table with sticky column headers", () => {
    renderList();

    expect(screen.getByRole("table")).toBeInTheDocument();
    for (const heading of ["Clé", "Titre", "Statut", "Prio", "Points", "Labels", "Échéance", "Assigné"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByRole("columnheader", { name: "Clé" }).closest("thead")).toHaveClass("sticky");
    expect(screen.getAllByRole("img", { name: "À faire" })[0]).toBeVisible();
  });

  it("toggles title sorting while preserving unrelated URL parameters", async () => {
    const user = userEvent.setup();
    const props = listProps();
    const { rerender } = renderList(props);

    await user.click(screen.getByRole("button", { name: "Titre" }));
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
    await user.click(screen.getByRole("button", { name: "Titre" }));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=list&item=DEMO-9&v=saved-view&q=auth&sort=title%3Adesc",
      { scroll: false },
    );
  });

  it("opens a row from non-interactive content but isolates inline editor clicks", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByText("Authentication"));
    expect(mocks.push).toHaveBeenCalledWith(
      "/b/DEMO?view=list&item=DEMO-1&v=saved-view&q=auth",
    );

    mocks.push.mockClear();
    const row = screen.getByRole("row", { name: "DEMO-1 — Authentication" });
    await user.click(within(row).getByRole("button", { name: /Priorité.*Moyenne/i }));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("edits a task estimate without opening the row", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true, item: {} });
    renderList();

    const row = screen.getByRole("row", { name: "DEMO-1 — Authentication" });
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
    renderList({ ...listProps(), canWrite: false });

    const row = screen.getByRole("row", { name: "DEMO-1 — Authentication" });
    expect(within(row).queryByRole("button", { name: /Statut/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Priorité/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Assigné/i })).not.toBeInTheDocument();
    expect(within(row).getByText("À faire")).toBeVisible();
    expect(within(row).getByText("Marie Lemaire")).toBeVisible();

    await user.click(within(row).getByText("Authentication"));
    expect(mocks.push).toHaveBeenCalledWith(
      "/b/DEMO?view=list&item=DEMO-1&v=saved-view&q=auth",
    );
  });

  it("does not offer creation to a viewer in an empty backlog", () => {
    renderList({
      ...listProps(),
      groups: [{ key: "", label: "", items: [] }],
      createDialogProps: {
        backlogId: "backlog-id",
        items: [],
        statuses: [{ id: todoStatusId, name: "À faire" }],
      },
      canWrite: false,
    });

    expect(screen.getByRole("heading", { name: "Aucun item" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Nouvel item" })).not.toBeInTheDocument();
  });

  it("collapses and restores a group only in the current component session", async () => {
    const user = userEvent.setup();
    renderList({ ...listProps(), grouped: true, groups });

    const toggle = screen.getByRole("button", { name: /Plateforme.*1/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Authentication")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();

    await user.click(toggle);
    await waitFor(() => expect(screen.getByText("Authentication")).toBeInTheDocument());
  });
});

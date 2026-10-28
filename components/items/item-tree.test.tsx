import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentHref } from "@/test/history";
import { ItemTree } from "@/components/items/item-tree";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/DEMO",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@/app/actions/items", () => ({
  createItemAction: vi.fn(),
  softDeleteItemAction: vi.fn(),
}));

vi.mock("@/app/actions/item-choices", () => ({
  searchBacklogItemsAction: vi.fn(async () => ({ ok: true as const, items: [], limit: 20 })),
}));

const reviewStatusId = "33333333-3333-4333-8333-333333333333";

const statuses: Array<{
  id: string;
  name: string;
  color: string;
  category: "todo" | "in_progress" | "done";
  order: number;
}> = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "À faire",
    color: "#9aa0a6",
    category: "todo",
    order: 0,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "En cours",
    color: "#d99a2b",
    category: "in_progress",
    order: 1,
  },
  {
    id: reviewStatusId,
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

const item = {
  id: "task-1",
  key: "DEMO-1",
  type: "tache" as const,
  title: "Authentication",
  parentId: null,
  statusId: reviewStatusId,
  priority: 4,
  depth: 0,
  rank: "a",
  path: "task1",
  labels: [
    { id: "frontend", name: "Frontend", color: "--label-2" },
    { id: "security", name: "Sécurité", color: "--label-5" },
  ],
  assigneeId: "user-marie",
  assigneeName: "Marie Lemaire",
};

describe("ItemTree", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.replace.mockReset();
  });

  it("guides an empty backlog to its first Composant (JIR-88)", async () => {
    const user = userEvent.setup();
    render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          filtersActive={false}
          clearFiltersHref="/b/DEMO?view=tree"
          startStep="composant"
          createDialogProps={{
            backlogId: "backlog-id",
            structure: [],
            statuses: [{ id: statuses[0]!.id, name: statuses[0]!.name }],
          }}
        />
      </ViewUrlStateProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Commencez par créer un Composant (un domaine ou un produit)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Aucun item" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nouveau Composant" }));
    const dialog = screen.getByRole("dialog", { name: /Nouvel item/ });
    expect(within(dialog).getByRole("combobox", { name: "Type" })).toHaveTextContent("Composant");
  });

  it("asks for an Epic above the tree while only Composants exist (JIR-88)", async () => {
    const user = userEvent.setup();
    const composant = {
      ...item,
      id: "comp-1",
      key: "DEMO-1",
      type: "composant" as const,
      title: "Portail",
      labels: [],
    };
    const dialogItems = [{ id: "comp-1", key: "DEMO-1", type: "composant" as const, title: "Portail" }];
    const { rerender } = render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[composant]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          startStep="epic"
          createDialogProps={{
            backlogId: "backlog-id",
            structure: dialogItems,
            statuses: [{ id: statuses[0]!.id, name: statuses[0]!.name }],
          }}
        />
      </ViewUrlStateProvider>,
    );

    const note = screen.getByRole("note", { name: "Créez une Epic dans un Composant" });
    expect(screen.getByRole("button", { name: "DEMO-1 — Portail" })).toBeVisible();
    await user.click(within(note).getByRole("button", { name: "Nouvelle Epic" }));
    const dialog = screen.getByRole("dialog", { name: /Nouvel item/ });
    expect(within(dialog).getByRole("combobox", { name: "Type" })).toHaveTextContent("Epic");
    expect(within(dialog).getByRole("combobox", { name: /Parent/ })).toHaveValue(
      "DEMO-1 — Portail",
    );
    await user.keyboard("{Escape}");

    // Filtered rows are not the whole backlog: no guidance then.
    rerender(
      <ViewUrlStateProvider initialEntries={[["view", "tree"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[composant]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          filtersActive
          startStep="epic"
          createDialogProps={{
            backlogId: "backlog-id",
            structure: dialogItems,
            statuses: [{ id: statuses[0]!.id, name: statuses[0]!.name }],
          }}
        />
      </ViewUrlStateProvider>,
    );
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("offers a shareable filter reset when the tree has no matches", () => {
    render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"], ["q", "missing"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          filtersActive
          hasItems
          clearFiltersHref="/b/DEMO?view=tree"
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.getByRole("heading", { name: "Aucun résultat" })).toBeInTheDocument();
    expect(screen.getByText("Aucun item ne correspond aux filtres actifs.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Effacer les filtres" })).toHaveAttribute(
      "href",
      "/b/DEMO?view=tree",
    );
  });

  it("keeps creation available when active filters belong to an empty backlog", async () => {
    const user = userEvent.setup();
    render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"], ["q", "missing"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          filtersActive
          hasItems={false}
          clearFiltersHref="/b/DEMO?view=tree"
          startStep="composant"
          createDialogProps={{
            backlogId: "backlog-id",
            structure: [],
            statuses: [{ id: statuses[0]!.id, name: statuses[0]!.name }],
          }}
        />
      </ViewUrlStateProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Commencez par créer un Composant (un domaine ou un produit)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Effacer les filtres" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nouveau Composant" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders complete row metadata without changing row opening or drag protocol", async () => {
    const user = userEvent.setup();
    render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"], ["q", "auth"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[item]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.getByRole("img", { name: "Urgent" })).toBeVisible();
    expect(screen.getByRole("img", { name: "En revue" })).toBeVisible();
    const avatar = screen.getByRole("img", { name: "Marie Lemaire" });
    expect(avatar).toBeVisible();
    expect(avatar).toHaveStyle({ background: "var(--label-5)" });
    expect(screen.getByText("Frontend")).toBeVisible();
    expect(screen.getByText("Sécurité")).toBeVisible();

    const row = screen.getByRole("button", { name: "DEMO-1 — Authentication" });
    expect(row).toHaveAttribute("draggable", "true");
    expect(row.querySelector("[draggable]")).toBeNull();

    await user.click(screen.getByText("Frontend"));
    expect(currentHref()).toBe("/b/DEMO?view=tree&q=auth&item=DEMO-1");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(row).toHaveAttribute("draggable", "true");

    const dataTransfer = {
      effectAllowed: "none",
      setData: vi.fn(),
    };
    fireEvent.dragStart(row, { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe("move");
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "task-1");
  });

  it("keeps a reorder between siblings at the rank the server answers with, without a page render (JIR-119)", async () => {
    const second = { ...item, id: "task-2", key: "DEMO-2", title: "Billing", rank: "b", path: "task2" };
    const moveItemAction = vi.fn().mockResolvedValue({ ok: true, item: { ...item, rank: "c" } });
    render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[item, second]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={moveItemAction}
        />
      </ViewUrlStateProvider>,
    );
    const order = () =>
      screen
        .getAllByRole("button", { name: /^DEMO-\d — / })
        .map((row) => row.getAttribute("aria-label")?.split(" — ")[0]);
    expect(order()).toEqual(["DEMO-1", "DEMO-2"]);

    const dataTransfer = { effectAllowed: "none", dropEffect: "none", setData: vi.fn() };
    fireEvent.dragStart(screen.getByRole("button", { name: "DEMO-1 — Authentication" }), { dataTransfer });
    const target = screen.getByRole("button", { name: "DEMO-2 — Billing" });
    // Below the row's middle (jsdom rows have no height): the "after" zone.
    const over = createEvent.dragOver(target, { dataTransfer });
    Object.defineProperty(over, "clientY", { value: 10 });
    fireEvent(target, over);
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() =>
      expect(moveItemAction).toHaveBeenCalledWith({
        backlogKey: "DEMO",
        id: "task-1",
        beforeId: "task-2",
        afterId: null,
      }),
    );
    // The row takes the rank the server answered with; the props never changed.
    await waitFor(() => expect(order()).toEqual(["DEMO-2", "DEMO-1"]));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("keeps viewer rows navigable without making them draggable", async () => {
    const user = userEvent.setup();
    render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[item]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          canCreateItems={false}
          canScheduleItems={false}
        />
      </ViewUrlStateProvider>,
    );

    const row = screen.getByRole("button", { name: "DEMO-1 — Authentication" });
    expect(row).toHaveAttribute("draggable", "false");
    await user.click(screen.getByText("Authentication"));
    expect(currentHref()).toBe("/b/DEMO?view=tree&item=DEMO-1");
  });

  it("separates hierarchy scheduling from item creation", () => {
    const createOnly = render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[item]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          canScheduleItems={false}
          canCreateItems
        />
      </ViewUrlStateProvider>,
    );
    expect(
      screen.getByRole("button", { name: "DEMO-1 — Authentication" }),
    ).toHaveAttribute("draggable", "false");
    createOnly.unmount();

    const scheduled = render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[item]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          canScheduleItems={false}
          canCreateItems={false}
          planningCapabilities={{ rank: true, reparent: true, assignSprint: true, manageSprints: false }}
        />
      </ViewUrlStateProvider>,
    );
    expect(
      screen.getByRole("button", { name: "DEMO-1 — Authentication" }),
    ).toHaveAttribute("draggable", "true");
    scheduled.unmount();

    render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          startStep="composant"
          createDialogProps={{
            backlogId: "backlog-id",
            structure: [],
            statuses: [{ id: statuses[0]!.id, name: statuses[0]!.name }],
          }}
          canScheduleItems={false}
          canCreateItems
        />
      </ViewUrlStateProvider>,
    );
    // A Composant has no parent: the create right alone is enough.
    expect(screen.getByRole("button", { name: "Nouveau Composant" })).toBeVisible();
  });

  it("does not offer creation to a viewer in an empty backlog", () => {
    render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          startStep="composant"
          createDialogProps={{
            backlogId: "backlog-id",
            structure: [],
            statuses: [{ id: statuses[0]!.id, name: statuses[0]!.name }],
          }}
          canCreateItems={false}
          canScheduleItems={false}
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.getByRole("heading", { name: "Ce backlog est vide" })).toBeVisible();
    expect(screen.getByText("Aucun Composant n’y a encore été créé.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Nouveau Composant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nouvel item" })).not.toBeInTheDocument();
  });
});

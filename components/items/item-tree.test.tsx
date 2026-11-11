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

vi.mock("@/app/actions/tree-window", () => ({
  loadTreeChildrenAction: vi.fn(async () => ({ ok: false, error: "Impossible de charger la suite. Réessayez avec « Charger la suite »." })),
  loadTreeMatchesAction: vi.fn(async () => ({ ok: false, error: "Impossible de charger la suite. Réessayez avec « Charger la suite »." })),
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

describe("ItemTree by windows (JIR-147)", () => {
  type Row = Parameters<typeof ItemTree>[0]["items"][number];
  const todo = statuses[0]!.id;
  function row(id: string, type: Row["type"], parentId: string | null, depth: number, rank: string, childCount?: number): Row {
    return {
      id,
      key: `DEMO-${id.toUpperCase()}`,
      type,
      title: id.toUpperCase(),
      parentId,
      statusId: todo,
      priority: 2,
      depth,
      rank,
      path: parentId ? `root.${parentId}.${id}` : `root.${id}`,
      labels: [],
      assigneeId: null,
      assigneeName: null,
      ...(childCount === undefined ? {} : { childCount }),
    };
  }
  const c1 = row("c1", "composant", null, 0, "a0", 2);
  const e1 = row("e1", "epic", "c1", 1, "a1", 3);
  const e2 = row("e2", "epic", "c1", 1, "a2", 0);
  const t1 = row("t1", "tache", "e1", 2, "b1", 0);
  const t2 = row("t2", "tache", "e1", 2, "b2", 0);
  const t3 = row("t3", "tache", "e1", 2, "b3", 0);
  const children = (parentId: string, rows: Row[], nextCursor: string | null, total: number) => ({
    ok: true as const,
    windows: [{ parentId, total, rows, nextCursor }],
  });
  const names = () =>
    screen.getAllByRole("button", { name: /^DEMO-/ }).map((element) => element.getAttribute("aria-label")?.split(" — ")[1]);
  const rowNamed = (title: string) => screen.getByRole("button", { name: `DEMO-${title} — ${title}` });

  function renderTree(props: Partial<Parameters<typeof ItemTree>[0]> = {}) {
    const loadChildren = vi.fn();
    const reparentItemAction = vi.fn().mockResolvedValue({ ok: true, item: { ...t1 } });
    const view = render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[c1, e1, e2]}
          statuses={statuses}
          reparentItemAction={reparentItemAction}
          moveItemAction={vi.fn()}
          loadChildren={loadChildren}
          {...props}
        />
      </ViewUrlStateProvider>,
    );
    return { ...view, loadChildren, reparentItemAction };
  }

  async function dropOn(dragged: HTMLElement, target: HTMLElement, clientY: number) {
    const dataTransfer = { effectAllowed: "none", dropEffect: "none", setData: vi.fn() };
    fireEvent.dragStart(dragged, { dataTransfer });
    const over = createEvent.dragOver(target, { dataTransfer });
    // jsdom rows have no height: 0 is the "into" zone, anything below "after".
    Object.defineProperty(over, "clientY", { value: clientY });
    fireEvent(target, over);
    fireEvent.drop(target, { dataTransfer });
  }

  it("loads an Epic's children when it is unfolded, by windows of 100 ending with « Charger la suite »", async () => {
    const user = userEvent.setup();
    const { loadChildren } = renderTree();
    loadChildren
      .mockResolvedValueOnce(children("e1", [t1, t2], "b2", 3))
      .mockResolvedValueOnce(children("e1", [t3], null, 3));

    // Composants show their Epics; an Epic's tasks wait for it to be unfolded.
    expect(names()).toEqual(["C1", "E1", "E2"]);
    expect(within(rowNamed("E2")).getByRole("button", { hidden: true })).not.toBeVisible();
    await user.click(within(rowNamed("E1")).getByRole("button", { name: "Déplier" }));
    expect(loadChildren).toHaveBeenCalledWith({
      backlogKey: "DEMO",
      parents: [{ parentId: "e1", cursor: null, limit: 100 }],
    });
    await waitFor(() => expect(names()).toEqual(["C1", "E1", "T1", "T2", "E2"]));
    expect(within(rowNamed("E1")).getByRole("button", { name: "Replier" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Charger la suite de E1" }));
    expect(loadChildren).toHaveBeenLastCalledWith({
      backlogKey: "DEMO",
      parents: [{ parentId: "e1", cursor: "b2", limit: 100 }],
    });
    await waitFor(() => expect(names()).toEqual(["C1", "E1", "T1", "T2", "T3", "E2"]));
    expect(screen.queryByRole("button", { name: /Charger la suite/ })).not.toBeInTheDocument();

    // Folded then unfolded again: the children are already there.
    await user.click(within(rowNamed("E1")).getByRole("button", { name: "Replier" }));
    expect(names()).toEqual(["C1", "E1", "E2"]);
    await user.click(within(rowNamed("E1")).getByRole("button", { name: "Déplier" }));
    expect(names()).toEqual(["C1", "E1", "T1", "T2", "T3", "E2"]);
    expect(loadChildren).toHaveBeenCalledTimes(2);
  });

  it("says when a parent's children cannot be loaded, and lets the user try again", async () => {
    const user = userEvent.setup();
    const { loadChildren } = renderTree();
    loadChildren.mockResolvedValueOnce({ ok: false, error: "Impossible de charger la suite. Réessayez avec « Charger la suite »." });
    await user.click(within(rowNamed("E1")).getByRole("button", { name: "Déplier" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de charger la suite");
    expect(names()).toEqual(["C1", "E1", "E2"]);
    loadChildren.mockResolvedValueOnce(children("e1", [t1], null, 1));
    await user.click(within(rowNamed("E1")).getByRole("button", { name: "Déplier" }));
    await waitFor(() => expect(names()).toEqual(["C1", "E1", "T1", "E2"]));
  });

  it("drops into an Epic not unfolded without neighbors, so the server puts it first", async () => {
    const user = userEvent.setup();
    const closed = { ...e2, childCount: 4 };
    const { loadChildren, reparentItemAction } = renderTree({ items: [c1, e1, closed] });
    loadChildren.mockResolvedValueOnce(children("e1", [t1, t2], "b2", 3));
    await user.click(within(rowNamed("E1")).getByRole("button", { name: "Déplier" }));
    await waitFor(() => expect(names()).toContain("T1"));

    await dropOn(rowNamed("T1"), rowNamed("E2"), 0);
    await waitFor(() =>
      expect(reparentItemAction).toHaveBeenCalledWith({
        backlogKey: "DEMO",
        id: "t1",
        newParentId: "e2",
        beforeId: null,
        afterId: null,
      }),
    );
    // Its new parent is still folded: the task leaves the rows shown.
    await waitFor(() => expect(names()).toEqual(["C1", "E1", "T2", "E2"]));
  });

  it("drops into an unfolded Epic right after its last loaded child, even with more to load", async () => {
    const user = userEvent.setup();
    const other = row("e3", "epic", "c1", 1, "a3", 1);
    const t9 = row("t9", "tache", "e3", 2, "c9", 0);
    const { loadChildren, reparentItemAction } = renderTree({ items: [c1, e1, e2, other] });
    loadChildren
      .mockResolvedValueOnce(children("e1", [t1, t2], "b2", 3))
      .mockResolvedValueOnce(children("e3", [t9], null, 1));
    await user.click(within(rowNamed("E1")).getByRole("button", { name: "Déplier" }));
    await waitFor(() => expect(names()).toContain("T2"));
    await user.click(within(rowNamed("E3")).getByRole("button", { name: "Déplier" }));
    await waitFor(() => expect(names()).toContain("T9"));

    await dropOn(rowNamed("T9"), rowNamed("E1"), 0);
    await waitFor(() =>
      expect(reparentItemAction).toHaveBeenCalledWith({
        backlogKey: "DEMO",
        id: "t9",
        newParentId: "e1",
        beforeId: "t2",
        afterId: null,
      }),
    );
  });

  it("reads the unfolded parents again in one call after a refresh, keeping their rows meanwhile", async () => {
    const user = userEvent.setup();
    const { loadChildren, rerender } = renderTree();
    loadChildren.mockResolvedValueOnce(children("e1", [t1, t2], "b2", 3));
    await user.click(within(rowNamed("E1")).getByRole("button", { name: "Déplier" }));
    await waitFor(() => expect(names()).toEqual(["C1", "E1", "T1", "T2", "E2"]));

    let answer: (value: unknown) => void = () => undefined;
    loadChildren.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    rerender(
      <ViewUrlStateProvider initialEntries={[["view", "tree"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[c1, { ...e1, childCount: 4 }, e2]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          loadChildren={loadChildren}
        />
      </ViewUrlStateProvider>,
    );
    await waitFor(() =>
      expect(loadChildren).toHaveBeenLastCalledWith({
        backlogKey: "DEMO",
        parents: [{ parentId: "e1", cursor: null, limit: 2 }],
      }),
    );
    expect(names()).toEqual(["C1", "E1", "T1", "T2", "E2"]);
    const t0 = row("t0", "tache", "e1", 2, "b0", 0);
    answer(children("e1", [t0, t1], "b1", 4));
    await waitFor(() => expect(names()).toEqual(["C1", "E1", "T0", "T1", "E2"]));
    expect(screen.getByRole("button", { name: "Charger la suite de E1" })).toBeVisible();
  });

  it("shows filtered matches with their dimmed ancestors and loads the next matches without a row twice", async () => {
    const user = userEvent.setup();
    const loadMatches = vi.fn().mockResolvedValueOnce({
      ok: true,
      window: {
        total: 2,
        rows: [
          { ...row("c1", "composant", null, 0, "a0"), matched: false },
          { ...row("e1", "epic", "c1", 1, "a1"), matched: false },
          { ...row("t3", "tache", "e1", 2, "b3"), matched: true },
        ],
        nextCursor: null,
      },
    });
    render(
      <ViewUrlStateProvider initialEntries={[["view", "tree"], ["q", "t"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={[row("c1", "composant", null, 0, "a0"), row("e1", "epic", "c1", 1, "a1"), row("t1", "tache", "e1", 2, "b1")]}
          contextIds={["c1", "e1"]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          filtersActive
          window={{ total: 2, nextCursor: { depth: 2, rank: "b1" } }}
          viewStateQuery="q=t"
          loadMatches={loadMatches}
        />
      </ViewUrlStateProvider>,
    );
    expect(names()).toEqual(["C1", "E1", "T1"]);
    expect(rowNamed("C1")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("1 affichés sur 2")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Charger la suite" }));
    expect(loadMatches).toHaveBeenCalledWith({
      backlogKey: "DEMO",
      viewState: "q=t",
      cursor: { depth: 2, rank: "b1" },
      limit: 100,
    });
    await waitFor(() => expect(names()).toEqual(["C1", "E1", "T1", "T3"]));
    expect(screen.getByText("2 affichés sur 2")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Charger la suite" })).not.toBeInTheDocument();
    // Filtered rows only show what was served: nothing to unfold on demand.
    expect(within(rowNamed("T3")).getByRole("button", { hidden: true })).not.toBeVisible();
  });

  it("reads the matches shown after the first window again after a refresh, keeping their ancestors dimmed", async () => {
    const user = userEvent.setup();
    const ancestors = [
      { ...row("c1", "composant", null, 0, "a0"), matched: false },
      { ...row("e1", "epic", "c1", 1, "a1"), matched: false },
      { ...row("e9", "epic", "c1", 1, "a9"), matched: false },
    ];
    const loadMatches = vi.fn().mockResolvedValueOnce({
      ok: true,
      window: { total: 2, rows: [...ancestors, { ...row("t3", "tache", "e9", 2, "b3"), matched: true }], nextCursor: null },
    });
    const tree = (first: Row[]) => (
      <ViewUrlStateProvider initialEntries={[["view", "tree"], ["q", "t"]]}>
        <ItemTree
          backlogKey="DEMO"
          items={first}
          contextIds={["c1", "e1"]}
          statuses={statuses}
          reparentItemAction={vi.fn()}
          moveItemAction={vi.fn()}
          filtersActive
          window={{ total: 2, nextCursor: { depth: 2, rank: "b1" } }}
          viewStateQuery="q=t"
          loadMatches={loadMatches}
        />
      </ViewUrlStateProvider>
    );
    const first = [row("c1", "composant", null, 0, "a0"), row("e1", "epic", "c1", 1, "a1"), row("t1", "tache", "e1", 2, "b1")];
    const { rerender } = render(tree(first));
    await user.click(screen.getByRole("button", { name: "Charger la suite" }));
    await waitFor(() => expect(names()).toEqual(["C1", "E1", "T1", "E9", "T3"]));

    let answer: (value: unknown) => void = () => undefined;
    loadMatches.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    rerender(tree([...first]));
    await waitFor(() =>
      expect(loadMatches).toHaveBeenLastCalledWith({
        backlogKey: "DEMO",
        viewState: "q=t",
        cursor: { depth: 2, rank: "b1" },
        limit: 1,
      }),
    );
    expect(names()).toEqual(["C1", "E1", "T1", "E9", "T3"]);
    expect(rowNamed("E9")).toHaveAttribute("aria-disabled", "true");
    answer({
      ok: true,
      window: { total: 2, rows: [...ancestors, { ...row("t3", "tache", "e9", 2, "b3"), title: "T3 BIS", matched: true }], nextCursor: null },
    });
    await waitFor(() => expect(names()).toEqual(["C1", "E1", "T1", "E9", "T3 BIS"]));
    expect(rowNamed("E9")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("2 affichés sur 2")).toBeVisible();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("offers item creation when the tree has no rows", async () => {
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
          createDialogProps={{
            backlogId: "backlog-id",
            items: [],
            statuses: [{ id: statuses[0]!.id, name: statuses[0]!.name }],
          }}
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.getByRole("heading", { name: "Aucun item" })).toBeInTheDocument();
    expect(
      screen.getByText("Créez votre premier item pour commencer à organiser ce backlog."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
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
          createDialogProps={{
            backlogId: "backlog-id",
            items: [],
            statuses: [{ id: statuses[0]!.id, name: statuses[0]!.name }],
          }}
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.getByRole("heading", { name: "Aucun item" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Effacer les filtres" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
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
    expect(mocks.push).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?view=tree&q=auth&item=DEMO-1");
    expect(row).toHaveAttribute("draggable", "true");

    const dataTransfer = {
      effectAllowed: "none",
      setData: vi.fn(),
    };
    fireEvent.dragStart(row, { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe("move");
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "task-1");
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
    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?view=tree&item=DEMO-1");
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
          createDialogProps={{
            backlogId: "backlog-id",
            items: [],
            statuses: [{ id: statuses[0]!.id, name: statuses[0]!.name }],
          }}
          canScheduleItems={false}
          canCreateItems
        />
      </ViewUrlStateProvider>,
    );
    expect(screen.getByRole("button", { name: "Nouvel item" })).toBeVisible();
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
          createDialogProps={{
            backlogId: "backlog-id",
            items: [],
            statuses: [{ id: statuses[0]!.id, name: statuses[0]!.name }],
          }}
          canCreateItems={false}
          canScheduleItems={false}
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.getByRole("heading", { name: "Aucun item" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Nouvel item" })).not.toBeInTheDocument();
  });
});

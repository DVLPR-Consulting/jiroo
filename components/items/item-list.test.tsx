import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemList } from "@/components/items/item-list";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  updateItemAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/app/actions/items", () => ({
  updateItemAction: mocks.updateItemAction,
}));

const statuses = [
  { id: "todo", name: "À faire", color: "--status-todo", category: "todo" },
  { id: "doing", name: "En cours", color: "--status-doing", category: "doing" },
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
    statusId: "todo",
    priority: 2,
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

function listProps() {
  return {
    groups,
    grouped: false,
    statuses,
    users,
    backlogKey: "DEMO",
    selectedKey: undefined,
    currentSort: null,
    currentParams: {
      view: "list",
      item: "DEMO-9",
      v: "saved-view",
      q: "auth",
    },
  };
}

describe("ItemList", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.replace.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it("renders the dense list as a semantic table with sticky column headers", () => {
    render(<ItemList {...listProps()} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    for (const heading of ["Clé", "Titre", "Statut", "Prio", "Labels", "Échéance", "Assigné"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByRole("columnheader", { name: "Clé" }).closest("thead")).toHaveClass("sticky");
  });

  it("toggles title sorting while preserving unrelated URL parameters", async () => {
    const user = userEvent.setup();
    const props = listProps();
    const { rerender } = render(<ItemList {...props} />);

    await user.click(screen.getByRole("button", { name: "Titre" }));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=list&item=DEMO-9&v=saved-view&q=auth&sort=title%3Aasc",
      { scroll: false },
    );

    rerender(
      <ItemList
        {...props}
        currentSort={{ field: "title", dir: "asc" }}
        currentParams={{ ...props.currentParams, sort: "title:asc" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Titre" }));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=list&item=DEMO-9&v=saved-view&q=auth&sort=title%3Adesc",
      { scroll: false },
    );
  });

  it("opens a row from non-interactive content but isolates inline editor clicks", async () => {
    const user = userEvent.setup();
    render(<ItemList {...listProps()} />);

    await user.click(screen.getByText("Authentication"));
    expect(mocks.push).toHaveBeenCalledWith(
      "/b/DEMO?view=list&item=DEMO-1&v=saved-view&q=auth",
    );

    mocks.push.mockClear();
    const row = screen.getByRole("row", { name: "DEMO-1 — Authentication" });
    await user.click(within(row).getByRole("button", { name: /Priorité.*Moyenne/i }));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("collapses and restores a group only in the current component session", async () => {
    const user = userEvent.setup();
    render(<ItemList {...listProps()} grouped groups={groups} />);

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

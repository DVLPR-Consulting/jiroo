import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/shell/filter-bar";
import { ItemList } from "@/components/items/item-list";
import { GroupControl } from "@/components/shell/group-control";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";
import type { ViewState } from "@/lib/items/filter";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/DEMO",
  useRouter: () => ({ replace: mocks.replace }),
}));

const emptyState: ViewState = {
  filters: {
    q: "",
    types: [],
    statusIds: [],
    priorities: [],
    assignees: [],
    labels: [],
    kind: [],
    underIds: [],
  },
  group: null,
  sort: null,
};

function renderBar(state: ViewState = emptyState) {
  const currentParams = {
    view: "board",
    item: "DEMO-1",
    ...(state.filters.types.length > 0 ? { type: state.filters.types.join(",") } : {}),
  };
  return render(
    <ViewUrlStateProvider currentParams={currentParams}>
      <FilterBar
        state={state}
        currentParams={currentParams}
        statuses={[{ id: "ready", name: "Prêt" }]}
        users={[{ id: "marie", name: "Marie Lemaire" }]}
        labels={[{ id: "urgent", name: "Urgent", color: "#c00" }]}
        hierarchy={[
          { id: "component-1", key: "DEMO-1", title: "Plateforme", type: "composant" },
          { id: "epic-1", key: "DEMO-2", title: "Refonte", type: "epic" },
          { id: "task-1", key: "DEMO-3", title: "Invisible", type: "tache" },
        ]}
        resultCount={4}
      />
    </ViewUrlStateProvider>,
  );
}

describe("FilterBar", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("renders each inactive facet as a plus-prefixed chip", () => {
    const { container } = renderBar();

    for (const label of ["Type", "Statut", "Priorité", "Label", "Assigné", "Nature", "Sous"]) {
      expect(screen.getByRole("button", { name: `+ ${label}` })).toHaveAttribute("data-active", "false");
    }
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button[data-active]")].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["+ Type", "+ Statut", "+ Priorité", "+ Label", "+ Assigné", "+ Nature", "+ Sous"]);
    expect(screen.queryByRole("combobox", { name: "Grouper par" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Trier par" })).not.toBeInTheDocument();
  });

  it("allows the filter controls to wrap instead of overflowing narrow content", () => {
    const { container } = renderBar();

    expect(container.firstElementChild).toHaveClass("flex-wrap");
  });

  it("shows the selected facet value and clears only that facet", async () => {
    const user = userEvent.setup();
    renderBar({
      ...emptyState,
      filters: { ...emptyState.filters, types: ["tache"] },
    });

    const typeChip = screen.getByRole("button", { name: /Type.*Tâche.*1/i });
    expect(typeChip).toHaveAttribute("data-active", "true");

    await user.click(screen.getByRole("button", { name: "Effacer le filtre Type" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/b/DEMO?view=board&item=DEMO-1", { scroll: false }),
    );
  });

  it("writes selected component and epic facets to the under URL parameter", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "+ Sous" }));
    await user.click(screen.getByLabelText("DEMO-2 — Refonte"));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/b/DEMO?view=board&item=DEMO-1&under=epic-1",
        { scroll: false },
      ),
    );
    expect(screen.queryByLabelText("DEMO-3 — Invisible")).not.toBeInTheDocument();
  });

  it("keeps a cleared Type facet cleared when the query debounce finishes", async () => {
    vi.useFakeTimers();
    renderBar({
      ...emptyState,
      filters: { ...emptyState.filters, types: ["tache"] },
    });

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "auth" } });
    fireEvent.click(screen.getByRole("button", { name: "Effacer le filtre Type" }));
    await act(async () => vi.advanceTimersByTime(300));

    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&item=DEMO-1&q=auth",
      { scroll: false },
    );
  });

  it("keeps a new grouping when the query debounce finishes", async () => {
    vi.useFakeTimers();
    const currentParams = { view: "board", item: "DEMO-1" };

    render(
      <ViewUrlStateProvider currentParams={currentParams}>
        <FilterBar
          state={emptyState}
          currentParams={currentParams}
          statuses={[{ id: "ready", name: "Prêt" }]}
          users={[{ id: "marie", name: "Marie Lemaire" }]}
          labels={[{ id: "urgent", name: "Urgent", color: "#c00" }]}
          hierarchy={[]}
          resultCount={4}
        />
        <GroupControl
          view="board"
          state={emptyState}
          currentParams={currentParams}
        />
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "auth" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Grouper par" }), {
      target: { value: "component" },
    });
    await act(async () => vi.advanceTimersByTime(300));

    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&item=DEMO-1&group=component&q=auth",
      { scroll: false },
    );
  });

  it("does not let an older route response replace newer optimistic params", async () => {
    vi.useFakeTimers();
    const initialParams = { view: "board", item: "DEMO-1" };
    const { rerender } = render(
      <ViewUrlStateProvider currentParams={initialParams}>
        <FilterBar
          state={emptyState}
          currentParams={initialParams}
          statuses={[]}
          users={[]}
          labels={[]}
          hierarchy={[]}
          resultCount={1}
        />
        <GroupControl
          view="board"
          state={emptyState}
          currentParams={initialParams}
        />
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "auth" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Grouper par" }), {
      target: { value: "component" },
    });
    await act(async () => vi.advanceTimersByTime(300));

    const latestParams = {
      view: "board",
      item: "DEMO-1",
      group: "component",
      q: "auth",
    };
    const groupedState = {
      ...emptyState,
      filters: { ...emptyState.filters, q: "auth" },
      group: "component" as const,
    };
    rerender(
      <ViewUrlStateProvider currentParams={latestParams}>
        <GroupControl
          view="board"
          state={groupedState}
          currentParams={latestParams}
        />
      </ViewUrlStateProvider>,
    );

    const olderParams = {
      view: "board",
      item: "DEMO-1",
      group: "component",
    };
    rerender(
      <ViewUrlStateProvider currentParams={olderParams}>
        <GroupControl
          view="board"
          state={groupedState}
          currentParams={olderParams}
        />
      </ViewUrlStateProvider>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Grouper par" }), {
      target: { value: "priority" },
    });

    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&item=DEMO-1&group=priority&q=auth",
      { scroll: false },
    );
  });

  it("uses a Back or Forward URL as the authority for the next update", () => {
    const initialParams = { view: "board", item: "DEMO-1", q: "auth" };
    render(
      <ViewUrlStateProvider currentParams={initialParams}>
        <GroupControl
          view="board"
          state={emptyState}
          currentParams={initialParams}
        />
      </ViewUrlStateProvider>,
    );

    window.history.replaceState(null, "", "/b/DEMO?view=board&group=priority");
    window.dispatchEvent(new PopStateEvent("popstate"));
    fireEvent.change(screen.getByRole("combobox", { name: "Grouper par" }), {
      target: { value: "component" },
    });

    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&group=component",
      { scroll: false },
    );
  });

  it("keeps a new list sort when the query debounce finishes", async () => {
    vi.useFakeTimers();
    const currentParams = { view: "list", item: "DEMO-1" };

    render(
      <ViewUrlStateProvider currentParams={currentParams}>
        <FilterBar
          state={emptyState}
          currentParams={currentParams}
          statuses={[{ id: "ready", name: "Prêt" }]}
          users={[]}
          labels={[]}
          hierarchy={[]}
          resultCount={1}
        />
        <ItemList
          groups={[
            {
              key: "all",
              label: "Tous",
              items: [
                {
                  id: "task-a",
                  key: "DEMO-1",
                  type: "tache",
                  kind: "feature",
                  title: "Authentication",
                  statusId: "ready",
                  priority: 2,
                  depth: 0,
                  dueDate: null,
                  assigneeId: null,
                  assigneeName: null,
                  labels: [],
                  blocked: false,
                  statusOrder: 0,
                  ancestorIds: [],
                  componentId: null,
                },
              ],
            },
          ]}
          grouped={false}
          statuses={[
            {
              id: "ready",
              name: "Prêt",
              color: "#999",
              category: "todo",
              order: 0,
            },
          ]}
          users={[]}
          backlogKey="DEMO"
          currentSort={null}
          currentParams={currentParams}
        />
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "auth" } });
    fireEvent.click(screen.getByRole("button", { name: "Titre" }));
    await act(async () => vi.advanceTimersByTime(300));

    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=list&item=DEMO-1&sort=title%3Aasc&q=auth",
      { scroll: false },
    );
  });
});

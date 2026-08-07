import { useLayoutEffect, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/shell/filter-bar";
import { ItemList } from "@/components/items/item-list";
import { LinksSection } from "@/components/items/detail/links-section";
import { GroupControl } from "@/components/shell/group-control";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";
import { ViewBar } from "@/components/shell/view-bar";
import { DensityProvider } from "@/components/theme/density-provider";
import type { ViewState } from "@/lib/items/filter";
import type { LinkWithOther } from "@/lib/services/links";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/DEMO",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@/app/actions/items", () => ({
  bulkUpdateItemsAction: vi.fn(),
  createItemAction: vi.fn(),
  softDeleteItemAction: vi.fn(),
  updateItemAction: vi.fn(),
}));

vi.mock("@/app/actions/links", () => ({
  addLinkAction: vi.fn(),
  removeLinkAction: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    onNavigate,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    onNavigate?: (event: { preventDefault: () => void }) => void;
  }) => (
    <a
      {...props}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        onNavigate?.({ preventDefault: () => undefined });
      }}
    >
      {children}
    </a>
  ),
}));

const emptyState: ViewState = {
  filters: {
    q: "",
    types: [],
    statusIds: [],
    priorities: [],
    assignees: [],
    labels: [],
    releaseIds: [],
    kind: [],
    underIds: [],
  },
  group: null,
  sort: null,
};

const releaseOptions = [
  { id: "release-active", name: "2026.10", released: false, archived: false },
  { id: "release-archived", name: "2026.09", released: true, archived: true },
];

const relatedItemLinks: LinkWithOther[] = [
  {
    id: "link-1",
    sourceId: "item-1",
    targetId: "item-2",
    type: "blocks",
    other: {
      id: "item-2",
      key: "DEMO-2",
      title: "Invoices",
      type: "tache",
      statusId: "ready",
      statusName: "Prêt",
      statusColor: "#999",
    },
  },
];

function paramEntries(params: Record<string, string>): [string, string][] {
  return Object.entries(params);
}

function AdvanceTimersInLayout({
  advance,
  children,
}: {
  advance: boolean;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    if (advance) vi.advanceTimersByTime(300);
  }, [advance]);
  return children;
}

function renderBar(state: ViewState = emptyState) {
  const currentParams = {
    view: "board",
    item: "DEMO-1",
    ...(state.filters.types.length > 0 ? { type: state.filters.types.join(",") } : {}),
    ...(state.filters.releaseIds.length > 0
      ? { version: state.filters.releaseIds.join(",") }
      : {}),
  };
  return render(
    <ViewUrlStateProvider initialEntries={paramEntries(currentParams)}>
      <FilterBar
        state={state}
        statuses={[{ id: "ready", name: "Prêt" }]}
        users={[{ id: "marie", name: "Marie Lemaire" }]}
        labels={[{ id: "urgent", name: "Urgent", color: "#c00" }]}
        releases={releaseOptions}
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
    mocks.push.mockReset();
    mocks.replace.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("renders each inactive facet as a plus-prefixed chip", () => {
    const { container } = renderBar();

    for (const label of ["Type", "Statut", "Priorité", "Label", "Version", "Assigné", "Nature", "Sous"]) {
      expect(screen.getByRole("button", { name: `+ ${label}` })).toHaveAttribute("data-active", "false");
    }
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button[data-active]")].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["+ Type", "+ Statut", "+ Priorité", "+ Label", "+ Version", "+ Assigné", "+ Nature", "+ Sous"]);
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

  it("writes selected Fix versions to the version URL parameter", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "+ Version" }));
    await user.click(screen.getByLabelText("2026.10"));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/b/DEMO?view=board&item=DEMO-1&version=release-active",
        { scroll: false },
      ),
    );
  });

  it("keeps a selected archived version visible and clearable", async () => {
    const user = userEvent.setup();
    renderBar({
      ...emptyState,
      filters: { ...emptyState.filters, releaseIds: ["release-archived"] },
    });

    expect(screen.getByRole("button", { name: /Version.*2026\.09.*1/i })).toHaveAttribute(
      "data-active",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Effacer le filtre Version" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/b/DEMO?view=board&item=DEMO-1", {
        scroll: false,
      }),
    );
  });

  it("uses a Back or Forward version URL as authority and preserves unrelated params", async () => {
    const user = userEvent.setup();
    render(
      <ViewUrlStateProvider initialEntries={paramEntries({ view: "board", version: "release-active" })}>
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={releaseOptions}
          hierarchy={[]}
          resultCount={1}
        />
      </ViewUrlStateProvider>,
    );
    window.history.replaceState(
      null,
      "",
      "/b/DEMO?view=board&version=release-archived&tag=history",
    );
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    await user.click(screen.getByRole("button", { name: "+ Version" }));
    await user.click(screen.getByLabelText("2026.10"));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/b/DEMO?view=board&version=release-active&tag=history",
        { scroll: false },
      ),
    );
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
      <ViewUrlStateProvider initialEntries={paramEntries(currentParams)}>
        <FilterBar
          state={emptyState}
          statuses={[{ id: "ready", name: "Prêt" }]}
          users={[{ id: "marie", name: "Marie Lemaire" }]}
          labels={[{ id: "urgent", name: "Urgent", color: "#c00" }]}
          releases={releaseOptions}
          hierarchy={[]}
          resultCount={4}
        />
        <GroupControl
          view="board"
          state={emptyState}
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
      <ViewUrlStateProvider initialEntries={paramEntries(initialParams)}>
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={releaseOptions}
          hierarchy={[]}
          resultCount={1}
        />
        <GroupControl
          view="board"
          state={emptyState}
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
      <ViewUrlStateProvider initialEntries={paramEntries(latestParams)}>
        <GroupControl
          view="board"
          state={groupedState}
        />
      </ViewUrlStateProvider>,
    );

    const olderParams = {
      view: "board",
      item: "DEMO-1",
      group: "component",
    };
    rerender(
      <ViewUrlStateProvider initialEntries={paramEntries(olderParams)}>
        <GroupControl
          view="board"
          state={groupedState}
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
      <ViewUrlStateProvider initialEntries={paramEntries(initialParams)}>
        <GroupControl
          view="board"
          state={emptyState}
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

  it("cancels an armed query write when Back or Forward changes the URL", async () => {
    vi.useFakeTimers();
    const initialParams = { view: "board", item: "DEMO-1" };
    render(
      <ViewUrlStateProvider initialEntries={paramEntries(initialParams)}>
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={releaseOptions}
          hierarchy={[]}
          resultCount={1}
        />
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "obsolete" } });
    window.history.replaceState(null, "", "/b/DEMO?view=tree");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await act(async () => vi.advanceTimersByTime(300));

    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("cancels an armed query write when external server params take authority", async () => {
    vi.useFakeTimers();
    const initialParams = { view: "board", item: "DEMO-1" };
    const { rerender } = render(
      <AdvanceTimersInLayout advance={false}>
        <ViewUrlStateProvider initialEntries={paramEntries(initialParams)}>
          <FilterBar
            state={emptyState}
            statuses={[]}
            users={[]}
            labels={[]}
            releases={releaseOptions}
            hierarchy={[]}
            resultCount={1}
          />
        </ViewUrlStateProvider>
      </AdvanceTimersInLayout>,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "obsolete" } });
    const externalParams = { view: "tree" };
    rerender(
      <AdvanceTimersInLayout advance>
        <ViewUrlStateProvider initialEntries={paramEntries(externalParams)}>
          <FilterBar
            state={emptyState}
            statuses={[]}
            users={[]}
            labels={[]}
            releases={releaseOptions}
            hierarchy={[]}
            resultCount={1}
          />
        </ViewUrlStateProvider>
      </AdvanceTimersInLayout>,
    );

    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps a later tab and the query when its debounce finishes", async () => {
    vi.useFakeTimers();
    const currentParams = { view: "board", item: "DEMO-1" };
    const { rerender } = render(
      <ViewUrlStateProvider initialEntries={paramEntries(currentParams)}>
        <DensityProvider>
          <ViewBar view="board" />
        </DensityProvider>
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={releaseOptions}
          hierarchy={[]}
          resultCount={1}
        />
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "auth" } });
    fireEvent.click(screen.getByRole("link", { name: "Liste" }));
    const navigatedParams = { view: "list", item: "DEMO-1" };
    rerender(
      <ViewUrlStateProvider initialEntries={paramEntries(navigatedParams)}>
        <DensityProvider>
          <ViewBar view="list" />
        </DensityProvider>
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={releaseOptions}
          hierarchy={[]}
          resultCount={1}
        />
      </ViewUrlStateProvider>,
    );
    await act(async () => vi.advanceTimersByTime(300));

    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?view=list&item=DEMO-1");
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=list&item=DEMO-1&q=auth",
      { scroll: false },
    );
  });

  it("leaves modified tab clicks to the link while retaining the full href", () => {
    const currentParams = { view: "board", item: "DEMO-1", q: "auth" };
    render(
      <ViewUrlStateProvider initialEntries={paramEntries(currentParams)}>
        <DensityProvider>
          <ViewBar view="board" />
        </DensityProvider>
      </ViewUrlStateProvider>,
    );

    const listLink = screen.getByRole("link", { name: "Liste" });
    expect(listLink).toHaveAttribute(
      "href",
      "/b/DEMO?view=list&item=DEMO-1&q=auth",
    );

    fireEvent.click(listLink, { metaKey: true });

    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("updates a modified-click tab href from an optimistic grouping write", () => {
    const currentParams = { view: "board", item: "DEMO-1", q: "auth" };
    render(
      <ViewUrlStateProvider initialEntries={paramEntries(currentParams)}>
        <DensityProvider>
          <ViewBar view="board" />
        </DensityProvider>
        <GroupControl
          view="board"
          state={emptyState}
        />
      </ViewUrlStateProvider>,
    );

    const listLink = screen.getByRole("link", { name: "Liste" });
    fireEvent.change(screen.getByRole("combobox", { name: "Grouper par" }), {
      target: { value: "component" },
    });

    expect(listLink).toHaveAttribute(
      "href",
      "/b/DEMO?view=list&item=DEMO-1&q=auth&group=component",
    );

    fireEvent.click(listLink, { metaKey: true });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("keeps a later item and the query when its debounce finishes", async () => {
    vi.useFakeTimers();
    const currentParams = { view: "list" };
    render(
      <ViewUrlStateProvider initialEntries={paramEntries(currentParams)}>
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={releaseOptions}
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
                  estimatePoints: null,
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
          backlogId="11111111-1111-4111-8111-111111111111"
          backlogKey="DEMO"
          currentSort={null}
        />
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "auth" } });
    fireEvent.click(screen.getByText("Authentication"));
    await act(async () => vi.advanceTimersByTime(300));

    expect(mocks.push).toHaveBeenCalledWith("/b/DEMO?view=list&item=DEMO-1");
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=list&item=DEMO-1&q=auth",
      { scroll: false },
    );
  });

  it("keeps a related-item link and query on the shared URL authority", async () => {
    vi.useFakeTimers();
    const currentParams = {
      view: "list",
      item: "DEMO-1",
      v: "saved-view",
      group: "priority",
    };
    render(
      <ViewUrlStateProvider initialEntries={paramEntries(currentParams)}>
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={releaseOptions}
          hierarchy={[]}
          resultCount={1}
        />
        <LinksSection
          itemId="item-1"
          backlogKey="DEMO"
          links={relatedItemLinks}
          candidates={[]}
        />
      </ViewUrlStateProvider>,
    );

    const relatedLink = screen.getByRole("link", { name: /DEMO-2.*Invoices/ });
    expect(relatedLink).toHaveAttribute(
      "href",
      "/b/DEMO?view=list&item=DEMO-2&v=saved-view&group=priority",
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "auth" } });
    fireEvent.click(relatedLink);
    await act(async () => vi.advanceTimersByTime(300));

    expect(mocks.push).toHaveBeenCalledWith(
      "/b/DEMO?view=list&item=DEMO-2&v=saved-view&group=priority",
    );
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=list&item=DEMO-2&v=saved-view&group=priority&q=auth",
      { scroll: false },
    );
  });

  it("updates a related-item href from an optimistic grouping write", () => {
    const currentParams = { view: "board", item: "DEMO-1" };
    render(
      <ViewUrlStateProvider initialEntries={paramEntries(currentParams)}>
        <GroupControl
          view="board"
          state={emptyState}
        />
        <LinksSection
          itemId="item-1"
          backlogKey="DEMO"
          links={relatedItemLinks}
          candidates={[]}
        />
      </ViewUrlStateProvider>,
    );

    const relatedLink = screen.getByRole("link", { name: /DEMO-2.*Invoices/ });
    fireEvent.change(screen.getByRole("combobox", { name: "Grouper par" }), {
      target: { value: "component" },
    });

    expect(relatedLink).toHaveAttribute(
      "href",
      "/b/DEMO?view=board&item=DEMO-2&group=component",
    );
  });

  it("updates a related-item href from external server params before paint", () => {
    const initialParams = { view: "board", item: "DEMO-1", tag: "old" };
    const { rerender } = render(
      <ViewUrlStateProvider initialEntries={paramEntries(initialParams)}>
        <LinksSection
          itemId="item-1"
          backlogKey="DEMO"
          links={relatedItemLinks}
          candidates={[]}
        />
      </ViewUrlStateProvider>,
    );

    const externalParams = { view: "list", item: "DEMO-1", tag: "new" };
    rerender(
      <ViewUrlStateProvider initialEntries={paramEntries(externalParams)}>
        <LinksSection
          itemId="item-1"
          backlogKey="DEMO"
          links={relatedItemLinks}
          candidates={[]}
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.getByRole("link", { name: /DEMO-2.*Invoices/ })).toHaveAttribute(
      "href",
      "/b/DEMO?view=list&item=DEMO-2&tag=new",
    );
  });

  it("retains settled internal origins through repeated delayed renders", () => {
    const initialParams = { view: "board", item: "DEMO-1", tag: "old" };
    const renderContents = (group: ViewState["group"]) => (
      <>
        <GroupControl view="board" state={{ ...emptyState, group }} />
        <LinksSection
          itemId="item-1"
          backlogKey="DEMO"
          links={relatedItemLinks}
          candidates={[]}
        />
      </>
    );
    const { rerender } = render(
      <ViewUrlStateProvider initialEntries={paramEntries(initialParams)}>
        {renderContents(null)}
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Grouper par" }), {
      target: { value: "component" },
    });
    const settledA = { ...initialParams, group: "component" };
    rerender(
      <ViewUrlStateProvider initialEntries={paramEntries(settledA)}>
        {renderContents("component")}
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Grouper par" }), {
      target: { value: "priority" },
    });
    const settledB = { ...initialParams, group: "priority" };
    rerender(
      <ViewUrlStateProvider initialEntries={paramEntries(settledB)}>
        {renderContents("priority")}
      </ViewUrlStateProvider>,
    );

    for (let repeat = 0; repeat < 2; repeat += 1) {
      rerender(
        <ViewUrlStateProvider initialEntries={paramEntries(settledA)}>
          {renderContents("component")}
        </ViewUrlStateProvider>,
      );
    }

    expect(screen.getByRole("link", { name: /DEMO-2.*Invoices/ })).toHaveAttribute(
      "href",
      "/b/DEMO?view=board&item=DEMO-2&tag=old&group=priority",
    );
  });

  it("keeps tombstones across history advances while accepting a real revisit", () => {
    const initialParams = { view: "board", item: "DEMO-1", tag: "old" };
    const pendingB = { ...initialParams, group: "component" };
    const renderContents = (group: ViewState["group"]) => (
      <>
        <GroupControl view="board" state={{ ...emptyState, group }} />
        <LinksSection
          itemId="item-1"
          backlogKey="DEMO"
          links={relatedItemLinks}
          candidates={[]}
        />
      </>
    );
    const { rerender } = render(
      <ViewUrlStateProvider initialEntries={paramEntries(initialParams)}>
        {renderContents(null)}
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Grouper par" }), {
      target: { value: "component" },
    });
    window.history.replaceState(
      null,
      "",
      "/b/DEMO?view=board&item=DEMO-1&tag=history&group=priority",
    );
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    for (let repeat = 0; repeat < 2; repeat += 1) {
      rerender(
        <ViewUrlStateProvider initialEntries={paramEntries(pendingB)}>
          {renderContents("component")}
        </ViewUrlStateProvider>,
      );
    }

    expect(screen.getByRole("link", { name: /DEMO-2.*Invoices/ })).toHaveAttribute(
      "href",
      "/b/DEMO?view=board&item=DEMO-2&tag=history&group=priority",
    );

    window.history.replaceState(
      null,
      "",
      "/b/DEMO?view=board&item=DEMO-1&tag=old&group=component",
    );
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(screen.getByRole("link", { name: /DEMO-2.*Invoices/ })).toHaveAttribute(
      "href",
      "/b/DEMO?view=board&item=DEMO-2&tag=old&group=component",
    );
  });

  it("updates a related-item href when browser history advances", () => {
    const initialParams = { view: "board", item: "DEMO-1", tag: "old" };
    render(
      <ViewUrlStateProvider initialEntries={paramEntries(initialParams)}>
        <LinksSection
          itemId="item-1"
          backlogKey="DEMO"
          links={relatedItemLinks}
          candidates={[]}
        />
      </ViewUrlStateProvider>,
    );

    window.history.replaceState(null, "", "/b/DEMO?view=tree&tag=history");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    expect(screen.getByRole("link", { name: /DEMO-2.*Invoices/ })).toHaveAttribute(
      "href",
      "/b/DEMO?view=tree&tag=history&item=DEMO-2",
    );
  });

  it("preserves repeated unrelated params through q, grouping, and tab navigation", async () => {
    vi.useFakeTimers();
    render(
      <ViewUrlStateProvider
        initialEntries={[
          ["view", "board"],
          ["tag", "a"],
          ["tag", "b"],
        ]}
      >
        <DensityProvider>
          <ViewBar view="board" />
        </DensityProvider>
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={releaseOptions}
          hierarchy={[]}
          resultCount={1}
        />
        <GroupControl view="board" state={emptyState} />
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "auth" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Grouper par" }), {
      target: { value: "component" },
    });

    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&tag=a&tag=b&group=component",
      { scroll: false },
    );
    const listLink = screen.getByRole("link", { name: "Liste" });
    expect(listLink).toHaveAttribute(
      "href",
      "/b/DEMO?view=list&tag=a&tag=b&group=component",
    );
    fireEvent.click(listLink);
    expect(mocks.push).toHaveBeenLastCalledWith(
      "/b/DEMO?view=list&tag=a&tag=b&group=component",
    );

    await act(async () => vi.advanceTimersByTime(300));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=list&tag=a&tag=b&group=component&q=auth",
      { scroll: false },
    );
  });

  it("keeps a new list sort when the query debounce finishes", async () => {
    vi.useFakeTimers();
    const currentParams = { view: "list", item: "DEMO-1" };

    render(
      <ViewUrlStateProvider initialEntries={paramEntries(currentParams)}>
        <FilterBar
          state={emptyState}
          statuses={[{ id: "ready", name: "Prêt" }]}
          users={[]}
          labels={[]}
          releases={releaseOptions}
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
                  estimatePoints: null,
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
          backlogId="11111111-1111-4111-8111-111111111111"
          backlogKey="DEMO"
          currentSort={null}
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

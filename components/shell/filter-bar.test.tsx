import { useLayoutEffect, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/shell/filter-bar";
import {
  KeyboardShortcutsProvider,
  useShortcutHandler,
} from "@/components/shortcuts/keyboard-shortcuts-provider";
import { ItemList } from "@/components/items/item-list";
import { LinksSection } from "@/components/items/detail/links-section";
import { DisplayMenu } from "@/components/shell/display-menu";
import { DensityProvider } from "@/components/theme/density-provider";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";
import { Sidebar } from "@/components/shell/sidebar";
import { SidebarStateProvider } from "@/components/shell/sidebar-state";
import { writeViewState, type ViewState } from "@/lib/items/filter";
import type { LinkWithOther } from "@/lib/services/links";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ key: "DEMO" }),
  useSearchParams: () => new URLSearchParams("view=board"),
  usePathname: () => "/b/DEMO",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@/app/actions/items", () => ({
  bulkUpdateItemsAction: vi.fn(),
  createItemAction: vi.fn(),
  softDeleteItemAction: vi.fn(),
  updateItemAction: vi.fn(),
}));

// The sidebar's user card imports a Server Action module.
vi.mock("@/app/actions/account", () => ({ changeOwnPasswordAction: vi.fn() }));

/** Opens « + Filtre » and one of its facets (JIR-74). */
async function addFilter(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: "Filtre" }));
  await user.click(screen.getByRole("button", { name: label }));
}

/** Picks a grouping in the « Affichage » menu (JIR-74). */
function chooseGroup(label: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name: /^Affichage/ }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
}

/** The project views now live in the sidebar (JIR-74). */
function ProjectViewLinks() {
  return (
    <SidebarStateProvider>
      <Sidebar
        backlogs={[{ id: "backlog-1", key: "DEMO", name: "Démo", color: "#2563eb" }]}
        views={[]}
        userId="user-1"
        user={{ name: "Ada", email: "ada@example.com", role: "contributor" }}
        canAdminister={false}
        counts={{ allByBacklog: {}, mine: 0, trash: 0 }}
      />
    </SidebarStateProvider>
  );
}

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
    releaseIds: [], sprintIds: [],
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

const sprintOptions = [
  { id: "sprint-active", name: "Sprint 4", state: "active" as const },
  { id: "sprint-next", name: "Sprint 5", state: "planned" as const },
  { id: "sprint-recent", name: "Sprint 3", state: "completed" as const },
  { id: "sprint-old", name: "Sprint 1", state: "completed" as const },
];

function renderBar(
  state: ViewState = emptyState,
  { sprints }: { sprints?: typeof sprintOptions } = {},
) {
  // The URL is the bar's authority: the server state is written into it.
  const params = new URLSearchParams([["view", "board"], ["item", "DEMO-1"]]);
  writeViewState(params, state);
  const currentParams = Object.fromEntries(params.entries());
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
        sprints={sprints}
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

  it("keeps Type, Statut and Parent on the bar and the other facets behind « + Filtre »", async () => {
    const user = userEvent.setup();
    const { container } = renderBar();

    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button[data-active]")].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["Type", "Statut", "Parent"]);
    for (const label of ["Priorité", "Label", "Version", "Nature"]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
    await user.click(screen.getByRole("button", { name: "Filtre" }));
    expect(
      within(screen.getByRole("list", { name: "Ajouter un filtre" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Priorité", "Label", "Version", "Nature"]);
    expect(screen.queryByRole("button", { name: /^Affichage/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Trier par" })).not.toBeInTheDocument();
  });

  it("filters by assignee with pressed avatar toggles, « Non assigné » included", async () => {
    const user = userEvent.setup();
    renderBar({
      ...emptyState,
      filters: { ...emptyState.filters, assignees: ["marie"] },
    });

    const group = screen.getByRole("group", { name: "Filtrer par assigné" });
    expect(
      within(group).getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Non assigné", "Marie Lemaire"]);
    expect(within(group).getByRole("button", { name: "Marie Lemaire" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const unassigned = within(group).getByRole("button", { name: "Non assigné" });
    expect(unassigned).toHaveAttribute("aria-pressed", "false");

    await user.click(unassigned);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/b/DEMO?view=board&item=DEMO-1&assignee=marie%2Cnone",
        { scroll: false },
      ),
    );
  });

  it("shows an active « + Filtre » facet as a chip with its value", async () => {
    const user = userEvent.setup();
    renderBar({
      ...emptyState,
      filters: { ...emptyState.filters, priorities: [4], kind: ["bug"] },
    });

    expect(screen.getByRole("button", { name: /^Priorité : / })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: "Nature : Bug" })).toHaveAttribute("data-active", "true");

    await user.click(screen.getByRole("button", { name: "Filtre" }));
    expect(
      within(screen.getByRole("list", { name: "Ajouter un filtre" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Label", "Version"]);
  });

  it("offers « Sprint » behind « + Filtre » with « Aucun sprint » and the sprints grouped by state", async () => {
    const user = userEvent.setup();
    renderBar(emptyState, { sprints: sprintOptions });

    await user.click(screen.getByRole("button", { name: "Filtre" }));
    expect(
      within(screen.getByRole("list", { name: "Ajouter un filtre" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Priorité", "Label", "Version", "Sprint", "Nature"]);
    await user.click(screen.getByRole("button", { name: "Sprint" }));

    const facet = screen.getByRole("group", { name: "Filtre Sprint" });
    expect(within(facet).getAllByRole("checkbox").map((box) => box.closest("label")?.textContent))
      .toEqual(["Aucun sprint", "Sprint 4", "Sprint 5", "Sprint 3", "Sprint 1"]);
    expect(
      within(within(facet).getByRole("group", { name: "Terminés" }))
        .getAllByRole("checkbox")
        .map((box) => box.closest("label")?.textContent),
    ).toEqual(["Sprint 3", "Sprint 1"]);
    expect(within(facet).getByRole("group", { name: "Actif" })).toBeInTheDocument();
    expect(within(facet).getByRole("group", { name: "Planifiés" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Sprint 1"));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/b/DEMO?view=board&item=DEMO-1&sprint=sprint-old",
        { scroll: false },
      ),
    );
  });

  it("shows a selected completed sprint as a chip by name, cleared by its ×", async () => {
    const user = userEvent.setup();
    renderBar(
      { ...emptyState, filters: { ...emptyState.filters, sprintIds: ["sprint-old", "none"] } },
      { sprints: sprintOptions },
    );

    expect(screen.getByRole("button", { name: "Sprint : Sprint 1 +1" })).toHaveAttribute(
      "data-active",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Effacer le filtre Sprint" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/b/DEMO?view=board&item=DEMO-1", {
        scroll: false,
      }),
    );
  });

  it("clears the sprint filter with « Réinitialiser »", async () => {
    const user = userEvent.setup();
    renderBar(
      { ...emptyState, filters: { ...emptyState.filters, sprintIds: ["sprint-recent"] } },
      { sprints: sprintOptions },
    );

    await user.click(screen.getByRole("button", { name: "Réinitialiser" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/b/DEMO?view=board&item=DEMO-1", {
        scroll: false,
      }),
    );
  });

  it("ignores a sprint the backlog does not have, and the facet in views without it", () => {
    const { unmount } = renderBar(
      { ...emptyState, filters: { ...emptyState.filters, sprintIds: ["foreign-sprint"] } },
      { sprints: sprintOptions },
    );
    expect(screen.queryByRole("button", { name: /^Sprint :/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réinitialiser" })).not.toBeInTheDocument();
    unmount();

    renderBar({ ...emptyState, filters: { ...emptyState.filters, sprintIds: ["sprint-old"] } });
    expect(screen.queryByRole("button", { name: /^Sprint :/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réinitialiser" })).not.toBeInTheDocument();
  });

  it("labels the free-text filter field", () => {
    renderBar();

    expect(screen.getByRole("searchbox", { name: "Filtrer les items" })).toHaveAttribute(
      "placeholder",
      "Filtrer…",
    );
  });

  it("accumulates successive avatar toggles from the URL while the server response is held", () => {
    const people = [
      { id: "alice", name: "Alice Martin" },
      { id: "bob", name: "Bob Durand" },
    ];
    const bar = (entries: [string, string][]) => (
      <ViewUrlStateProvider initialEntries={entries}>
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={people}
          labels={[]}
          releases={[]}
          hierarchy={[]}
          resultCount={1}
        />
      </ViewUrlStateProvider>
    );
    const { rerender } = render(bar([["view", "board"]]));
    const group = () => screen.getByRole("group", { name: "Filtrer par assigné" });
    const avatar = (name: string) => within(group()).getByRole("button", { name });

    fireEvent.click(avatar("Alice Martin"));
    expect(avatar("Alice Martin")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(avatar("Bob Durand"));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&assignee=alice%2Cbob",
      { scroll: false },
    );
    expect(avatar("Alice Martin")).toHaveAttribute("aria-pressed", "true");
    expect(avatar("Bob Durand")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(avatar("Bob Durand"));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&assignee=alice",
      { scroll: false },
    );
    expect(avatar("Bob Durand")).toHaveAttribute("aria-pressed", "false");

    // A late response for an earlier click does not undo the latest one.
    rerender(bar([["view", "board"], ["assignee", "alice,bob"]]));
    expect(avatar("Alice Martin")).toHaveAttribute("aria-pressed", "true");
    expect(avatar("Bob Durand")).toHaveAttribute("aria-pressed", "false");

    // Back navigation is authoritative.
    window.history.replaceState(null, "", "/b/DEMO?view=board&assignee=bob");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(avatar("Alice Martin")).toHaveAttribute("aria-pressed", "false");
    expect(avatar("Bob Durand")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(avatar("Alice Martin"));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&assignee=bob%2Calice",
      { scroll: false },
    );
  });

  it("accumulates successive facet selections from the URL while the server response is held", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "Type" }));
    await user.click(screen.getByRole("checkbox", { name: "Epic" }));
    expect(screen.getByRole("checkbox", { name: "Epic" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Tâche" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenLastCalledWith(
        "/b/DEMO?view=board&item=DEMO-1&type=epic%2Ctache",
        { scroll: false },
      ),
    );
  });

  it("keeps keyboard focus inside « + Filtre » across its screens, away from page shortcuts", async () => {
    const user = userEvent.setup();
    const search = vi.fn();
    const create = vi.fn();
    function PageShortcuts() {
      useShortcutHandler("search", search);
      useShortcutHandler("create", create);
      return null;
    }
    render(
      <KeyboardShortcutsProvider>
        <PageShortcuts />
        <ViewUrlStateProvider initialEntries={[["view", "board"]]}>
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
      </KeyboardShortcutsProvider>,
    );

    screen.getByRole("button", { name: "Filtre" }).focus();
    await user.keyboard("{Enter}");

    // A category without values: focus lands on the way back, then returns
    // to that category.
    const label = await screen.findByRole("button", { name: "Label" });
    label.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Filtres" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Label" })).toHaveFocus();

    // A category with values: focus lands on the first one, Space selects it.
    screen.getByRole("button", { name: "Nature" }).focus();
    await user.keyboard("{Enter}");
    const feature = screen.getByRole("checkbox", { name: "Fonctionnalité" });
    expect(feature).toHaveFocus();
    await user.keyboard(" ");
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenLastCalledWith("/b/DEMO?view=board&kind=feature", {
        scroll: false,
      }),
    );
    expect(document.activeElement).not.toBe(document.body);
    await user.keyboard("/c");
    expect(search).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    // Nature is now a chip on the bar: back lands on the first category left.
    screen.getByRole("button", { name: "Filtres" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Priorité" })).toHaveFocus();
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

    const typeChip = screen.getByRole("button", { name: "Type : Tâche" });
    expect(typeChip).toHaveAttribute("data-active", "true");

    await user.click(screen.getByRole("button", { name: "Effacer le filtre Type" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/b/DEMO?view=board&item=DEMO-1", { scroll: false }),
    );
  });

  it("writes selected component and epic facets to the under URL parameter", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "Parent" }));
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

    await addFilter(user, "Version");
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

    expect(screen.getByRole("button", { name: "Version : 2026.09" })).toHaveAttribute(
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

    // The URL version is active: its chip opens the values.
    await user.click(screen.getByRole("button", { name: "Version : 2026.09" }));
    await user.click(screen.getByLabelText("2026.10"));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/b/DEMO?view=board&version=release-archived%2Crelease-active&tag=history",
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
        <DensityProvider>
          <DisplayMenu
          view="board"
          state={emptyState}
        />
        </DensityProvider>
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "auth" } });
    chooseGroup("Composant");
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
        <DensityProvider>
          <DisplayMenu
          view="board"
          state={emptyState}
        />
        </DensityProvider>
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "auth" } });
    chooseGroup("Composant");
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
        <DensityProvider>
          <DisplayMenu
          view="board"
          state={groupedState}
        />
        </DensityProvider>
      </ViewUrlStateProvider>,
    );

    const olderParams = {
      view: "board",
      item: "DEMO-1",
      group: "component",
    };
    rerender(
      <ViewUrlStateProvider initialEntries={paramEntries(olderParams)}>
        <DensityProvider>
          <DisplayMenu
          view="board"
          state={groupedState}
        />
        </DensityProvider>
      </ViewUrlStateProvider>,
    );
    chooseGroup("Priorité");

    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&item=DEMO-1&group=priority&q=auth",
      { scroll: false },
    );
  });

  it("uses a Back or Forward URL as the authority for the next update", () => {
    const initialParams = { view: "board", item: "DEMO-1", q: "auth" };
    render(
      <ViewUrlStateProvider initialEntries={paramEntries(initialParams)}>
        <DensityProvider>
          <DisplayMenu
          view="board"
          state={emptyState}
        />
        </DensityProvider>
      </ViewUrlStateProvider>,
    );

    window.history.replaceState(null, "", "/b/DEMO?view=board&group=priority");
    window.dispatchEvent(new PopStateEvent("popstate"));
    chooseGroup("Composant");

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

  it("keeps a later view link and the query when its debounce finishes", async () => {
    vi.useFakeTimers();
    const currentParams = { view: "board", item: "DEMO-1" };
    const { rerender } = render(
      <ViewUrlStateProvider initialEntries={paramEntries(currentParams)}>
        <ProjectViewLinks />
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
        <ProjectViewLinks />
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

  it("leaves modified view-link clicks to the link while retaining the full href", () => {
    const currentParams = { view: "board", item: "DEMO-1", q: "auth" };
    render(
      <ViewUrlStateProvider initialEntries={paramEntries(currentParams)}>
        <ProjectViewLinks />
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

  it("updates a modified-click view-link href from an optimistic grouping write", () => {
    const currentParams = { view: "board", item: "DEMO-1", q: "auth" };
    render(
      <ViewUrlStateProvider initialEntries={paramEntries(currentParams)}>
        <ProjectViewLinks />
        <DensityProvider>
          <DisplayMenu
          view="board"
          state={emptyState}
        />
        </DensityProvider>
      </ViewUrlStateProvider>,
    );

    const listLink = screen.getByRole("link", { name: "Liste" });
    chooseGroup("Composant");

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
        <DensityProvider>
          <DisplayMenu
          view="board"
          state={emptyState}
        />
        </DensityProvider>
        <LinksSection
          itemId="item-1"
          backlogKey="DEMO"
          links={relatedItemLinks}
          candidates={[]}
        />
      </ViewUrlStateProvider>,
    );

    const relatedLink = screen.getByRole("link", { name: /DEMO-2.*Invoices/ });
    chooseGroup("Composant");

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
        <DensityProvider>
          <DisplayMenu view="board" state={{ ...emptyState, group }} />
        </DensityProvider>
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

    chooseGroup("Composant");
    const settledA = { ...initialParams, group: "component" };
    rerender(
      <ViewUrlStateProvider initialEntries={paramEntries(settledA)}>
        {renderContents("component")}
      </ViewUrlStateProvider>,
    );

    chooseGroup("Priorité");
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
        <DensityProvider>
          <DisplayMenu view="board" state={{ ...emptyState, group }} />
        </DensityProvider>
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

    chooseGroup("Composant");
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
        <ProjectViewLinks />
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={releaseOptions}
          hierarchy={[]}
          resultCount={1}
        />
        <DensityProvider>
          <DisplayMenu view="board" state={emptyState} />
        </DensityProvider>
      </ViewUrlStateProvider>,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "auth" } });
    chooseGroup("Composant");

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

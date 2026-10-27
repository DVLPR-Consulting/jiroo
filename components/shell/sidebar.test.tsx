import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/shell/filter-bar";
import { Sidebar } from "@/components/shell/sidebar";
import { SidebarStateProvider } from "@/components/shell/sidebar-state";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  pathname: "/b/CASS",
  search: "view=board",
  canOpenBacklogSettings: vi.fn<(backlogId: string) => Promise<boolean>>(async () => false),
}));

vi.mock("@/app/actions/backlogs", () => ({
  canOpenBacklogSettingsAction: mocks.canOpenBacklogSettings,
}));

// The user card's password dialog imports a Server Action module.
vi.mock("@/app/actions/account", () => ({ changeOwnPasswordAction: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ key: "CASS" }),
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
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
        event.preventDefault();
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        onNavigate?.({ preventDefault: () => undefined });
      }}
    >
      {children}
    </a>
  ),
}));

const props = {
  backlogs: [
    { id: "backlog-1", key: "CASS", name: "Pôle civil", color: "#2563eb" },
  ],
  views: [],
  userId: "admin-1",
  user: { name: "Ada Lovelace", email: "ada@example.com", role: "contributor" },
  canAdminister: true,
  adminHref: "/admin?tab=users",
  counts: { allByBacklog: { CASS: 42 }, mine: 7, trash: 3 },
};

function renderSidebar(
  initialEntries: [string, string][] = [["view", "board"]],
) {
  return render(
    <SidebarStateProvider>
      <ViewUrlStateProvider initialEntries={initialEntries}>
        <Sidebar {...props} />
      </ViewUrlStateProvider>
    </SidebarStateProvider>,
  );
}

describe("Sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.sidebar = "open";
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.pathname = "/b/CASS";
    mocks.search = "view=board";
    mocks.canOpenBacklogSettings.mockReset();
    mocks.canOpenBacklogSettings.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["open", "collapsed"])(
    "allows the whole %s sidebar to scroll while keeping filters usable (JIR-125)",
    async (state) => {
      document.documentElement.dataset.sidebar = state;
      const { container } = renderSidebar();
      const sidebar = container.firstElementChild;
      const filters = screen.getByText("Filtres").parentElement;

      await waitFor(() => {
        // JSDOM has no layout: Chromium separately checks wheel/Tab reachability.
        expect(sidebar).toHaveClass("overflow-y-auto", "overflow-x-hidden");
        expect(sidebar).not.toHaveClass("overflow-hidden");
        expect(filters).toHaveClass("min-h-32", "overflow-y-auto");
      });
    },
  );

  it("renders route-aware navigation and aggregate counts", () => {
    renderSidebar();

    const allItems = screen.getByRole("link", { name: /Tous les items 42/ });
    expect(allItems).toHaveAttribute("href", "/b/CASS?view=list");
    expect(screen.getByRole("link", { name: /Mes items 7/ })).toHaveAttribute(
      "href",
      "/mine",
    );
    expect(screen.getByRole("link", { name: /Corbeille 3/ })).toHaveAttribute(
      "href",
      "/trash",
    );
    expect(screen.getByRole("link", { name: "Administration" })).toHaveAttribute(
      "href",
      "/admin?tab=users",
    );
  });

  it("lists Le point first among the project views, marked as a pilot", () => {
    renderSidebar();

    const nav = screen.getByRole("navigation", { name: "Vues du projet" });
    const pilot = within(nav).getByRole("link", { name: /Le point/ });
    expect(pilot).toHaveAttribute("href", "/b/CASS/le-point");
    expect(pilot).not.toHaveAttribute("aria-current");
    expect(within(pilot).getByText("pilote")).toBeVisible();
    expect(within(nav).getAllByRole("link")[0]).toBe(pilot);
  });

  it("keeps the project of the page on Le point (JIR-107)", () => {
    mocks.pathname = "/b/PEN/le-point";
    mocks.search = "";
    render(
      <SidebarStateProvider>
        <ViewUrlStateProvider initialEntries={[]}>
          <Sidebar
            {...props}
            backlogs={[...props.backlogs, { id: "backlog-2", key: "PEN", name: "Pôle pénal", color: "#dc2626" }]}
          />
        </ViewUrlStateProvider>
      </SidebarStateProvider>,
    );

    expect(screen.getByRole("button", { name: "Backlog PEN — Pôle pénal" })).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Vues du projet" });
    expect(within(nav).getByRole("link", { name: /Le point/ })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Roadmap" })).toHaveAttribute("href", "/b/PEN/roadmap");
  });


  it("links every backlog's home, inactive off the home page (JIR-82)", () => {
    renderSidebar();

    const home = screen.getByRole("link", { name: "Tous les backlogs" });
    expect(home).toHaveAttribute("href", "/");
    expect(home).not.toHaveAttribute("aria-current");
  });

  it("shows filtered trash to every member without exposing administration", () => {
    render(
      <SidebarStateProvider>
        <ViewUrlStateProvider initialEntries={[["view", "board"]]}>
          <Sidebar
            {...props}
            user={{ ...props.user, role: "admin" }}
            canAdminister={false}
          />
        </ViewUrlStateProvider>
      </SidebarStateProvider>,
    );

    expect(screen.getByRole("link", { name: /Corbeille 3/ })).toHaveAttribute(
      "href",
      "/trash",
    );
    expect(
      screen.queryByRole("link", { name: "Administration" }),
    ).not.toBeInTheDocument();
  });

  it("renders the complete wordmark without an internal collapse control", () => {
    renderSidebar();

    const brand = screen.getByRole("img", { name: "Jiroo" });

    expect(brand).toHaveTextContent(/^Jiroo$/);
    expect(screen.getByRole("link", { name: "Jiroo — accueil" })).toHaveAttribute(
      "href",
      "/b/CASS",
    );
    expect(
      screen.queryByRole("button", { name: "Replier la barre latérale" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Filtres")).toBeInTheDocument();
  });

  it("lists the project views with the current one active", () => {
    renderSidebar([["view", "list"], ["q", "kept"]]);

    const nav = screen.getByRole("navigation", { name: "Vues du projet" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Le pointpilote",
      "Backlog",
      "Board",
      "Liste",
      "Arbre",
      "Roadmap",
      "Releases",
      "Rapports",
    ]);
    // useSearchParams is mocked to view=board.
    expect(within(nav).getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Liste" })).toHaveAttribute(
      "href",
      "/b/CASS?view=list&q=kept",
    );
    expect(within(nav).getByRole("link", { name: "Releases" })).toHaveAttribute(
      "href",
      "/b/CASS/releases",
    );
    expect(within(nav).getByRole("link", { name: "Rapports" })).toHaveAttribute(
      "href",
      "/b/CASS/reports",
    );
  });

  it("links the active backlog's settings only for its administrators (JIR-122)", async () => {
    const { unmount } = renderSidebar([["view", "board"]]);
    await waitFor(() => expect(mocks.canOpenBacklogSettings).toHaveBeenCalledWith("backlog-1"));
    expect(
      within(screen.getByRole("navigation", { name: "Vues du projet" })).queryByRole("link", {
        name: "Paramètres",
      }),
    ).not.toBeInTheDocument();
    unmount();

    mocks.canOpenBacklogSettings.mockResolvedValue(true);
    mocks.pathname = "/b/CASS/settings/templates";
    renderSidebar([]);
    const settings = await within(
      screen.getByRole("navigation", { name: "Vues du projet" }),
    ).findByRole("link", { name: "Paramètres" });
    expect(settings).toHaveAttribute("href", "/b/CASS/settings/access");
    expect(settings).toHaveAttribute("aria-current", "page");
  });

  it("re-checks the settings link on navigation, without remounting (JIR-122)", async () => {
    mocks.canOpenBacklogSettings.mockResolvedValue(true);
    const tree = () => (
      <SidebarStateProvider>
        <ViewUrlStateProvider initialEntries={[]}>
          <Sidebar {...props} />
        </ViewUrlStateProvider>
      </SidebarStateProvider>
    );
    const { rerender } = render(tree());
    const nav = screen.getByRole("navigation", { name: "Vues du projet" });
    await within(nav).findByRole("link", { name: "Paramètres" });

    // Revoked: the next page drops the link.
    mocks.canOpenBacklogSettings.mockResolvedValue(false);
    mocks.pathname = "/b/CASS/roadmap";
    rerender(tree());
    await waitFor(() =>
      expect(within(nav).queryByRole("link", { name: "Paramètres" })).not.toBeInTheDocument(),
    );

    // A failed check keeps the last answer; the next navigation retries.
    mocks.canOpenBacklogSettings.mockRejectedValue(new Error("network"));
    mocks.pathname = "/b/CASS/releases";
    rerender(tree());
    await waitFor(() => expect(mocks.canOpenBacklogSettings).toHaveBeenCalledTimes(3));
    expect(within(nav).queryByRole("link", { name: "Paramètres" })).not.toBeInTheDocument();

    mocks.canOpenBacklogSettings.mockResolvedValue(true);
    mocks.pathname = "/b/CASS/reports";
    rerender(tree());
    await within(nav).findByRole("link", { name: "Paramètres" });
  });

  it("re-checks the settings link when switching item views on the same path (JIR-122)", async () => {
    mocks.canOpenBacklogSettings.mockResolvedValue(false);
    const tree = () => (
      <SidebarStateProvider>
        <ViewUrlStateProvider initialEntries={[]}>
          <Sidebar {...props} />
        </ViewUrlStateProvider>
      </SidebarStateProvider>
    );
    const { rerender } = render(tree());
    await waitFor(() => expect(mocks.canOpenBacklogSettings).toHaveBeenCalledTimes(1));
    const nav = screen.getByRole("navigation", { name: "Vues du projet" });

    mocks.canOpenBacklogSettings.mockResolvedValue(true);
    mocks.search = "view=list";
    rerender(tree());
    await within(nav).findByRole("link", { name: "Paramètres" });
    expect(mocks.canOpenBacklogSettings).toHaveBeenCalledTimes(2);
  });

  it("follows the backlog of an access page, not the first backlog (JIR-85)", () => {
    mocks.pathname = "/b/PEN/settings/access";
    render(
      <SidebarStateProvider>
        <ViewUrlStateProvider initialEntries={[]}>
          <Sidebar
            {...props}
            backlogs={[
              ...props.backlogs,
              { id: "backlog-2", key: "PEN", name: "Pôle pénal", color: "#dc2626" },
            ]}
          />
        </ViewUrlStateProvider>
      </SidebarStateProvider>,
    );

    expect(screen.getByRole("button", { name: "Backlog PEN — Pôle pénal" })).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Vues du projet" });
    expect(within(nav).getByRole("link", { name: "Releases" })).toHaveAttribute(
      "href",
      "/b/PEN/releases",
    );
    expect(within(nav).queryByRole("link", { current: "page" })).not.toBeInTheDocument();
  });

  it("switches item views through the shared URL authority", () => {
    renderSidebar([["view", "board"], ["q", "kept"]]);

    fireEvent.click(screen.getByRole("link", { name: "Backlog" }));
    expect(mocks.push).toHaveBeenCalledWith("/b/CASS?view=backlog&q=kept");
  });

  it("renders a compact accessible rail without open-only content", () => {
    document.documentElement.dataset.sidebar = "collapsed";
    renderSidebar();

    const brand = screen.getByRole("img", { name: "Jiroo" });

    expect(brand).toHaveTextContent(/^J$/);
    expect(brand).toHaveAttribute("title", "Jiroo");
    expect(screen.getByRole("link", { name: "Jiroo — accueil" })).toHaveAttribute(
      "href",
      "/b/CASS",
    );
    expect(
      screen.queryByRole("button", { name: "Déplier la barre latérale" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("CASS")).toBeVisible();
    expect(screen.queryByText("Vues perso")).not.toBeInTheDocument();
    expect(screen.queryByText("Vues partagées")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enregistrer une vue" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Backlog" })).toHaveAttribute("title", "Backlog");
    expect(screen.getByText("Tous les items")).toHaveClass("sr-only");
    expect(screen.getByRole("link", { name: /Tous les items 42/ })).toHaveAttribute(
      "title",
      "Tous les items",
    );
  });

  it("routes the active-backlog all-items link through the shared authority", () => {
    renderSidebar([
      ["view", "list"],
      ["item", "CASS-1"],
      ["q", "obsolete"],
      ["tag", "a"],
      ["tag", "b"],
    ]);

    const allItems = screen.getByRole("link", { name: /Tous les items 42/ });
    expect(allItems).toHaveAttribute("href", "/b/CASS?tag=a&tag=b&view=list");
    fireEvent.click(allItems);
    expect(mocks.push).toHaveBeenCalledWith("/b/CASS?tag=a&tag=b&view=list");
  });

  it("marks Tous les items current on the unfiltered Liste only (JIR-94)", () => {
    mocks.search = "view=list";
    const { unmount } = renderSidebar([["view", "list"]]);
    expect(screen.getByRole("link", { name: /Tous les items 42/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    unmount();

    for (const search of ["view=board", "view=list&q=bug", "view=list&status=s1"]) {
      mocks.search = search;
      const view = renderSidebar([...new URLSearchParams(search).entries()]);
      expect(screen.getByRole("link", { name: /Tous les items 42/ })).not.toHaveAttribute(
        "aria-current",
      );
      view.unmount();
    }
  });

  it("opens the unfiltered Liste from the board, clearing every view state (JIR-94)", () => {
    renderSidebar([
      ["view", "board"],
      ["status", "s1"],
      ["group", "assignee"],
      ["sort", "key:asc"],
    ]);

    fireEvent.click(screen.getByRole("link", { name: /Tous les items 42/ }));
    expect(mocks.push).toHaveBeenCalledWith("/b/CASS?view=list");
  });

  it("only closes the drawer through the History API on the unfiltered Liste (JIR-78)", () => {
    const pushState = vi.spyOn(window.history, "pushState").mockImplementation(() => undefined);
    mocks.search = "view=list&item=CASS-1";
    renderSidebar([["view", "list"], ["item", "CASS-1"]]);

    fireEvent.click(screen.getByRole("link", { name: /Tous les items 42/ }));
    expect(pushState).toHaveBeenCalledWith(null, "", "/b/CASS?view=list");
    expect(mocks.push).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it("links Tous les items to the Liste from another page of the backlog (JIR-94)", () => {
    mocks.pathname = "/b/CASS/releases";
    mocks.search = "";
    renderSidebar([]);

    const allItems = screen.getByRole("link", { name: /Tous les items 42/ });
    expect(allItems).toHaveAttribute("href", "/b/CASS?view=list");
    expect(allItems).not.toHaveAttribute("aria-current");
  });

  it("cancels an armed query when all-items becomes authoritative", async () => {
    vi.useFakeTimers();
    render(
      <SidebarStateProvider>
        <ViewUrlStateProvider
          initialEntries={[
            ["view", "list"],
            ["q", "old"],
            ["tag", "a"],
            ["tag", "b"],
          ]}
        >
          <Sidebar {...props} />
          <FilterBar
            state={{
              filters: {
                q: "old",
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
            }}
            statuses={[]}
            users={[]}
            labels={[]}
            releases={[]}
            hierarchy={[]}
            resultCount={1}
          />
        </ViewUrlStateProvider>
      </SidebarStateProvider>,
    );

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "obsolete" },
    });
    fireEvent.click(screen.getByRole("link", { name: /Tous les items 42/ }));
    await act(async () => vi.advanceTimersByTime(300));

    expect(mocks.push).toHaveBeenCalledWith("/b/CASS?tag=a&tag=b&view=list");
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

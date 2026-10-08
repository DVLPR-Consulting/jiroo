import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/shell/filter-bar";
import { Sidebar } from "@/components/shell/sidebar";
import { SidebarStateProvider } from "@/components/shell/sidebar-state";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

// The user card's password dialog imports a Server Action module.
vi.mock("@/app/actions/account", () => ({ changeOwnPasswordAction: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ key: "CASS" }),
  usePathname: () => "/b/CASS",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("view=board"),
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders route-aware navigation and aggregate counts", () => {
    renderSidebar();

    const allItems = screen.getByRole("link", { name: /Tous les items 42/ });
    expect(allItems).toHaveAttribute("href", "/b/CASS");
    expect(allItems).toHaveAttribute("aria-current", "page");
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
      "Backlog",
      "Board",
      "Liste",
      "Arbre",
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
    expect(allItems).toHaveAttribute("href", "/b/CASS?tag=a&tag=b");
    fireEvent.click(allItems);
    expect(mocks.push).toHaveBeenCalledWith("/b/CASS?tag=a&tag=b");
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
                releaseIds: [],
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

    expect(mocks.push).toHaveBeenCalledWith("/b/CASS?tag=a&tag=b");
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

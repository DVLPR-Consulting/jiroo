import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/shell/filter-bar";
import { SidebarViews, type SidebarViewRow } from "@/components/shell/sidebar-views";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";
import { OPEN_SAVE_VIEW_EVENT } from "@/components/shell/save-view-event";
import type { ViewState } from "@/lib/items/filter";

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ key: "DEMO" }),
  usePathname: () => "/b/DEMO",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () =>
    new URLSearchParams("view=board&item=DEMO-1&q=old&type=epic&tag=a&tag=b"),
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

const emptyState: ViewState = {
  filters: {
    q: "old",
    types: ["epic"],
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

const savedView: SidebarViewRow = {
  id: "view-1",
  name: "Vue enregistrée",
  backlogId: "backlog-1",
  ownerId: "user-1",
  shared: false,
  displayMode: "list",
  groupBy: "priority",
  filters: {
    q: "saved",
    types: ["tache"],
    statusIds: [],
    priorities: [],
    assignees: [],
    labels: [],
    kind: [],
    underIds: [],
  },
  sort: { field: "title", dir: "asc" },
};

const expectedHref =
  "/b/DEMO?tag=a&tag=b&q=saved&type=tache&group=priority" +
  "&sort=title%3Aasc&view=list&v=view-1";

function renderSubject({ withFilter = false }: { withFilter?: boolean } = {}) {
  return render(
    <ViewUrlStateProvider
      initialEntries={[
        ["view", "board"],
        ["item", "DEMO-1"],
        ["q", "old"],
        ["type", "epic"],
        ["tag", "a"],
        ["tag", "b"],
      ]}
    >
      {withFilter && (
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={[]}
          hierarchy={[]}
          resultCount={1}
        />
      )}
      <SidebarViews
        views={[savedView]}
        userId="user-1"
        backlogs={[
          { id: "backlog-1", key: "DEMO", name: "Démo", color: "#2563eb" },
        ]}
      />
    </ViewUrlStateProvider>,
  );
}

describe("SidebarViews URL authority", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.replace.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("builds a native saved-view href from latest params and closes the item", () => {
    renderSubject();

    expect(screen.getByRole("link", { name: "Vue enregistrée" })).toHaveAttribute(
      "href",
      expectedHref,
    );
  });

  it("cancels an armed query when ordinary navigation selects a saved view", async () => {
    vi.useFakeTimers();
    renderSubject({ withFilter: true });

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "obsolete" },
    });
    fireEvent.click(screen.getByRole("link", { name: "Vue enregistrée" }));
    await act(async () => vi.advanceTimersByTime(300));

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(expectedHref);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps the complete native href for modified navigation without provider push", () => {
    renderSubject();
    const link = screen.getByRole("link", { name: "Vue enregistrée" });

    fireEvent.click(link, { metaKey: true });

    expect(link).toHaveAttribute("href", expectedHref);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("replaces empty saved-view collections with one save line", () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_SAVE_VIEW_EVENT, listener);
    render(
      <ViewUrlStateProvider initialEntries={[["view", "board"]]}>
        <SidebarViews
          views={[]}
          userId="user-1"
          backlogs={[
            { id: "backlog-1", key: "DEMO", name: "Démo", color: "#2563eb" },
          ]}
        />
      </ViewUrlStateProvider>,
    );

    expect(screen.queryByText("Vues perso")).not.toBeInTheDocument();
    expect(screen.queryByText("Vues partagées")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer une vue" }));
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_SAVE_VIEW_EVENT, listener);
  });

  it("lists only the non-empty saved-view groups", () => {
    renderSubject();

    expect(screen.getByText("Vues perso")).toBeInTheDocument();
    expect(screen.queryByText("Vues partagées")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer une vue" })).toBeInTheDocument();
  });
});

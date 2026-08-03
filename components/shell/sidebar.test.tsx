import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/shell/sidebar";
import { SidebarStateProvider } from "@/components/shell/sidebar-state";

vi.mock("next/navigation", () => ({
  useParams: () => ({ key: "CASS" }),
  usePathname: () => "/b/CASS",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("view=board"),
}));

const props = {
  backlogs: [
    { id: "backlog-1", key: "CASS", name: "Pôle civil", color: "#2563eb" },
  ],
  views: [],
  userId: "admin-1",
  user: { name: "Ada Lovelace", email: "ada@example.com", role: "admin" },
  counts: { allByBacklog: { CASS: 42 }, mine: 7, trash: 3 },
};

function renderSidebar() {
  return render(
    <SidebarStateProvider>
      <Sidebar {...props} />
    </SidebarStateProvider>,
  );
}

describe("Sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.sidebar = "open";
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
  });

  it("keeps essential controls accessible when collapsed", () => {
    document.documentElement.dataset.sidebar = "collapsed";
    renderSidebar();

    expect(screen.getByText("CASS")).toBeVisible();
    expect(screen.getByText("Tous les items")).toHaveClass("sr-only");
    expect(screen.getByRole("link", { name: /Tous les items 42/ })).toHaveAttribute(
      "title",
      "Tous les items",
    );
    expect(screen.getByRole("button", { name: "Déplier la barre latérale" })).toHaveAttribute(
      "title",
      "Déplier la barre latérale",
    );
  });
});

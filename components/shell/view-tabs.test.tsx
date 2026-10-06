import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BacklogNavBar, ViewTabs } from "@/components/shell/view-tabs";

const TAB_NAMES = ["Backlog", "Board", "Liste", "Arbre", "Releases", "Rapports"];

function tabs() {
  return within(screen.getByRole("navigation", { name: "Vues du backlog" }))
    .getAllByRole("link");
}

describe("ViewTabs", () => {
  it("links every project view under the backlog key", () => {
    render(<ViewTabs active="reports" backlogKey="CASS" />);

    expect(tabs().map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Backlog", "/b/CASS?view=backlog"],
      ["Board", "/b/CASS?view=board"],
      ["Liste", "/b/CASS?view=list"],
      ["Arbre", "/b/CASS?view=tree"],
      ["Releases", "/b/CASS/releases"],
      ["Rapports", "/b/CASS/reports"],
    ]);
  });

  it.each([
    ["backlog", "Backlog"],
    ["board", "Board"],
    ["list", "Liste"],
    ["tree", "Arbre"],
    ["releases", "Releases"],
    ["reports", "Rapports"],
  ])("marks only the %s tab as the current page", (active, current) => {
    render(<ViewTabs active={active} backlogKey="CASS" />);

    for (const link of tabs()) {
      if (link.textContent === current) {
        expect(link).toHaveAttribute("aria-current", "page");
        expect(link).toHaveClass("bg-[var(--accent-subtle)]");
      } else {
        expect(link).not.toHaveAttribute("aria-current");
        expect(link).not.toHaveClass("bg-[var(--accent-subtle)]");
      }
    }
  });

  it("uses the caller's item-view links when provided", () => {
    render(
      <ViewTabs
        active="board"
        backlogKey="CASS"
        itemViewLink={(view) => ({ href: `/b/CASS?q=auth&view=${view}` })}
      />,
    );

    expect(screen.getByRole("link", { name: "Liste" }))
      .toHaveAttribute("href", "/b/CASS?q=auth&view=list");
    expect(screen.getByRole("link", { name: "Releases" }))
      .toHaveAttribute("href", "/b/CASS/releases");
  });
});

describe("ViewTabs on narrow screens", () => {
  afterEach(() => vi.restoreAllMocks());

  it("scrolls the tab row instead of overflowing, with an inset focus ring", () => {
    render(<ViewTabs active="board" backlogKey="CASS" />);

    expect(screen.getByRole("navigation", { name: "Vues du backlog" }))
      .toHaveClass("max-w-full", "overflow-x-auto");
    for (const link of tabs()) {
      expect(link).toHaveClass(
        "shrink-0",
        "whitespace-nowrap",
        "focus-visible:ring-2",
        "focus-visible:ring-inset",
      );
    }
  });

  it("brings an off-screen current tab into view", () => {
    // Row spans 16–374 px; the current tab sits past its right edge.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const current = this.getAttribute("aria-current") === "page";
        const [left, right] = this.tagName === "NAV" ? [16, 374] : current ? [320, 390] : [0, 0];
        return { left, right } as DOMRect;
      },
    );
    render(<ViewTabs active="reports" backlogKey="CASS" />);

    expect(screen.getByRole("navigation", { name: "Vues du backlog" }).scrollLeft).toBe(16);
  });

  it("leaves the row alone when the current tab is visible", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const [left, right] = this.tagName === "NAV" ? [16, 374] : [20, 80];
        return { left, right } as DOMRect;
      },
    );
    render(<ViewTabs active="backlog" backlogKey="CASS" />);

    expect(screen.getByRole("navigation", { name: "Vues du backlog" }).scrollLeft).toBe(0);
  });
});

describe("BacklogNavBar", () => {
  it("renders only the project tabs, without the item-view controls", () => {
    render(<BacklogNavBar active="releases" backlogKey="CASS" />);

    expect(tabs().map((link) => link.textContent)).toEqual(TAB_NAMES);
    expect(screen.getByRole("link", { name: "Releases" }))
      .toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

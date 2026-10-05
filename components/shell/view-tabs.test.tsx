import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

describe("BacklogNavBar", () => {
  it("renders only the project tabs, without the item-view controls", () => {
    render(<BacklogNavBar active="releases" backlogKey="CASS" />);

    expect(tabs().map((link) => link.textContent)).toEqual(TAB_NAMES);
    expect(screen.getByRole("link", { name: "Releases" }))
      .toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

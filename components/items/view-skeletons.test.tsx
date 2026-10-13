import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  BacklogViewSkeleton,
  DetailPanelSkeleton,
} from "@/components/items/view-skeletons";

function expectHiddenBars(root: ParentNode) {
  const bars = root.querySelectorAll('[data-slot="skeleton"]');
  expect(bars).not.toHaveLength(0);
  for (const bar of bars) expect(bar).toHaveAttribute("aria-hidden", "true");
}

describe("view skeletons", () => {
  it.each([
    ["backlog", "Chargement du backlog", "backlog-skeleton-section", 2],
    ["board", "Chargement du board", "board-skeleton-column", 4],
    ["list", "Chargement de la liste", "list-skeleton-row", 8],
    ["tree", "Chargement de l’arbre", "tree-skeleton-row", 8],
  ] as const)("shapes the %s view and announces « %s »", (view, label, slot, count) => {
    const { container } = render(<BacklogViewSkeleton view={view} />);

    const region = screen.getByRole("status", { name: label });
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveAttribute("data-skeleton", view);
    expect(container.querySelectorAll(`[data-slot="${slot}"]`)).toHaveLength(count);
    // Only the requested view's body: no other view's shape.
    for (const other of [
      "backlog-skeleton-section",
      "board-skeleton-column",
      "list-skeleton-row",
      "tree-skeleton-row",
    ].filter((candidate) => candidate !== slot)) {
      expect(container.querySelector(`[data-slot="${other}"]`)).toBeNull();
    }
    expectHiddenBars(container);
  });

  it("shapes the Liste as shared item rows that wrap instead of a wide table (JIR-93)", () => {
    const { container } = render(<BacklogViewSkeleton view="list" />);
    const rows = container.querySelectorAll('[data-slot="list-skeleton-row"]');

    expect(rows[0]).toHaveStyle({ height: "var(--row-h)" });
    expect(rows[0]).toHaveClass("flex");
    expect(container.querySelector("[class*='min-w-[']")).toBeNull();
    // A left-aligned « Trier : … » strip: five sort buttons, no column headers.
    const sort = container.querySelector('[data-slot="list-skeleton-sort"]')!;
    expect(sort.querySelectorAll('[data-slot="skeleton"].h-5')).toHaveLength(5);
  });

  it("keeps the page header and the filter bar above every view", () => {
    const { container } = render(<BacklogViewSkeleton view="list" />);
    const region = container.firstElementChild!;

    expect(region).toHaveClass("flex", "h-full", "flex-col");
    // Header (breadcrumb, title, actions), then the filter bar, then the body.
    expect(region.children).toHaveLength(3);
    expect(region.children[1]).toHaveClass("border-b", "pb-3");
  });

  it("fills the open detail drawer with a titled, announced placeholder body", () => {
    const { container } = render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DetailPanelSkeleton />
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole("dialog", { name: "Chargement du panneau de détail" }))
      .toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Chargement du panneau de détail" }))
      .toHaveAttribute("aria-busy", "true");
    // No overlay of its own: the drawer frame already provides it.
    expect(container.ownerDocument.querySelectorAll(".fixed.inset-0.bg-black\\/30"))
      .toHaveLength(0);
    for (const bar of container.ownerDocument.querySelectorAll('[data-slot="skeleton"]')) {
      expect(bar).toHaveAttribute("aria-hidden", "true");
    }
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  BoardSkeleton,
  DetailPanelSkeleton,
  ListSkeleton,
} from "@/components/items/view-skeletons";

describe("view skeletons", () => {
  it("preserves the board geometry while announcing its loading state", () => {
    const { container } = render(<BoardSkeleton />);

    expect(screen.getByRole("status", { name: "Chargement du board" })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="board-skeleton-column"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).not.toHaveLength(0);
    for (const bar of container.querySelectorAll('[data-slot="skeleton"]')) {
      expect(bar).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("preserves eight dense list rows while announcing its loading state", () => {
    const { container } = render(<ListSkeleton />);

    expect(screen.getByRole("status", { name: "Chargement de la liste" })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="list-skeleton-row"]')).toHaveLength(8);
    for (const bar of container.querySelectorAll('[data-slot="skeleton"]')) {
      expect(bar).toHaveAttribute("aria-hidden", "true");
    }
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

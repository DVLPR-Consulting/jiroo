import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  it("reserves a 620px detail aside while announcing its loading state", () => {
    const { container } = render(<DetailPanelSkeleton />);

    const detailAside = screen.getByRole("complementary", {
      name: "Chargement du panneau de détail",
    });
    expect(detailAside).toHaveClass("w-[620px]");
    for (const bar of container.querySelectorAll('[data-slot="skeleton"]')) {
      expect(bar).toHaveAttribute("aria-hidden", "true");
    }
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ViewBar } from "@/components/shell/view-bar";

vi.mock("@/components/shell/view-url-state", () => ({
  useViewUrlState: () => ({ href: () => "/b/CASS?view=board", push: vi.fn() }),
}));

vi.mock("@/components/theme/density-toggle", () => ({
  DensityToggle: () => <button type="button">Densité</button>,
}));

describe("ViewBar", () => {
  it("wraps secondary controls while keeping creation in the primary cluster", () => {
    const { container } = render(
      <ViewBar
        view="board"
        groupControlSlot={<button type="button">Grouper</button>}
        viewActionsSlot={<button type="button">Vues</button>}
        newItemSlot={<button type="button">Nouvel item</button>}
      />,
    );

    expect(container.firstElementChild).toHaveClass("flex-wrap", "min-h-[46px]");
    expect(screen.getByRole("button", { name: "Grouper" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Vues" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Nouvel item" }).closest(
      '[data-slot="primary-actions"]',
    )).not.toBeNull();
  });
});

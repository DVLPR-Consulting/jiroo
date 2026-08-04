import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrashList } from "@/components/items/trash-list";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

describe("TrashList", () => {
  it("explains an empty trash and links back to the backlogs", () => {
    render(<TrashList groups={[]} />);

    expect(screen.getByRole("heading", { name: "Corbeille vide" })).toBeInTheDocument();
    expect(
      screen.getByText("Les items supprimés apparaîtront ici pendant 30 jours."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir les backlogs" })).toHaveAttribute("href", "/");
  });
});

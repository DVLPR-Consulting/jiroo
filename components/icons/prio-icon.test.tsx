import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrioIcon } from "@/components/icons/prio-icon";

describe("PrioIcon", () => {
  it("expose un libellé accessible", () => {
    render(<PrioIcon priority={4} />);
    expect(screen.getByRole("img", { name: "Urgent" })).toBeInTheDocument();
  });

  it("affiche un « ! » pour urgent", () => {
    render(<PrioIcon priority={4} />);
    expect(screen.getByText("!")).toBeInTheDocument();
  });

  it("colore 2 barres sur 3 pour la priorité moyenne", () => {
    const { container } = render(<PrioIcon priority={2} />);
    const colored = container.querySelectorAll('[data-on="true"]');
    expect(colored).toHaveLength(2);
  });
});

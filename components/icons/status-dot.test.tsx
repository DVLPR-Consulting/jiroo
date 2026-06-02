import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusDot } from "@/components/icons/status-dot";

describe("StatusDot", () => {
  it("expose un libellé accessible par statut", () => {
    render(<StatusDot status="doing" />);
    expect(screen.getByRole("img", { name: "En cours" })).toBeInTheDocument();
  });

  it("rend une coche pour le statut terminé", () => {
    const { container } = render(<StatusDot status="done" />);
    expect(container.querySelector("polyline")).toBeInTheDocument();
  });
});

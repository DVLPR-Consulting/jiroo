import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InitialsAvatar } from "@/components/jiroo/avatar";

describe("InitialsAvatar", () => {
  it("dérive les initiales d'un nom complet", () => {
    render(<InitialsAvatar name="Marie Dupont" hue={3} />);
    expect(screen.getByText("MD")).toBeInTheDocument();
  });

  it("gère un nom à un seul mot", () => {
    render(<InitialsAvatar name="Sócrate" hue={1} />);
    expect(screen.getByText("SÓ")).toBeInTheDocument();
  });
});

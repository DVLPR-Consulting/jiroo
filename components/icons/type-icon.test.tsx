import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TypeIcon } from "@/components/icons/type-icon";

describe("TypeIcon", () => {
  it.each([
    ["composant", "Composant"],
    ["epic", "Epic"],
    ["tache", "Tâche"],
    ["soustache", "Sous-tâche"],
  ] as const)("exposes accessible label for %s", (type, label) => {
    render(<TypeIcon type={type} />);
    expect(screen.getByRole("img", { name: label })).toBeInTheDocument();
  });

  it("composant renders a hollow rect with grid lines (path)", () => {
    const { container } = render(<TypeIcon type="composant" />);
    expect(container.querySelector("rect")).toBeInTheDocument();
    // Grid lines via <path>
    expect(container.querySelector("path")).toBeInTheDocument();
  });

  it("epic renders a diamond path (no rect)", () => {
    const { container } = render(<TypeIcon type="epic" />);
    expect(container.querySelector("rect")).toBeNull();
    const path = container.querySelector("path");
    expect(path).toBeInTheDocument();
    // Diamond path starts at M8 1.6
    expect(path?.getAttribute("d")).toContain("1.6");
  });

  it("tache renders a filled rect with a white check path", () => {
    const { container } = render(<TypeIcon type="tache" />);
    expect(container.querySelector('rect[fill="var(--type-info)"]')).toBeInTheDocument();
    const path = container.querySelector('path[stroke="white"]');
    expect(path).toBeInTheDocument();
  });

  it("soustache renders an L-branch path and a hollow rect", () => {
    const { container } = render(<TypeIcon type="soustache" />);
    // Hollow rect (no fill)
    const rect = container.querySelector('rect[fill="none"]');
    expect(rect).toBeInTheDocument();
    // L-branch path
    expect(container.querySelector("path")).toBeInTheDocument();
  });

  it("accepts a custom size prop", () => {
    const { container } = render(<TypeIcon type="epic" size={20} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusDot } from "@/components/icons/status-dot";

describe("StatusDot", () => {
  it("exposes an accessible label per status", () => {
    render(<StatusDot status="doing" />);
    expect(screen.getByRole("img", { name: "En cours" })).toBeInTheDocument();
  });

  it("todo renders a dashed circle (no filled arc)", () => {
    const { container } = render(<StatusDot status="todo" />);
    const circle = container.querySelector("circle");
    expect(circle).toBeInTheDocument();
    expect(circle?.getAttribute("stroke-dasharray")).toBeTruthy();
    // No second circle (arc) for todo
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("doing renders two circles (ghost ring + arc)", () => {
    const { container } = render(<StatusDot status="doing" />);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("review renders two circles (ghost ring + arc)", () => {
    const { container } = render(<StatusDot status="review" />);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("done renders a filled disc with a white check path", () => {
    const { container } = render(<StatusDot status="done" />);
    // Filled disc circle
    expect(container.querySelector('circle[fill="var(--status-done)"]')).toBeInTheDocument();
    // White checkmark path
    const path = container.querySelector('path[stroke="white"]');
    expect(path).toBeInTheDocument();
    expect(path?.getAttribute("d")).toContain("4.3");
  });

  it("accepts a custom size prop", () => {
    const { container } = render(<StatusDot status="todo" size={20} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
  });
});

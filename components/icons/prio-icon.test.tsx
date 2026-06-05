import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrioIcon } from "@/components/icons/prio-icon";

describe("PrioIcon", () => {
  it("exposes an accessible label", () => {
    render(<PrioIcon priority={4} />);
    expect(screen.getByRole("img", { name: "Urgent" })).toBeInTheDocument();
  });

  it("urgent renders a filled rect and a circle dot — no <text>", () => {
    const { container } = render(<PrioIcon priority={4} />);
    // Filled rounded rect
    expect(container.querySelector('rect[fill="var(--prio-urgent)"]')).toBeInTheDocument();
    // White dot circle
    expect(container.querySelector('circle[fill="white"]')).toBeInTheDocument();
    // No <text> element (handoff uses a rect+circle, not a text glyph)
    expect(container.querySelector("text")).toBeNull();
  });

  it("none renders 3 grey circles", () => {
    const { container } = render(<PrioIcon priority={0} />);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
  });

  it("low lights 1 of 3 bars", () => {
    const { container } = render(<PrioIcon priority={1} />);
    expect(container.querySelectorAll('[data-on="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-on="false"]')).toHaveLength(2);
  });

  it("medium lights 2 of 3 bars", () => {
    const { container } = render(<PrioIcon priority={2} />);
    expect(container.querySelectorAll('[data-on="true"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-on="false"]')).toHaveLength(1);
  });

  it("high lights all 3 bars", () => {
    const { container } = render(<PrioIcon priority={3} />);
    expect(container.querySelectorAll('[data-on="true"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-on="false"]')).toHaveLength(0);
  });

  it("accepts a custom size prop", () => {
    const { container } = render(<PrioIcon priority={2} size={20} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
  });
});

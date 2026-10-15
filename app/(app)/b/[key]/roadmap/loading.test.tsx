import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RoadmapLoading from "@/app/(app)/b/[key]/roadmap/loading";

describe("RoadmapLoading", () => {
  it("announces the roadmap loading state with a timeline rather than a backlog", () => {
    const { container } = render(<RoadmapLoading />);
    const region = screen.getByRole("status", { name: "Chargement de la roadmap" });
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveAttribute("data-skeleton", "roadmap");
    expect(container.querySelector('[data-skeleton="backlog"]')).toBeNull();
    expect(container.querySelector('[data-slot="roadmap-skeleton-toolbar"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-slot="roadmap-skeleton-row"]').length).toBeGreaterThan(1);
    for (const bar of container.querySelectorAll('[data-slot="skeleton"]')) {
      expect(bar).toHaveAttribute("aria-hidden", "true");
    }
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

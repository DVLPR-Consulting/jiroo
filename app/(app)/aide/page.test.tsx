import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HelpPage from "@/app/(app)/aide/page";
import { GUIDE_SECTIONS } from "@/components/help/guide-sections";

describe("HelpPage", () => {
  it("renders the guide title and every section heading", () => {
    render(<HelpPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Guide d’utilisation" }),
    ).toBeInTheDocument();
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(
      GUIDE_SECTIONS.map((section, index) => `${index + 1}.${section.title}`),
    );
    expect(GUIDE_SECTIONS.map((section) => section.title)).toEqual([
      "Démarrer",
      "Organisation",
      "Les vues",
      "Tickets",
      "Sprints",
      "Releases",
      "Rapports",
      "Recherche, notifications et raccourcis",
      "Rôles et droits",
      "Environnement de test",
    ]);
  });

  it("points every table-of-contents link at an existing section", () => {
    const { container } = render(<HelpPage />);

    const toc = screen.getByRole("navigation", { name: "Sommaire du guide" });
    const links = within(toc).getAllByRole("link");
    // Same entries twice: collapsible (mobile) and sticky (desktop) variants.
    expect(links).toHaveLength(GUIDE_SECTIONS.length * 2);
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      expect(href).toMatch(/^#/);
      const target = container.querySelector(href);
      expect(target?.tagName).toBe("SECTION");
      expect(target).toHaveAccessibleName(link.textContent ?? "");
    }
  });

  it("explains each topic with its purpose and steps", () => {
    render(<HelpPage />);

    expect(screen.getAllByText("À quoi ça sert —").length).toBeGreaterThan(20);
    expect(screen.getAllByText("Comment faire").length).toBeGreaterThan(15);
  });
});

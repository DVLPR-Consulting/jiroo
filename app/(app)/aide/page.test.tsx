import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HelpPage from "@/app/(app)/aide/page";
import { GUIDE_SECTIONS } from "@/components/help/guide-sections";
import { SHORTCUTS, shortcutText } from "@/lib/shortcuts/registry";

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

  it("lists every registry shortcut and how to turn single-key shortcuts off", () => {
    render(<HelpPage />);

    const shortcuts = within(
      screen.getByRole("region", { name: /Recherche, notifications et raccourcis/ }),
    );
    for (const shortcut of SHORTCUTS) {
      expect(shortcuts.getByText(shortcut.label)).toBeInTheDocument();
      expect(shortcuts.getAllByText(shortcutText(shortcut)).length).toBeGreaterThan(0);
    }
    expect(shortcuts.getAllByText(/Raccourcis à une touche/).length).toBeGreaterThan(0);
  });

  it("explains each topic with its purpose and steps", () => {
    render(<HelpPage />);

    expect(screen.getAllByText("À quoi ça sert —").length).toBeGreaterThan(20);
    expect(screen.getAllByText("Comment faire").length).toBeGreaterThan(15);
  });

  it("documents the rich-text editor (JIR-66)", () => {
    render(<HelpPage />);
    const tickets = document.querySelector("section#tickets") as HTMLElement;
    const topic = within(tickets).getByRole("heading", { level: 3, name: "Mise en forme du texte" })
      .closest("article, div, section") as HTMLElement;
    for (const label of ["Titre 2", "Gras", "Liste de tâches", "Bloc de code", "Lien", "Rétablir la modification"]) {
      expect(within(tickets).getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
    }
    expect(topic).toHaveTextContent("Markdown brut");
    expect(within(tickets).getByText(/Modifier la description|cliquez dans la description/i)).toBeVisible();
  });

  it("documents the item drawer and the create screen (JIR-73)", () => {
    render(<HelpPage />);
    const tickets = document.querySelector("section#tickets") as HTMLElement;
    for (const label of [
      "Item précédent (K)",
      "Item suivant (J)",
      "Copier le lien",
      "Plus d’actions",
      "Historique",
      "Plus récents",
      "Lier un item",
      "Copier le nom de branche",
      "Créer un autre",
      "M’assigner",
    ]) {
      expect(within(tickets).getAllByText(`« ${label} »`).length, label).toBeGreaterThan(0);
    }
    expect(tickets).not.toHaveTextContent("Onglet Commentaires");
  });
});

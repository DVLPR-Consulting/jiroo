import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HelpPage from "@/app/(app)/aide/page";
import { GUIDE_SECTIONS } from "@/components/help/guide-sections";
import { SHORTCUTS, shortcutText } from "@/lib/shortcuts/registry";

vi.mock("@/components/shell/shell-breadcrumb", () => ({
  ShellBreadcrumb: () => <nav aria-label="Fil d’Ariane" />,
}));

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

  it("opens the Tickets section with the first steps of a new backlog (JIR-88)", () => {
    render(<HelpPage />);
    const tickets = document.querySelector("section#tickets") as HTMLElement;
    const topics = within(tickets).getAllByRole("heading", { level: 3 });
    expect(topics[0]).toHaveTextContent("Démarrer dans un nouveau backlog");
    const topic = topics[0]!.closest("div") as HTMLElement;
    for (const label of [
      "Commencez par créer un Composant (un domaine ou un produit)",
      "Nouveau Composant",
      "Créez une Epic dans un Composant",
      "Nouvelle Epic",
      "Nouvel item",
      "Créer un item",
      "Epic parent",
      "Ce backlog est vide",
      "Aucune Epic pour l’instant",
    ]) {
      expect(topic).toHaveTextContent(`« ${label} »`);
    }
    expect(topic).toHaveTextContent("une Tâche se rattache toujours à une Epic");
  });

  it("explains how « Nouvel item » creates a missing parent first (JIR-91)", () => {
    render(<HelpPage />);
    const tickets = document.querySelector("section#tickets") as HTMLElement;
    const topic = within(tickets)
      .getByRole("heading", { level: 3, name: "Démarrer dans un nouveau backlog" })
      .closest("div") as HTMLElement;
    for (const label of ["Créer un Composant", "Créer une Epic", "Créer une Tâche", "Parent"]) {
      expect(topic).toHaveTextContent(`« ${label} »`);
    }
    expect(topic).toHaveTextContent("en gardant le titre et la description saisis");
  });

  it("explains that « Créer » points at a missing parent (JIR-69)", () => {
    render(<HelpPage />);
    const tickets = document.querySelector("section#tickets") as HTMLElement;
    const topicOf = (name: string) =>
      within(tickets).getByRole("heading", { level: 3, name }).closest("div") as HTMLElement;
    const create = topicOf("Créer un ticket");
    expect(create).toHaveTextContent("le « Parent » obligatoire (marqué d’un astérisque");
    expect(create).toHaveTextContent(
      "une Epic se rattache à un Composant, une Tâche à une Epic, une Sous-tâche à une Tâche",
    );
    expect(create).toHaveTextContent(
      "Sans parent choisi, « Créer » ne crée rien : le message « Parent obligatoire : choisissez une Epic. » apparaît sous le champ « Parent », qui reçoit le focus.",
    );
    expect(topicOf("Créer une tâche depuis le Backlog")).toHaveTextContent(
      "Sans epic choisie, « Choisissez l’epic parent. » s’affiche et le champ « Epic parent » reçoit le focus.",
    );
  });

  it("explains that a Version filter no longer hides the parents at creation (JIR-92)", () => {
    render(<HelpPage />);
    const tickets = document.querySelector("section#tickets") as HTMLElement;
    const topic = within(tickets)
      .getByRole("heading", { level: 3, name: "Démarrer dans un nouveau backlog" })
      .closest("div") as HTMLElement;
    expect(topic).toHaveTextContent(
      "Sous un filtre Version, « Nouvel item » et « Créer un item » proposent tous les parents du backlog, même ceux que le filtre masque.",
    );
    expect(topic).toHaveTextContent("Un ticket créé sans cette version n’apparaît pas dans la vue filtrée");
    expect(topic).toHaveTextContent("« CASS-7 créé — masqué par les filtres de la vue. » le signale, avec « Ouvrir »");
    expect(topic).not.toHaveTextContent("si le filtre les masque");
  });

  it("documents the shared row and the Liste sort header and columns (JIR-93)", () => {
    render(<HelpPage />);
    const views = document.querySelector("section#vues") as HTMLElement;
    expect(views).not.toHaveTextContent("colonnes triables");
    expect(views).toHaveTextContent("en lignes du Backlog ; la barre « Trier » au-dessus des lignes pour trier");
    expect(views).not.toHaveTextContent("bandeau d’en-tête");
    const row = within(views)
      .getByRole("heading", { level: 3, name: "Lire une ligne du Backlog" })
      .closest("div") as HTMLElement;
    expect(row).toHaveTextContent("« Mes items », « Corbeille » (avec la date de suppression et « Restaurer »)");
    const sorting = within(views)
      .getByRole("heading", { level: 3, name: "Trier la Liste et choisir ses colonnes" })
      .closest("div") as HTMLElement;
    for (const label of ["Trier", "Clé", "Titre", "Échéance", "Priorité", "Statut", "Colonnes", "Labels", "Fix versions"]) {
      expect(sorting).toHaveTextContent(`« ${label} »`);
    }
    expect(sorting).toHaveTextContent("enregistrés avec une vue");
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
  });

  it("documents saving the 2FA recovery codes (JIR-86)", () => {
    render(<HelpPage />);
    const start = document.querySelector("section#demarrer") as HTMLElement;
    const topic = within(start)
      .getByRole("heading", { level: 3, name: "Configurer la double authentification (premier login)" })
      .closest("article, div, section") as HTMLElement;
    for (const label of [
      "Copier les codes",
      "Télécharger (.txt)",
      "J'ai enregistré mes codes de récupération",
      "Activer et continuer",
    ]) {
      expect(topic).toHaveTextContent(label);
    }
    expect(topic).toHaveTextContent("Ne partagez ni ces codes ni la clé manuelle");
  });

  it("documents the in-place description (JIR-71)", () => {
    render(<HelpPage />);
    const tickets = document.querySelector("section#tickets") as HTMLElement;
    const topic = within(tickets).getByRole("heading", { level: 3, name: "Écrire la description" })
      .closest("article, div, section") as HTMLElement;
    for (const label of [
      "Écrivez, ou tapez « / » pour insérer un bloc…",
      "Enregistrement…",
      "Enregistré",
      "Échec de l’enregistrement",
      "Réessayer",
      "Titre 1",
      "Séparateur",
      "Italique",
      "Code",
      "Lecteur",
    ]) {
      expect(topic).toHaveTextContent(`« ${label} »`);
    }
    expect(topic).toHaveTextContent("lecture seule");
    // JIR-71: unsaved text survives closing the drawer, not a page reload.
    expect(topic).toHaveTextContent("en revenant sur le ticket");
    expect(topic).toHaveTextContent("demande confirmation avant de quitter ou de recharger la page");
    expect(topic).toHaveTextContent("Se déconnecter quand même ?");
    expect(tickets).not.toHaveTextContent("Ajouter une description");
    expect(tickets).not.toHaveTextContent("Éditer");
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

  it("documents the backlogs home, favourites and the backlog lead (JIR-82)", () => {
    render(<HelpPage />);
    const organisation = document.querySelector("section#organisation") as HTMLElement;
    const topic = within(organisation)
      .getByRole("heading", { level: 3, name: "Retrouver ses backlogs" })
      .closest("article, div, section") as HTMLElement;
    for (const label of ["Tous les backlogs", "Aucun sprint actif", "Ajouter aux favoris", "Retirer des favoris"]) {
      expect(topic).toHaveTextContent(`« ${label} »`);
    }
    const rights = document.querySelector("section#droits") as HTMLElement;
    expect(rights).toHaveTextContent("« Responsable »");
  });

  it("documents the Board columns shown without an active sprint (JIR-89)", () => {
    render(<HelpPage />);
    const views = document.querySelector("section#vues") as HTMLElement;
    expect(views).toHaveTextContent(
      "Sans sprint actif, le bandeau « Aucun sprint actif » et son lien « Voir le Backlog » surmontent les colonnes, vides et sans glisser-déposer.",
    );
  });

  it("documents the Sprint filter and where completed sprints go (JIR-81)", () => {
    render(<HelpPage />);
    const views = document.querySelector("section#vues") as HTMLElement;
    expect(views).toHaveTextContent("« Version », « Sprint » et « Nature », sont derrière « + Filtre »");
    expect(views).toHaveTextContent("sprints terminés");
    expect(views).toHaveTextContent("« Aucun sprint »");
    const sprints = document.querySelector("section#sprints") as HTMLElement;
    expect(sprints).toHaveTextContent("Un sprint terminé disparaît du Backlog et du Board");
    expect(sprints).toHaveTextContent("« Rapports » → « Rapport de sprint »");
    expect(sprints).toHaveTextContent("« + Filtre » → « Sprint »");
  });

  it("documents that « Tous les items » opens the unfiltered Liste (JIR-94)", () => {
    render(<HelpPage />);
    const organisation = document.querySelector("section#organisation") as HTMLElement;
    expect(organisation).toHaveTextContent(
      "« Tous les items » affiche la liste de tous les tickets du backlog courant, sans filtre (vue « Liste » ; le compteur en donne le nombre)",
    );
  });

  it("explains connecting a GitHub or GitLab repository (JIR-95)", () => {
    render(<HelpPage />);
    const tickets = document.querySelector("section#tickets") as HTMLElement;
    const topic = within(tickets)
      .getByRole("heading", { level: 3, name: "Connecter un dépôt GitHub ou GitLab" })
      .closest("div") as HTMLElement;
    for (const label of [
      "Développement",
      "Connecter un dépôt",
      "URL de l’instance GitLab",
      "Connecter le dépôt",
      "URL du webhook",
      "Secret du webhook",
      "J’ai copié le secret",
      "Ouverte",
      "Fusionnée",
      "Fermée",
      "Voir tout",
      "Régénérer le secret",
      "Désactiver",
      "Supprimer",
    ]) {
      expect(topic).toHaveTextContent(`« ${label} »`);
    }
    expect(topic).toHaveTextContent("le secret n’est affiché qu’une fois");
    expect(topic).toHaveTextContent("aucun jeton d’accès, aucune requête vers GitHub ou GitLab");
    expect(topic).toHaveTextContent("elles peuvent alors être retirées une à une");
    expect(tickets).not.toHaveTextContent("aucune synchronisation automatique");
    const rights = document.querySelector("section#droits") as HTMLElement;
    expect(rights).toHaveTextContent("« Développement » pour connecter des dépôts GitHub ou GitLab");
  });
});

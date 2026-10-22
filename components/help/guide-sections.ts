/** Table of contents of the /aide user guide: anchor id and heading. */
export const GUIDE_SECTIONS = [
  { id: "demarrer", title: "Démarrer" },
  { id: "organisation", title: "Organisation" },
  { id: "le-point", title: "Le point" },
  { id: "vues", title: "Les vues" },
  { id: "tickets", title: "Tickets" },
  { id: "collaboration", title: "Travailler à plusieurs" },
  { id: "sprints", title: "Sprints" },
  { id: "roadmap", title: "Roadmap" },
  { id: "releases", title: "Releases" },
  { id: "rapports", title: "Rapports" },
  { id: "recherche", title: "Recherche, notifications et raccourcis" },
  { id: "droits", title: "Rôles et droits" },
  { id: "recette", title: "Environnement de test" },
] as const;

export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]["id"];

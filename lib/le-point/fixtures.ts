import type { LePointDataset } from "@/lib/le-point/model";

/**
 * The fictional DEMO backlog of the « Le point » prototype (JIR-107), as
 * validated on 2026-10-20: every case has an expected answer in the Linear
 * document « JIR-107 — Le point : cas fictifs et conception ». Dates are
 * frozen so the answers never drift. Sprint 8's points and membership feed
 * the lights of the JIR-124 proof of concept: 43 points in scope, 18 done.
 */
export const LE_POINT_DEMO: LePointDataset = {
  today: "2026-11-03",
  lastVisit: "2026-10-28",
  backlog: { key: "DEMO", name: "DÉMO — Portail des décisions" },
  people: [
    { id: "camille", name: "Camille Morel" },
    { id: "ines", name: "Inès Garnier" },
    { id: "hugo", name: "Hugo Lefèvre" },
    { id: "lea", name: "Léa Martin" },
  ],
  personas: { developer: "camille", product: "ines" },
  sprint: { name: "Sprint 8", start: "2026-10-27", end: "2026-11-07" },
  releases: [
    { name: "1.2", planned: "2026-10-20", released: "2026-10-20" },
    { name: "1.3", planned: "2026-11-14", released: null },
  ],
  objectives: [
    { key: "DEMO-2", title: "Publier les arrêts en ligne", due: "2026-11-14", release: "1.3" },
    { key: "DEMO-3", title: "Recherche avancée", due: null, release: "1.3" },
    { key: "DEMO-5", title: "Notifications aux greffes", due: null, release: null },
  ],
  tickets: [
    // DEMO-2: 5 done, 2 in progress, 1 blocked, and the open decision.
    { key: "DEMO-12", title: "Générer le PDF signé d’un arrêt", objective: "DEMO-2", status: "En cours", category: "in_progress", assignee: "camille", due: "2026-11-05", lastActivity: "2026-11-02", points: 5, inSprint: true },
    { key: "DEMO-15", title: "Afficher l’arrêt publié", objective: "DEMO-2", status: "À faire", category: "todo", assignee: "camille", due: "2026-11-12", blockedBy: [{ key: "DEMO-9" }], lastActivity: "2026-10-30", points: 3, inSprint: true },
    { key: "DEMO-27", title: "Mettre en page la liste", objective: "DEMO-2", status: "En cours", category: "in_progress", assignee: "lea", due: null, lastActivity: null, activityUnknownSince: "2026-10-20", points: 3, inSprint: true },
    { key: "DEMO-25", title: "Corriger l’en-tête", objective: "DEMO-2", status: "Terminé", category: "done", assignee: "camille", due: null, done: "2026-11-02", lastActivity: "2026-11-02", points: 2, inSprint: true },
    { key: "DEMO-6", title: "Modèle de données des arrêts", objective: "DEMO-2", status: "Terminé", category: "done", assignee: "hugo", due: null, done: "2026-10-14", lastActivity: "2026-10-14", points: 3 },
    { key: "DEMO-7", title: "Import des arrêts existants", objective: "DEMO-2", status: "Terminé", category: "done", assignee: "lea", due: null, done: "2026-10-17", lastActivity: "2026-10-17", points: 5 },
    { key: "DEMO-8", title: "Page de consultation", objective: "DEMO-2", status: "Terminé", category: "done", assignee: "camille", due: null, done: "2026-10-22", lastActivity: "2026-10-22", points: 5 },
    { key: "DEMO-10", title: "Anonymisation des noms", objective: "DEMO-2", status: "Terminé", category: "done", assignee: "hugo", due: null, done: "2026-10-24", lastActivity: "2026-10-24", points: 2 },
    { key: "DEMO-31", title: "Format de publication : PDF ou HTML ?", objective: "DEMO-2", status: "À faire", category: "todo", assignee: "ines", due: "2026-11-07", lastActivity: "2026-10-30", points: 1, inSprint: true },
    // The dependency of DEMO-15, outside the objectives.
    { key: "DEMO-9", title: "API de signature électronique", objective: null, status: "En cours", category: "in_progress", assignee: "hugo", due: null, lastActivity: "2026-11-01", points: 8, inSprint: true },
    // DEMO-3: every task done, release 1.3 not published.
    { key: "DEMO-18", title: "Index de recherche", objective: "DEMO-3", status: "Terminé", category: "done", assignee: "camille", due: null, done: "2026-10-30", blockedBy: [{ key: "DEMO-4" }], lastActivity: "2026-10-30", points: 8, inSprint: true },
    { key: "DEMO-4", title: "Moteur de recherche plein texte", objective: "DEMO-3", status: "Terminé", category: "done", assignee: "hugo", due: null, done: "2026-10-29", lastActivity: "2026-10-29", points: 8, inSprint: true },
    { key: "DEMO-19", title: "Filtres par juridiction", objective: "DEMO-3", status: "Terminé", category: "done", assignee: "lea", due: null, done: "2026-10-23", lastActivity: "2026-10-23", points: 3 },
    { key: "DEMO-20", title: "Tri par date", objective: "DEMO-3", status: "Terminé", category: "done", assignee: "lea", due: null, done: "2026-10-21", lastActivity: "2026-10-21", points: 2 },
    // DEMO-5: nothing done yet.
    { key: "DEMO-30", title: "Gabarit de courriel", objective: "DEMO-5", status: "À faire", category: "todo", assignee: null, due: null, lastActivity: "2026-10-27" },
    // Added to the sprint after its start.
    { key: "DEMO-33", title: "Habilitations greffe", objective: "DEMO-5", status: "À faire", category: "todo", assignee: "lea", due: null, blockedBy: [{ hidden: true }], lastActivity: "2026-10-29", points: 2, inSprint: true, addedAfterStart: true },
    { key: "DEMO-34", title: "Choix des événements notifiés", objective: "DEMO-5", status: "À faire", category: "todo", assignee: "lea", due: null, lastActivity: "2026-10-26", points: 2, inSprint: true },
    // Camille's other tasks.
    { key: "DEMO-21", title: "Corriger l’export CSV", objective: null, status: "À faire", category: "todo", assignee: "camille", due: "2026-10-28", lastActivity: "2026-10-20", points: 1, inSprint: true },
    { key: "DEMO-22", title: "Nettoyer les journaux", objective: null, status: "À faire", category: "todo", assignee: "camille", due: null, lastActivity: "2026-10-19" },
  ],
  mentions: [
    {
      ticket: "DEMO-31",
      author: "hugo",
      mentioned: "ines",
      day: "2026-10-30",
      text: "@Inès Garnier, il faut choisir le format avant de finir DEMO-15.",
    },
  ],
};

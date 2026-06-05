// Énumérations et libellés FR du domaine Jiroo. Source de vérité pour l'UI.
// Les couleurs réfèrent aux variables CSS définies dans app/globals.css.

export const ITEM_TYPES = ["composant", "epic", "tache", "soustache"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  composant: "Composant",
  epic: "Epic",
  tache: "Tâche",
  soustache: "Sous-tâche",
};

export const STATUS_IDS = ["todo", "doing", "review", "done"] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export const STATUS_LABELS: Record<StatusId, string> = {
  todo: "À faire",
  doing: "En cours",
  review: "En revue",
  done: "Terminé",
};

// Catégorie sémantique (sert à poser closed_at côté DB plus tard).
export const STATUS_CATEGORY: Record<StatusId, "todo" | "in_progress" | "done"> = {
  todo: "todo",
  doing: "in_progress",
  review: "in_progress",
  done: "done",
};

// Priorités : 0 = aucune … 4 = urgent (numérique pour le tri).
export const PRIORITIES = [0, 1, 2, 3, 4] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  0: "Aucune",
  1: "Basse",
  2: "Moyenne",
  3: "Haute",
  4: "Urgent",
};

// Item kinds: orthogonal to the hierarchy type. Bug vs feature classification.
export const ITEM_KINDS = ["feature", "bug"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  feature: "Fonctionnalité",
  bug: "Bug",
};

// 6 teintes de labels harmonisées (cf. handoff).
export const LABEL_HUES = [1, 2, 3, 4, 5, 6] as const;
export type LabelHue = (typeof LABEL_HUES)[number];
export const LABEL_COLOR_VAR: Record<LabelHue, string> = {
  1: "--label-1",
  2: "--label-2",
  3: "--label-3",
  4: "--label-4",
  5: "--label-5",
  6: "--label-6",
};

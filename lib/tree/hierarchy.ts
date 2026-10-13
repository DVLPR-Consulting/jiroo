import type { ItemType } from "@/lib/design/constants";

const PARENT_OF: Record<ItemType, ItemType | null> = {
  composant: null,
  epic: "composant",
  tache: "epic",
  soustache: "tache",
};

export function allowedParentType(type: ItemType): ItemType | null {
  return PARENT_OF[type];
}

export function isValidParenting(child: ItemType, parent: ItemType | null): boolean {
  return allowedParentType(child) === parent;
}

/**
 * The next level a backlog needs before tasks can be created: a Composant
 * first, then an Epic inside it (a Tâche always hangs under an Epic). `null`
 * once an Epic exists. Drives the guided empty states of the backlog views.
 */
export type HierarchyStartStep = "composant" | "epic";

export function hierarchyStartStep(items: { type: ItemType }[]): HierarchyStartStep | null {
  // An Epic is all a task needs (and always sits under a Composant).
  if (items.some((item) => item.type === "epic")) return null;
  return items.some((item) => item.type === "composant") ? "epic" : "composant";
}

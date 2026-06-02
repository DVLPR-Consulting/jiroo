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

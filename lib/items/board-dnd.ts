import {
  closestCorners,
  pointerWithin,
  type Announcements,
  type CollisionDetection,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";

export const BOARD_AUTO_SCROLL = {
  acceleration: 5,
  interval: 10,
  threshold: { x: 0.05, y: 0.1 },
} as const;

export const BOARD_SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    "Pour sélectionner une carte, appuyez sur Espace. Utilisez ensuite les flèches pour la déplacer. Appuyez de nouveau sur Espace pour la déposer, ou sur Échap pour annuler.",
};

export const boardCollisionDetection: CollisionDetection = (args) => {
  if (args.pointerCoordinates) {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
  }
  return closestCorners(args);
};

export function restoreCancelledColumns<T>(snapshot: T | null, current: T): T {
  return snapshot ?? current;
}

export function boardDragDisabled(canWrite: boolean, pendingMutations: number): boolean {
  return !canWrite || pendingMutations > 0;
}

export function createBoardAnnouncements(
  itemLabels: ReadonlyMap<string, string>,
  destinationLabels: ReadonlyMap<string, string>,
): Announcements {
  const itemLabel = (id: string | number) => itemLabels.get(String(id)) ?? "Carte";
  const destinationLabel = (id: string | number) =>
    destinationLabels.get(String(id)) ?? "la zone sélectionnée";

  return {
    onDragStart({ active }) {
      return `${itemLabel(active.id)} sélectionné. Utilisez les flèches pour le déplacer.`;
    },
    onDragOver({ active, over }) {
      if (!over) return `${itemLabel(active.id)} n’est plus au-dessus d’une colonne.`;
      return `${itemLabel(active.id)} déplacé vers ${destinationLabel(over.id)}.`;
    },
    onDragEnd({ active, over }) {
      if (!over) return `${itemLabel(active.id)} déposé à sa position d’origine.`;
      return `${itemLabel(active.id)} déposé dans ${destinationLabel(over.id)}.`;
    },
    onDragCancel({ active }) {
      return `Déplacement de ${itemLabel(active.id)} annulé. Position d’origine restaurée.`;
    },
  };
}

import {
  closestCenter,
  pointerWithin,
  type Collision,
  type CollisionDetection,
} from "@dnd-kit/core";

function isSectionCollision(collision: Collision): boolean {
  return String(collision.id).startsWith("section:");
}

export function prioritizeSprintPointerCollisions(
  pointerCollisions: Collision[],
  fallbackCollisions: Collision[],
): Collision[] {
  if (pointerCollisions.length === 0) return fallbackCollisions;
  const preciseItem = pointerCollisions.find(
    (collision) => !isSectionCollision(collision),
  );
  return [preciseItem ?? pointerCollisions[0]!];
}

export const sprintBacklogCollisionDetection: CollisionDetection = (args) =>
  prioritizeSprintPointerCollisions(pointerWithin(args), closestCenter(args));

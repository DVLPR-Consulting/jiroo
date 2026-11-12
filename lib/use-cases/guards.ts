import "server-only";
import {
  requireItemPermission,
  type AuthorizedResource,
} from "@/lib/auth/action-authorization";
import {
  checkPermission,
  PermissionDeniedError,
  ResourceNotFoundError,
} from "@/lib/auth/authorization";

/**
 * Authorization guards shared by the use cases and the Server Actions that
 * have not moved to a use case yet (JIR-155). They complete the resource
 * checks of `lib/auth/action-authorization` with the cross-resource rules:
 * two resources must belong to the same backlog, an assignee must be
 * assignable there, a parent must be browsable and schedulable.
 */

export function hasOwnField<T extends object>(input: T, field: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

/** A resource from another backlog is hidden, never "forbidden". */
export function assertSameBacklog(
  expected: AuthorizedResource,
  actual: AuthorizedResource,
  resourceType: string,
): void {
  if (expected.backlogId !== actual.backlogId) {
    throw new ResourceNotFoundError(resourceType, actual.resourceId);
  }
}

export function assertStoredBacklog(
  resource: AuthorizedResource,
  backlogId: string,
): void {
  if (resource.backlogId !== backlogId) {
    throw new ResourceNotFoundError("backlog", backlogId);
  }
}

/** The target of an assignment needs `assignable_user` in the stored backlog. */
export async function requireAssignableUser(input: {
  assigneeId: string | null | undefined;
  backlogId: string;
}): Promise<void> {
  if (!input.assigneeId) return;
  const decision = await checkPermission({
    actorId: input.assigneeId,
    permission: "assignable_user",
    scope: { type: "backlog", backlogId: input.backlogId },
  });
  if (!decision.allowed) throw new PermissionDeniedError(decision);
}

/** A parent must be visible, in the child's backlog, and schedulable. */
export async function authorizeParent(input: {
  actorId: string;
  parentId: string | null;
  childBacklog: AuthorizedResource;
}): Promise<void> {
  if (!input.parentId) return;
  const parent = await requireItemPermission({
    actorId: input.actorId,
    itemId: input.parentId,
    permission: "browse_backlog",
  });
  assertSameBacklog(input.childBacklog, parent, "item");
  await requireItemPermission({
    actorId: input.actorId,
    itemId: input.parentId,
    permission: "schedule_items",
  });
}

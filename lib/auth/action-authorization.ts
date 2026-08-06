import "server-only";

import { eq } from "drizzle-orm";
import { requirePermission, ResourceNotFoundError } from "@/lib/auth/authorization";
import type { BacklogPermissionKey } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { backlogs, items, sprints, statuses, views } from "@/lib/db/schema/domain";

export type AuthorizedResource = {
  backlogId: string;
  resourceId: string;
};

type BacklogPermissionInput = {
  actorId: string;
  permission: BacklogPermissionKey;
};

async function authorizeResource(input: {
  actorId: string;
  permission: BacklogPermissionKey;
  resourceType: string;
  resourceId: string;
  backlogId: string | null;
}): Promise<AuthorizedResource> {
  if (!input.backlogId) {
    throw new ResourceNotFoundError(input.resourceType, input.resourceId);
  }
  await requirePermission({
    actorId: input.actorId,
    permission: input.permission,
    scope: { type: "backlog", backlogId: input.backlogId },
  });
  return { backlogId: input.backlogId, resourceId: input.resourceId };
}

export async function requireBacklogPermissionById(
  input: BacklogPermissionInput & { backlogId: string },
): Promise<AuthorizedResource> {
  const [backlog] = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.id, input.backlogId))
    .limit(1);
  if (!backlog) throw new ResourceNotFoundError("backlog", input.backlogId);

  return authorizeResource({
    ...input,
    resourceType: "backlog",
    resourceId: backlog.id,
    backlogId: backlog.id,
  });
}

export async function requireBacklogPermissionByKey(
  input: BacklogPermissionInput & { backlogKey: string },
): Promise<AuthorizedResource & { backlogKey: string }> {
  const normalizedKey = input.backlogKey.toUpperCase();
  const [backlog] = await db
    .select({ id: backlogs.id, key: backlogs.key })
    .from(backlogs)
    .where(eq(backlogs.key, normalizedKey))
    .limit(1);
  if (!backlog) throw new ResourceNotFoundError("backlog", normalizedKey);

  const authorized = await authorizeResource({
    ...input,
    resourceType: "backlog",
    resourceId: backlog.id,
    backlogId: backlog.id,
  });
  return { ...authorized, backlogKey: backlog.key };
}

export async function requireItemPermission(
  input: BacklogPermissionInput & { itemId: string },
): Promise<AuthorizedResource> {
  const [item] = await db
    .select({ id: items.id, backlogId: items.backlogId })
    .from(items)
    .where(eq(items.id, input.itemId))
    .limit(1);
  if (!item) throw new ResourceNotFoundError("item", input.itemId);

  return authorizeResource({
    ...input,
    resourceType: "item",
    resourceId: item.id,
    backlogId: item.backlogId,
  });
}

export async function requireSprintPermission(
  input: BacklogPermissionInput & { sprintId: string },
): Promise<AuthorizedResource> {
  const [sprint] = await db
    .select({ id: sprints.id, backlogId: sprints.backlogId })
    .from(sprints)
    .where(eq(sprints.id, input.sprintId))
    .limit(1);
  if (!sprint) throw new ResourceNotFoundError("sprint", input.sprintId);

  return authorizeResource({
    ...input,
    resourceType: "sprint",
    resourceId: sprint.id,
    backlogId: sprint.backlogId,
  });
}

export async function requireStatusPermission(
  input: BacklogPermissionInput & { statusId: string },
): Promise<AuthorizedResource> {
  const [status] = await db
    .select({ id: statuses.id, backlogId: statuses.backlogId })
    .from(statuses)
    .where(eq(statuses.id, input.statusId))
    .limit(1);
  if (!status) throw new ResourceNotFoundError("status", input.statusId);

  return authorizeResource({
    ...input,
    resourceType: "status",
    resourceId: status.id,
    backlogId: status.backlogId,
  });
}

export async function requireViewPermission(
  input: BacklogPermissionInput & { viewId: string },
): Promise<AuthorizedResource> {
  const [view] = await db
    .select({ id: views.id, backlogId: views.backlogId })
    .from(views)
    .where(eq(views.id, input.viewId))
    .limit(1);
  if (!view) throw new ResourceNotFoundError("view", input.viewId);

  return authorizeResource({
    ...input,
    resourceType: "view",
    resourceId: view.id,
    backlogId: view.backlogId,
  });
}

import "server-only";

import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  PermissionDeniedError,
  requirePermission,
  requirePermissionWithoutBypassAudit,
  ResourceNotFoundError,
} from "@/lib/auth/authorization";
import type { BacklogPermissionKey } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  backlogs,
  comments,
  itemLinks,
  itemRefs,
  items,
  repoConnections,
  sprints,
  statuses,
  views,
} from "@/lib/db/schema/domain";

export type AuthorizedResource = {
  backlogId: string;
  resourceId: string;
};

type BacklogPermissionInput = {
  actorId: string;
  permission: BacklogPermissionKey;
};

const linkSourceItems = alias(items, "authorization_link_source_items");
const linkTargetItems = alias(items, "authorization_link_target_items");

async function authorizeResource(input: {
  actorId: string;
  permission: BacklogPermissionKey;
  resourceType: string;
  resourceId: string;
  backlogId: string | null;
}, recordBypass = true): Promise<AuthorizedResource> {
  if (!input.backlogId) {
    throw new ResourceNotFoundError(input.resourceType, input.resourceId);
  }
  try {
    const browseInput = {
      actorId: input.actorId,
      permission: "browse_backlog" as const,
      scope: { type: "backlog" as const, backlogId: input.backlogId },
    };
    if (recordBypass && input.permission === "browse_backlog") {
      await requirePermission(browseInput, {
        targetType: input.resourceType,
        targetId: input.resourceId,
      });
    } else {
      await requirePermissionWithoutBypassAudit(browseInput);
    }
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      throw new ResourceNotFoundError(input.resourceType, input.resourceId);
    }
    throw error;
  }

  if (input.permission !== "browse_backlog") {
    const requestedInput = {
      actorId: input.actorId,
      permission: input.permission,
      scope: { type: "backlog" as const, backlogId: input.backlogId },
    };
    if (recordBypass) {
      await requirePermission(requestedInput, {
        targetType: input.resourceType,
        targetId: input.resourceId,
      });
    } else {
      await requirePermissionWithoutBypassAudit(requestedInput);
    }
  }
  return { backlogId: input.backlogId, resourceId: input.resourceId };
}

export async function requireBacklogPermissionById(
  input: BacklogPermissionInput & { backlogId: string },
): Promise<AuthorizedResource & { backlogKey: string }> {
  const [backlog] = await db
    .select({ id: backlogs.id, key: backlogs.key })
    .from(backlogs)
    .where(eq(backlogs.id, input.backlogId))
    .limit(1);
  if (!backlog) throw new ResourceNotFoundError("backlog", input.backlogId);

  const authorized = await authorizeResource({
    ...input,
    resourceType: "backlog",
    resourceId: backlog.id,
    backlogId: backlog.id,
  });
  return { ...authorized, backlogKey: backlog.key };
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

export async function requireBacklogReadPermissionByKey(
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
  }, false);
  return { ...authorized, backlogKey: backlog.key };
}

export async function requireBacklogReadPermissionById(
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
  }, false);
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

export async function requireViewMutationPermission(input: {
  actorId: string;
  viewId: string;
  sharedMutation?: boolean;
}): Promise<AuthorizedResource & { ownerId: string; shared: boolean }> {
  const [view] = await db
    .select({
      id: views.id,
      backlogId: views.backlogId,
      ownerId: views.ownerId,
      shared: views.shared,
    })
    .from(views)
    .where(eq(views.id, input.viewId))
    .limit(1);
  if (!view) throw new ResourceNotFoundError("view", input.viewId);

  const permission = input.sharedMutation || view.shared
    ? "manage_shared_views"
    : "browse_backlog";
  const authorized = await authorizeResource({
    actorId: input.actorId,
    permission,
    resourceType: "view",
    resourceId: view.id,
    backlogId: view.backlogId,
  });
  if (!view.shared && view.ownerId !== input.actorId) {
    throw new PermissionDeniedError({
      allowed: false,
      permission,
      scope: { type: "backlog", backlogId: authorized.backlogId },
      reasons: [{ type: "no_matching_grant" }],
    });
  }
  return { ...authorized, ownerId: view.ownerId, shared: view.shared };
}

export async function requireCommentPermission(input: {
  actorId: string;
  commentId: string;
  ownPermission: "edit_own_comments" | "delete_own_comments";
  otherPermission?: "delete_all_comments";
}): Promise<AuthorizedResource & { authorId: string }> {
  const [comment] = await db
    .select({
      id: comments.id,
      authorId: comments.authorId,
      backlogId: items.backlogId,
    })
    .from(comments)
    .innerJoin(items, eq(comments.itemId, items.id))
    .where(eq(comments.id, input.commentId))
    .limit(1);
  if (!comment) throw new ResourceNotFoundError("comment", input.commentId);

  if (comment.authorId !== input.actorId && !input.otherPermission) {
    await authorizeResource({
      actorId: input.actorId,
      permission: "browse_backlog",
      resourceType: "comment",
      resourceId: comment.id,
      backlogId: comment.backlogId,
    }, false);
    throw new PermissionDeniedError({
      allowed: false,
      permission: input.ownPermission,
      scope: { type: "backlog", backlogId: comment.backlogId },
      reasons: [{ type: "no_matching_grant" }],
    });
  }

  const authorized = await authorizeResource({
    actorId: input.actorId,
    permission:
      comment.authorId === input.actorId
        ? input.ownPermission
        : input.otherPermission!,
    resourceType: "comment",
    resourceId: comment.id,
    backlogId: comment.backlogId,
  });
  return { ...authorized, authorId: comment.authorId };
}

export async function requireLinkPermission(
  input: BacklogPermissionInput & { linkId: string },
): Promise<AuthorizedResource> {
  const [link] = await db
    .select({
      id: itemLinks.id,
      sourceBacklogId: linkSourceItems.backlogId,
      targetBacklogId: linkTargetItems.backlogId,
    })
    .from(itemLinks)
    .innerJoin(linkSourceItems, eq(itemLinks.sourceId, linkSourceItems.id))
    .innerJoin(linkTargetItems, eq(itemLinks.targetId, linkTargetItems.id))
    .where(eq(itemLinks.id, input.linkId))
    .limit(1);
  if (!link) throw new ResourceNotFoundError("link", input.linkId);
  if (link.sourceBacklogId !== link.targetBacklogId) {
    throw new ResourceNotFoundError("link", input.linkId);
  }

  return authorizeResource({
    ...input,
    resourceType: "link",
    resourceId: link.id,
    backlogId: link.sourceBacklogId,
  });
}

export async function requireRefPermission(
  input: BacklogPermissionInput & { refId: string },
): Promise<AuthorizedResource> {
  const [ref] = await db
    .select({ id: itemRefs.id, backlogId: items.backlogId })
    .from(itemRefs)
    .innerJoin(items, eq(itemRefs.itemId, items.id))
    .where(eq(itemRefs.id, input.refId))
    .limit(1);
  if (!ref) throw new ResourceNotFoundError("reference", input.refId);

  return authorizeResource({
    ...input,
    resourceType: "reference",
    resourceId: ref.id,
    backlogId: ref.backlogId,
  });
}

export async function requireRepoConnectionPermission(
  input: BacklogPermissionInput & { connectionId: string },
): Promise<AuthorizedResource> {
  const [connection] = await db
    .select({ id: repoConnections.id, backlogId: repoConnections.backlogId })
    .from(repoConnections)
    .where(eq(repoConnections.id, input.connectionId))
    .limit(1);
  if (!connection) throw new ResourceNotFoundError("repo_connection", input.connectionId);

  return authorizeResource({
    ...input,
    resourceType: "repo_connection",
    resourceId: connection.id,
    backlogId: connection.backlogId,
  });
}

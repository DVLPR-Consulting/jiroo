import "server-only";
import { randomUUID } from "node:crypto";
import { runWithActor, type Actor } from "@/lib/auth/actor-context";
import {
  requireBacklogPermissionById,
  requireItemPermission,
  requireSprintPermission,
  requireStatusPermission,
  type AuthorizedResource,
} from "@/lib/auth/action-authorization";
import type { ItemKind, ItemType } from "@/lib/design/constants";
import { publishBacklogChange } from "@/lib/realtime/publish";
import { createItem, updateItem } from "@/lib/services/items";
import {
  assertSameBacklog,
  authorizeParent,
  hasOwnField,
  requireAssignableUser,
} from "@/lib/use-cases/guards";

/**
 * The authorized use cases of the items (JIR-155): one entry point per write
 * for the Server Actions, the REST API and the MCP server. Each one checks
 * the actor's permissions, runs the service in one transaction and tells the
 * open tabs. They throw: the caller maps the error to its own medium.
 */

export type CreateItemUseCaseInput = {
  backlogId: string;
  type: ItemType;
  parentId: string | null;
  title: string;
  description?: string | null;
  statusId?: string;
  priority?: number;
  assigneeId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  labelIds?: string[];
  kind?: ItemKind;
  sprintId?: string | null;
  fixVersionIds?: string[];
  estimatePoints?: number | null;
};

export type UpdateItemUseCaseInput = {
  id: string;
  title?: string;
  description?: string | null;
  statusId?: string;
  priority?: number;
  estimatePoints?: number | null;
  assigneeId?: string | null;
  reporterId?: string;
  startDate?: string | null;
  dueDate?: string | null;
  labelIds?: string[];
  kind?: ItemKind;
  fixVersionIds?: string[];
};

export type CreatedItem = Awaited<ReturnType<typeof createItem>>;
export type UpdatedItem = Awaited<ReturnType<typeof updateItem>>;

export async function createItemUseCase(
  actor: Actor,
  input: CreateItemUseCaseInput,
): Promise<{ item: CreatedItem; backlogId: string }> {
  return runWithActor(actor, async () => {
    const { actorId } = actor;
    const backlog = await requireBacklogPermissionById({
      actorId,
      backlogId: input.backlogId,
      permission: "create_items",
    });
    await authorizeParent({
      actorId,
      parentId: input.parentId,
      childBacklog: backlog,
    });
    if (input.sprintId) {
      const sprint = await requireSprintPermission({
        actorId,
        sprintId: input.sprintId,
        permission: "schedule_items",
      });
      assertSameBacklog(backlog, sprint, "sprint");
    }
    if (hasOwnField(input, "assigneeId")) {
      await requireBacklogPermissionById({
        actorId,
        backlogId: backlog.backlogId,
        permission: "assign_items",
      });
      await requireAssignableUser({ assigneeId: input.assigneeId, backlogId: backlog.backlogId });
    }
    const requestCorrelationId = randomUUID();
    const item = await createItem(input, actorId, requestCorrelationId);
    // The answer is the item alone, never a page render: the open tabs learn
    // the ids that changed and ask for what they show (JIR-119).
    await publishBacklogChange({
      kind: "item",
      backlogId: backlog.backlogId,
      itemIds: [item.id, ...(input.parentId ? [input.parentId] : [])],
      actorId,
    });
    return { item, backlogId: backlog.backlogId };
  });
}

async function authorizeItemUpdate(
  actorId: string,
  input: UpdateItemUseCaseInput,
): Promise<AuthorizedResource> {
  const item = await requireItemPermission({
    actorId,
    itemId: input.id,
    permission: "edit_items",
  });
  if (hasOwnField(input, "statusId")) {
    await requireItemPermission({
      actorId,
      itemId: input.id,
      permission: "transition_items",
    });
    if (input.statusId) {
      const status = await requireStatusPermission({
        actorId,
        statusId: input.statusId,
        permission: "transition_items",
      });
      assertSameBacklog(item, status, "status");
    }
  }
  if (hasOwnField(input, "assigneeId")) {
    await requireItemPermission({
      actorId,
      itemId: input.id,
      permission: "assign_items",
    });
    await requireAssignableUser({ assigneeId: input.assigneeId, backlogId: item.backlogId });
  }
  return item;
}

export async function updateItemUseCase(
  actor: Actor,
  input: UpdateItemUseCaseInput,
): Promise<{ item: UpdatedItem; backlogId: string }> {
  return runWithActor(actor, async () => {
    const { actorId } = actor;
    const authorization = await authorizeItemUpdate(actorId, input);
    const requestCorrelationId = randomUUID();
    const item = await updateItem(input, actorId, requestCorrelationId);
    await publishBacklogChange({
      kind: "item",
      backlogId: authorization.backlogId,
      itemIds: [input.id],
      actorId,
    });
    return { item, backlogId: authorization.backlogId };
  });
}

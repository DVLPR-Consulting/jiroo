"use server";

import { ZodError } from "zod";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import { requireBacklogPermissionById } from "@/lib/auth/action-authorization";
import { ResourceNotFoundError } from "@/lib/auth/authorization";
import { getSession } from "@/lib/auth/session";
import {
  createItemTemplate,
  deleteItemTemplate,
  DUPLICATE_TEMPLATE_MESSAGE,
  FOREIGN_LABEL_MESSAGE,
  getItemTemplateBacklogId,
  TEMPLATE_LIMIT_MESSAGE,
  TEMPLATE_NOT_FOUND_MESSAGE,
  updateItemTemplate,
  type ItemTemplateDto,
} from "@/lib/services/item-templates";
import { invalidateBacklog } from "@/lib/realtime/publish";
import { createItemTemplateInput, itemTemplateIdInput } from "@/lib/validation/item-template";

/**
 * Ticket templates (JIR-43): reserved to backlog administrators
 * (`administer_backlog`), checked against the stored template's backlog.
 * Using a template needs nothing more than creating the item.
 */

type Failure = { ok: false; error: string };

const SAFE_MESSAGES = new Set([
  DUPLICATE_TEMPLATE_MESSAGE,
  TEMPLATE_NOT_FOUND_MESSAGE,
  TEMPLATE_LIMIT_MESSAGE,
  FOREIGN_LABEL_MESSAGE,
]);
const SESSION_EXPIRED: Failure = { ok: false, error: "Votre session a expiré. Reconnectez-vous." };
const NOT_FOUND: Failure = { ok: false, error: "La ressource demandée est introuvable." };

function failure(error: unknown): Failure {
  const authorization = mapActionAuthorizationError(error);
  if (authorization) return authorization;
  if (error instanceof ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Les données saisies sont invalides." };
  }
  if (error instanceof Error && SAFE_MESSAGES.has(error.message)) return { ok: false, error: error.message };
  return { ok: false, error: "Action impossible. Réessayez." };
}

/**
 * Re-renders the backlog's pages, whose « Nouvel item » lists the templates,
 * and tells its open tabs; no item changed.
 */
async function publishTemplates(backlog: { backlogKey: string; backlogId: string }, actorId: string) {
  await invalidateBacklog(backlog.backlogKey, {
    kind: "backlog", backlogId: backlog.backlogId, itemIds: [], actorId,
  });
}

async function sessionActorId(): Promise<string | null> {
  return (await getSession())?.user.id ?? null;
}

/**
 * Authorizes against the template's stored backlog, never a client value. A
 * missing template answers like a hidden one: its existence never leaks.
 */
async function administerTemplate(actorId: string, templateId: string) {
  const backlogId = await getItemTemplateBacklogId(templateId);
  if (!backlogId) throw new ResourceNotFoundError("item_template", templateId);
  const { backlogKey } = await requireBacklogPermissionById({ actorId, backlogId, permission: "administer_backlog" });
  return { backlogKey, backlogId };
}

export async function createItemTemplateAction(
  input: Record<string, unknown>,
): Promise<{ ok: true; template: ItemTemplateDto } | Failure> {
  const actorId = await sessionActorId();
  if (!actorId) return SESSION_EXPIRED;
  try {
    const data = createItemTemplateInput.parse(input);
    const { backlogKey } = await requireBacklogPermissionById({
      actorId,
      backlogId: data.backlogId,
      permission: "administer_backlog",
    });
    const template = await createItemTemplate(data, actorId);
    await publishTemplates({ backlogKey, backlogId: data.backlogId }, actorId);
    return { ok: true, template };
  } catch (error) {
    return failure(error);
  }
}

export async function updateItemTemplateAction(
  input: { id: string } & Record<string, unknown>,
): Promise<{ ok: true; template: ItemTemplateDto } | Failure> {
  const actorId = await sessionActorId();
  if (!actorId) return SESSION_EXPIRED;
  if (!itemTemplateIdInput.safeParse({ id: input.id }).success) return NOT_FOUND;
  try {
    const backlog = await administerTemplate(actorId, input.id);
    const template = await updateItemTemplate(input, actorId);
    await publishTemplates(backlog, actorId);
    return { ok: true, template };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteItemTemplateAction(input: { id: string }): Promise<{ ok: true } | Failure> {
  const actorId = await sessionActorId();
  if (!actorId) return SESSION_EXPIRED;
  const parsed = itemTemplateIdInput.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  try {
    const backlog = await administerTemplate(actorId, parsed.data.id);
    await deleteItemTemplate(parsed.data, actorId);
    await publishTemplates(backlog, actorId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

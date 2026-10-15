"use server";

import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import {
  requireItemPermission,
  requireLinkPermission,
} from "@/lib/auth/action-authorization";
import { ResourceNotFoundError } from "@/lib/auth/authorization";
import { getSession } from "@/lib/auth/session";
import { invalidateBacklog } from "@/lib/realtime/publish";
import type { LinkType } from "@/lib/items/links";
import { addLink, removeLink } from "@/lib/services/links";

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  return session.user.id;
}

function mapLinkError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("lui-même")) return "Un item ne peut pas être lié à lui-même.";
  if (msg.includes("introuvable")) return "Item introuvable.";
  if (msg.includes("même backlog")) return "Les deux items doivent appartenir au même backlog.";
  if (msg.includes("existe déjà")) return "Ce lien existe déjà.";
  if (msg.includes("Cycle")) return msg; // surface the full cycle message verbatim
  return "Action impossible sur le lien.";
}

export async function addLinkAction(input: {
  backlogKey: string;
  sourceId: string;
  targetId: string;
  type: LinkType;
}) {
  const actorId = await authenticatedActorId();
  const { backlogKey, sourceId, targetId, type } = input;
  try {
    const source = await requireItemPermission({
      actorId,
      itemId: input.sourceId,
      permission: "link_items",
    });
    const target = await requireItemPermission({
      actorId,
      itemId: input.targetId,
      permission: "link_items",
    });
    if (source.backlogId !== target.backlogId) {
      throw new ResourceNotFoundError("item", target.resourceId);
    }
    const link = await addLink({ sourceId, targetId, type }, actorId);
    await invalidateBacklog(backlogKey, {
      kind: "item",
      backlogId: source.backlogId,
      itemIds: [sourceId, targetId],
      actorId,
    });
    return { ok: true as const, link };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapLinkError(e) };
  }
}

export async function removeLinkAction(input: { backlogKey: string; id: string }) {
  const actorId = await authenticatedActorId();
  const { backlogKey, id } = input;
  try {
    const authorization = await requireLinkPermission({
      actorId,
      linkId: input.id,
      permission: "link_items",
    });
    const removed = await removeLink(id);
    await invalidateBacklog(backlogKey, {
      kind: "item",
      backlogId: authorization.backlogId,
      ...(removed ? { itemIds: [removed.sourceId, removed.targetId] } : {}),
      actorId,
    });
    return { ok: true as const };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapLinkError(e) };
  }
}

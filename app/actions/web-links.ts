"use server";

import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import {
  requireItemPermission,
  requireWebLinkPermission,
} from "@/lib/auth/action-authorization";
import { getSession } from "@/lib/auth/session";
import { invalidateBacklog } from "@/lib/realtime/publish";
import { addWebLink, removeWebLink } from "@/lib/services/web-links";

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  return session.user.id;
}

function mapWebLinkError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("URL invalide")) return "URL invalide (http ou https).";
  if (msg.includes("trop long")) return "Texte affiché trop long (200 caractères maximum).";
  if (msg.includes("introuvable")) return "Item introuvable.";
  return "Action impossible sur le lien.";
}

export async function addWebLinkAction(input: {
  backlogKey: string;
  itemId: string;
  url: string;
  title?: string | null;
}) {
  const actorId = await authenticatedActorId();
  const { backlogKey, itemId, url, title } = input;
  try {
    const authorization = await requireItemPermission({ actorId, itemId, permission: "link_items" });
    const webLink = await addWebLink({ itemId, url, title }, actorId);
    await invalidateBacklog(backlogKey, {
      kind: "item",
      backlogId: authorization.backlogId,
      itemIds: [itemId],
      actorId,
    });
    return { ok: true as const, webLink };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapWebLinkError(e) };
  }
}

export async function removeWebLinkAction(input: { backlogKey: string; id: string }) {
  const actorId = await authenticatedActorId();
  const { backlogKey, id } = input;
  try {
    const authorization = await requireWebLinkPermission({ actorId, webLinkId: id, permission: "link_items" });
    const removed = await removeWebLink(id);
    await invalidateBacklog(backlogKey, {
      kind: "item",
      backlogId: authorization.backlogId,
      ...(removed ? { itemIds: [removed.itemId] } : {}),
      actorId,
    });
    return { ok: true as const };
  } catch (e) {
    const authorizationError = mapActionAuthorizationError(e);
    if (authorizationError) return authorizationError;
    return { ok: false as const, error: mapWebLinkError(e) };
  }
}

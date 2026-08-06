"use server";

import { revalidatePath } from "next/cache";
import {
  requireItemPermission,
  requireRefPermission,
} from "@/lib/auth/action-authorization";
import { getSession } from "@/lib/auth/session";
import { addRef, removeRef } from "@/lib/services/refs";

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Forbidden");
  return session.user.id;
}

function mapRefError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("URL GitHub invalide")) return "URL GitHub invalide.";
  if (msg.includes("introuvable")) return "Item introuvable.";
  return "Action impossible sur la référence.";
}

// ---------------------------------------------------------------------------
// addRefAction
// ---------------------------------------------------------------------------

export async function addRefAction(input: {
  backlogKey: string;
  itemId: string;
  url: string;
}) {
  const actorId = await authenticatedActorId();
  await requireItemPermission({
    actorId,
    itemId: input.itemId,
    permission: "link_items",
  });
  const { backlogKey, itemId, url } = input;
  try {
    const ref = await addRef({ itemId, url }, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, ref };
  } catch (e) {
    return { ok: false as const, error: mapRefError(e) };
  }
}

// ---------------------------------------------------------------------------
// removeRefAction
// ---------------------------------------------------------------------------

export async function removeRefAction(input: { backlogKey: string; id: string }) {
  const actorId = await authenticatedActorId();
  await requireRefPermission({
    actorId,
    refId: input.id,
    permission: "link_items",
  });
  const { backlogKey, id } = input;
  try {
    await removeRef(id);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: mapRefError(e) };
  }
}

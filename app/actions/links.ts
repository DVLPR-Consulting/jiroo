"use server";

import { revalidatePath } from "next/cache";
import { type Role, canWriteItems } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";
import type { LinkType } from "@/lib/items/links";
import { addLink, removeLink } from "@/lib/services/links";

// Authz gate: session-only actorId, never client input.
async function requireWriter(): Promise<string> {
  const session = await getSession();
  const role = (session?.user as { role?: Role } | undefined)?.role;
  if (!session || !role || !canWriteItems(role)) throw new Error("Forbidden");
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
  const actorId = await requireWriter();
  const { backlogKey, sourceId, targetId, type } = input;
  try {
    const link = await addLink({ sourceId, targetId, type }, actorId);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const, link };
  } catch (e) {
    return { ok: false as const, error: mapLinkError(e) };
  }
}

export async function removeLinkAction(input: { backlogKey: string; id: string }) {
  await requireWriter();
  const { backlogKey, id } = input;
  try {
    await removeLink(id);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: mapLinkError(e) };
  }
}

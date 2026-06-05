"use server";

import { revalidatePath } from "next/cache";
import { type Role, canWriteItems } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";
import { addRef, removeRef } from "@/lib/services/refs";

// Authz gate: session-only actorId, never client input.
async function requireWriter(): Promise<string> {
  const session = await getSession();
  const role = (session?.user as { role?: Role } | undefined)?.role;
  if (!session || !role || !canWriteItems(role)) throw new Error("Forbidden");
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
  const actorId = await requireWriter();
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
  await requireWriter();
  const { backlogKey, id } = input;
  try {
    await removeRef(id);
    revalidatePath(`/b/${backlogKey}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: mapRefError(e) };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type Role } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";
import { archiveBacklog, createBacklog, updateBacklog } from "@/lib/services/backlogs";

async function assertAdmin() {
  const session = await getSession();
  // requireRole throws if there's no session or the user isn't admin.
  requireRole(session as { user: { id: string; role: Role } } | null, "admin");
}

export async function createBacklogAction(input: { key: string; name: string; color: string }) {
  await assertAdmin();
  try {
    const b = await createBacklog(input);
    revalidatePath("/admin");
    return { ok: true as const, backlog: b };
  } catch (e) {
    const msg = String(e).includes("unique") ? "Cette clé est déjà utilisée." : "Création impossible.";
    return { ok: false as const, error: msg };
  }
}

export async function updateBacklogAction(input: { id: string; name: string; color: string }) {
  await assertAdmin();
  await updateBacklog(input);
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function archiveBacklogAction(id: string) {
  await assertAdmin();
  await archiveBacklog(id);
  revalidatePath("/admin");
  return { ok: true as const };
}

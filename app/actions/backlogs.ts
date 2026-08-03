"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type Role } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";
import { archiveBacklog, createBacklog, updateBacklog } from "@/lib/services/backlogs";

async function assertAdmin() {
  const session = await getSession();
  // requireRole throws if there's no session or the user isn't admin.
  requireRole(session as { user: { id: string; role: Role } } | null, "admin");
  return session!.user.id;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    return true;
  }
  return String(error).includes("23505") || String(error).toLowerCase().includes("unique");
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

export async function updateBacklogAction(input: {
  id: string;
  key: string;
  name: string;
  color: string;
}) {
  const adminId = await assertAdmin();
  try {
    const result = await updateBacklog(input, adminId);
    if (!result) return { ok: false as const, error: "Modification impossible." };

    for (const path of [
      "/admin",
      "/",
      "/mine",
      "/trash",
      `/b/${result.previousKey}`,
      `/b/${result.backlog.key}`,
    ]) {
      revalidatePath(path);
    }
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: isUniqueViolation(error)
        ? "Cette clé est déjà utilisée."
        : "Modification impossible.",
    };
  }
}

export async function archiveBacklogAction(id: string) {
  await assertAdmin();
  await archiveBacklog(id);
  revalidatePath("/admin");
  return { ok: true as const };
}

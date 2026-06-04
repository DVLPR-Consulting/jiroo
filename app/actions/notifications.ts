"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { markRead, markAllRead } from "@/lib/services/notifications";

// ---------------------------------------------------------------------------
// Auth helper — any authenticated user may manage THEIR OWN notifications;
// userId is always derived from the session, never from client input.
// ---------------------------------------------------------------------------

async function requireUser(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("Forbidden");
  return session.user.id;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Mark a single notification as read. */
export async function markReadAction(input: { id: string }) {
  try {
    const userId = await requireUser();
    await markRead(input.id, userId);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Action impossible." };
  }
}

/** Mark all of the authenticated user's notifications as read. */
export async function markAllReadAction() {
  try {
    const userId = await requireUser();
    await markAllRead(userId);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Action impossible." };
  }
}

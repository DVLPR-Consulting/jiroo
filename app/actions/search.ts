"use server";

import { getSession } from "@/lib/auth/session";
import { searchItems } from "@/lib/services/search";

// ---------------------------------------------------------------------------
// Auth helper — any authenticated user may search (global RBAC)
// ---------------------------------------------------------------------------

async function requireUser(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("Forbidden");
  return session.user.id;
}

// ---------------------------------------------------------------------------
// searchAction
//
// Server action wrapping searchItems. Returns a discriminated union so the
// caller can distinguish a successful empty result from a service error.
// No revalidatePath — search is a read-only operation.
// ---------------------------------------------------------------------------

export async function searchAction(query: string) {
  await requireUser();
  try {
    return { ok: true as const, results: await searchItems(query) };
  } catch {
    return { ok: false as const, error: "Recherche impossible." };
  }
}

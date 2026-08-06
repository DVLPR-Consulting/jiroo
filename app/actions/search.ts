"use server";

import { getSession } from "@/lib/auth/session";
import { recentItems, searchItems } from "@/lib/services/search";
import { z } from "zod";

const recentKeysSchema = z
  .array(z.string().regex(/^[A-Z]{2,6}-\d+$/))
  .max(8);

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
  const userId = await requireUser();
  try {
    return { ok: true as const, results: await searchItems(userId, query) };
  } catch {
    return { ok: false as const, error: "Recherche impossible." };
  }
}

export async function recentItemsAction(keys: string[]) {
  const userId = await requireUser();
  const parsed = recentKeysSchema.safeParse(keys);
  if (!parsed.success) {
    return { ok: false as const, error: "Recherche impossible." };
  }

  try {
    return { ok: true as const, results: await recentItems(userId, parsed.data) };
  } catch {
    return { ok: false as const, error: "Recherche impossible." };
  }
}

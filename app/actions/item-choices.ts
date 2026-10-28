"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { ITEM_TYPES } from "@/lib/design/constants";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import {
  ITEM_CHOICE_LIMIT,
  searchBacklogItems,
  type ItemChoice,
} from "@/lib/services/item-choices";

const inputSchema = z.object({
  backlogKey: z.string().trim().min(1).max(20),
  q: z.string().max(100).optional(),
  types: z.array(z.enum(ITEM_TYPES)).max(ITEM_TYPES.length).optional(),
  excludeIds: z.array(z.string().uuid()).max(50).optional(),
});

export type { ItemChoice };

export type SearchBacklogItemsInput = z.input<typeof inputSchema>;

export type SearchBacklogItemsResult =
  | { ok: true; items: ItemChoice[]; limit: number }
  | { ok: false; error: string };

/**
 * The choices of an item picker (JIR-118): a read-only, bounded search in
 * one backlog the user may browse (unknown, archived or forbidden backlogs
 * all answer the same way). The limit is the server's, never the caller's.
 */
export async function searchBacklogItemsAction(
  input: SearchBacklogItemsInput,
): Promise<SearchBacklogItemsResult> {
  const session = await getSession();
  if (!session) throw new Error("Forbidden");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Recherche impossible." };
  const { backlogKey, q, types, excludeIds } = parsed.data;
  try {
    const backlog = await getBacklogByKeyForUser(backlogKey, session.user.id);
    if (!backlog || backlog.archivedAt) return { ok: false, error: "Recherche impossible." };
    const found = await searchBacklogItems(backlog.id, { q, types, excludeIds });
    return { ok: true, items: found, limit: ITEM_CHOICE_LIMIT };
  } catch {
    return { ok: false, error: "Recherche impossible." };
  }
}

"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { parseViewState } from "@/lib/items/filter";
import {
  LIST_RELOAD_LIMIT,
  LIST_WINDOW_SIZE,
  listCursorSchema,
  type ListWindow,
} from "@/lib/items/list-window";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { loadListWindow } from "@/lib/services/list-window";

const inputSchema = z.object({
  backlogKey: z.string().trim().min(1).max(20),
  /**
   * The effective view state the page rendered its first window with, as
   * view URL parameters (`writeViewState`), so every window slices the same set.
   */
  viewState: z.string().max(8000),
  cursor: listCursorSchema,
  /** One window, or several at once to reload what was shown after a refresh. */
  limit: z.number().int().min(1).max(LIST_RELOAD_LIMIT).optional(),
});

export type LoadViewWindowInput = z.input<typeof inputSchema>;

export type LoadViewWindowResult =
  | { ok: true; window: ListWindow }
  | { ok: false; error: string };

const FAILED = { ok: false as const, error: "Impossible de charger la suite. Réessayez avec « Charger la suite »." };

/**
 * The Liste's next window (JIR-145, JIR-120 D2): a read-only, bounded read in
 * one backlog the user may browse, guarded like `searchBacklogItemsAction`
 * (unknown, archived or forbidden backlogs all answer the same way).
 */
export async function loadViewWindowAction(
  input: LoadViewWindowInput,
): Promise<LoadViewWindowResult> {
  const session = await getSession();
  if (!session) throw new Error("Forbidden");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return FAILED;
  const { backlogKey, viewState, cursor, limit } = parsed.data;
  try {
    const backlog = await getBacklogByKeyForUser(backlogKey, session.user.id);
    if (!backlog || backlog.archivedAt) return FAILED;
    const state = parseViewState(new URLSearchParams(viewState));
    const window = await loadListWindow(backlog.id, state, {
      cursor,
      limit: limit ?? LIST_WINDOW_SIZE,
    });
    return { ok: true, window };
  } catch {
    return FAILED;
  }
}

"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { parseViewState } from "@/lib/items/filter";
import type { BacklogWindow } from "@/lib/items/backlog-window";
import {
  LIST_RELOAD_LIMIT,
  LIST_WINDOW_SIZE,
  listCursorSchema,
} from "@/lib/items/list-window";
import { withKnownSprintIds } from "@/lib/items/sprint-filter";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { loadBacklogWindow } from "@/lib/services/backlog-window";

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

export type LoadBacklogWindowInput = z.input<typeof inputSchema>;

export type LoadBacklogWindowResult =
  | { ok: true; window: BacklogWindow }
  | { ok: false; error: string };

const FAILED = { ok: false as const, error: "Impossible de charger la suite. Réessayez avec « Charger la suite »." };

/**
 * The Backlog section's next window (JIR-146, JIR-120 D4): a read-only,
 * bounded read in one backlog the user may browse, guarded like the Liste's
 * `loadViewWindowAction` (unknown, archived or forbidden backlogs all answer
 * the same way).
 */
export async function loadBacklogWindowAction(
  input: LoadBacklogWindowInput,
): Promise<LoadBacklogWindowResult> {
  const session = await getSession();
  if (!session) throw new Error("Forbidden");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return FAILED;
  const { backlogKey, viewState, cursor, limit } = parsed.data;
  try {
    const backlog = await getBacklogByKeyForUser(backlogKey, session.user.id);
    if (!backlog || backlog.archivedAt) return FAILED;
    const state = parseViewState(new URLSearchParams(viewState));
    // The Backlog is laid out by sprint: it ignores the Sprint facet, as the page does.
    const filters = withKnownSprintIds(state.filters, null);
    const window = await loadBacklogWindow(backlog.id, { ...state, filters }, {
      cursor,
      limit: limit ?? LIST_WINDOW_SIZE,
    });
    return { ok: true, window };
  } catch {
    return FAILED;
  }
}

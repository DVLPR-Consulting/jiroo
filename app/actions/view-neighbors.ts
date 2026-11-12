"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { parseViewState } from "@/lib/items/filter";
import { withKnownSprintIds } from "@/lib/items/sprint-filter";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { backlogSectionNeighbors } from "@/lib/services/backlog-window";
import { viewNeighbors, type ViewNeighbors } from "@/lib/services/list-window";
import { treeNeighbors } from "@/lib/services/tree-window";

const inputSchema = z.object({
  backlogKey: z.string().trim().min(1).max(20),
  /** The view behind the drawer, among those served by windows. */
  view: z.enum(["list", "backlog", "tree"]),
  /** The effective view state the page rendered with, as view URL parameters. */
  viewState: z.string().max(8000),
  itemKey: z.string().trim().min(1).max(40),
});

export type LoadViewNeighborsInput = z.input<typeof inputSchema>;

export type LoadViewNeighborsResult =
  | { ok: true; neighbors: ViewNeighbors }
  | { ok: false };

/**
 * The previous and next items of the view around one item, loaded or not
 * (JIR-153): the drawer's K / J for an item outside the rows shown. A
 * read-only lookup guarded like the views' windows (unknown, archived or
 * forbidden backlogs all answer the same way).
 */
export async function loadViewNeighborsAction(
  input: LoadViewNeighborsInput,
): Promise<LoadViewNeighborsResult> {
  const session = await getSession();
  if (!session) throw new Error("Forbidden");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { backlogKey, view, viewState, itemKey } = parsed.data;
  try {
    const backlog = await getBacklogByKeyForUser(backlogKey, session.user.id);
    if (!backlog || backlog.archivedAt) return { ok: false };
    const state = parseViewState(new URLSearchParams(viewState));
    const neighbors = view === "list"
      ? await viewNeighbors(backlog.id, state, itemKey)
      : view === "backlog"
        // The Backlog is laid out by sprint: it ignores the Sprint facet, as the page does.
        ? await backlogSectionNeighbors(backlog.id, { ...state, filters: withKnownSprintIds(state.filters, null) }, itemKey)
        : await treeNeighbors(backlog.id, state.filters, itemKey);
    return { ok: true, neighbors };
  } catch {
    return { ok: false };
  }
}

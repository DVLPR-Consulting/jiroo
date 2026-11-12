"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { parseViewState } from "@/lib/items/filter";
import {
  TREE_RELOAD_LIMIT,
  TREE_RELOAD_PARENTS,
  TREE_WINDOW_SIZE,
  treeChildrenCursorSchema,
  treeMatchCursorSchema,
  type TreeChildrenWindow,
  type TreeMatchWindow,
} from "@/lib/items/tree-window";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { loadTreeChildren, loadTreeMatchWindow } from "@/lib/services/tree-window";

const FAILED = { ok: false as const, error: "Impossible de charger la suite. Réessayez avec « Charger la suite »." };

const backlogKeySchema = z.string().trim().min(1).max(20);

const childrenSchema = z.object({
  backlogKey: backlogKeySchema,
  /**
   * One parent's next window, or several parents at once to read again what
   * was shown after a refresh, within the reload limit.
   */
  parents: z
    .array(z.object({
      parentId: z.uuid(),
      cursor: treeChildrenCursorSchema,
      limit: z.number().int().min(1).max(TREE_RELOAD_LIMIT).optional(),
    }))
    .min(1)
    .max(TREE_RELOAD_PARENTS)
    .refine(
      (parents) => parents.reduce((sum, parent) => sum + (parent.limit ?? TREE_WINDOW_SIZE), 0) <= TREE_RELOAD_LIMIT,
      { message: "Trop de lignes demandées." },
    ),
});

export type LoadTreeChildrenInput = z.input<typeof childrenSchema>;

export type LoadTreeChildrenResult =
  | { ok: true; windows: TreeChildrenWindow[] }
  | { ok: false; error: string };

/**
 * The children of Arbre parents (JIR-147, JIR-120 D5): a read-only, bounded
 * read in one backlog the user may browse, guarded like the Liste's
 * `loadViewWindowAction` (unknown, archived or forbidden backlogs all answer
 * the same way); a parent of another backlog has no children here.
 */
export async function loadTreeChildrenAction(
  input: LoadTreeChildrenInput,
): Promise<LoadTreeChildrenResult> {
  const session = await getSession();
  if (!session) throw new Error("Forbidden");
  const parsed = childrenSchema.safeParse(input);
  if (!parsed.success) return FAILED;
  const { backlogKey, parents } = parsed.data;
  try {
    const backlog = await getBacklogByKeyForUser(backlogKey, session.user.id);
    if (!backlog || backlog.archivedAt) return FAILED;
    const windows = await Promise.all(parents.map((parent) =>
      loadTreeChildren(backlog.id, parent.parentId, {
        cursor: parent.cursor,
        limit: parent.limit ?? TREE_WINDOW_SIZE,
      })));
    return { ok: true, windows };
  } catch {
    return FAILED;
  }
}

const matchesSchema = z.object({
  backlogKey: backlogKeySchema,
  /**
   * The effective view state the page rendered its first window with, as
   * view URL parameters (`writeViewState`), so every window slices the same set.
   */
  viewState: z.string().max(8000),
  cursor: treeMatchCursorSchema,
  /** One window, or several at once to read again what was shown after a refresh. */
  limit: z.number().int().min(1).max(TREE_RELOAD_LIMIT).optional(),
});

export type LoadTreeMatchesInput = z.input<typeof matchesSchema>;

export type LoadTreeMatchesResult =
  | { ok: true; window: TreeMatchWindow }
  | { ok: false; error: string };

/** The filtered Arbre's next matches (JIR-147), guarded as above. */
export async function loadTreeMatchesAction(
  input: LoadTreeMatchesInput,
): Promise<LoadTreeMatchesResult> {
  const session = await getSession();
  if (!session) throw new Error("Forbidden");
  const parsed = matchesSchema.safeParse(input);
  if (!parsed.success) return FAILED;
  const { backlogKey, viewState, cursor, limit } = parsed.data;
  try {
    const backlog = await getBacklogByKeyForUser(backlogKey, session.user.id);
    if (!backlog || backlog.archivedAt) return FAILED;
    const { filters } = parseViewState(new URLSearchParams(viewState));
    const window = await loadTreeMatchWindow(backlog.id, filters, {
      cursor,
      limit: limit ?? TREE_WINDOW_SIZE,
    });
    return { ok: true, window };
  } catch {
    return FAILED;
  }
}

import { z } from "zod";
import type { ItemType } from "@/lib/design/constants";

/**
 * The Arbre by windows (JIR-147, JIR-120 D5). Without a filter, the page
 * sends the structure (Composants and Epics) and a parent's children (Tâches,
 * Sous-tâches) are read when it is unfolded, 100 at a time in rank order
 * from the rank of the last child shown. With a filter, the server sends the
 * matches 100 at a time in hierarchy order (depth, rank) with the ancestors
 * they need, read from the depth and rank of the last match shown.
 */

/** Rows per window (JIR-120 D2), as the Liste and the Backlog. */
export const TREE_WINDOW_SIZE = 100;

/**
 * At most this many rows are read again at once after a refresh (the Liste's
 * limit): the parents beyond it fold back.
 */
export const TREE_RELOAD_LIMIT = 500;

/** At most this many parents are read again in one call after a refresh. */
export const TREE_RELOAD_PARENTS = 50;

type LabelChip = { id: string; name: string; color: string };

/** One row of the Arbre, as `ItemTree` shows it. */
export type TreeRow = {
  id: string;
  key: string;
  type: ItemType;
  title: string;
  parentId: string | null;
  statusId: string;
  priority: number;
  depth: number;
  rank: string;
  path: string;
  labels: LabelChip[];
  assigneeId: string | null;
  assigneeName: string | null;
  /**
   * The live children the row has, loaded or not: without a filter, tells
   * a parent to unfold from one whose children are all shown. Absent with a
   * filter, where only the rows served are shown.
   */
  childCount?: number;
};

/** A parent's children are read after the rank of the last child shown. */
export const treeChildrenCursorSchema = z.string().min(1).max(200).nullable();

/** One window of a parent's children, in rank order. */
export type TreeChildrenWindow = {
  parentId: string;
  /** Every live child of the parent, loaded or not. */
  total: number;
  rows: TreeRow[];
  /** Null after the last child. */
  nextCursor: string | null;
};

/** Filtered matches are read after the depth and rank of the last match shown. */
export const treeMatchCursorSchema = z
  .object({
    depth: z.number().int().min(0).max(20),
    rank: z.string().min(1).max(200),
  })
  .nullable();

export type TreeMatchCursor = NonNullable<z.infer<typeof treeMatchCursorSchema>>;

/** A served row with a filter: a match, or an ancestor shown dimmed. */
export type TreeMatchRow = TreeRow & { matched: boolean };

/** One window of filtered matches, with the ancestors they need. */
export type TreeMatchWindow = {
  /** Every match of the filters, loaded or not. */
  total: number;
  /**
   * The window's matches and their ancestors the filters leave out, in
   * hierarchy order. An ancestor can come again in a later window; a match
   * never does (its matching ancestors came before it, being less deep).
   */
  rows: TreeMatchRow[];
  /** Null after the last match. */
  nextCursor: TreeMatchCursor | null;
};

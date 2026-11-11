import { z } from "zod";
import type { ItemKind, ItemType } from "@/lib/design/constants";
import type { ViewGroupSummary } from "@/lib/items/filter";

/**
 * The Liste served by windows (JIR-145, JIR-120 D2, D3): the server renders
 * the first window, the next ones are read on demand from a cursor holding
 * the sort values of the last row shown, never an offset.
 */

/** Rows per window (JIR-120 D2: Jira shows 50; our rows weigh about 1.2 KB). */
export const LIST_WINDOW_SIZE = 100;

/**
 * At most this many rows are reloaded at once after a refresh (the bulk
 * actions' own limit): beyond it the Liste falls back to its first window.
 */
export const LIST_RELOAD_LIMIT = 500;

/** Sort values travel as text (or null for a missing due date). */
const sortValue = z.string().max(2000).nullable();

/**
 * Where the next window starts: the group of the last row shown, the sort
 * values of that group's first row (groups keep their first-seen order) and
 * the sort values of the last row itself.
 */
export const listCursorSchema = z.object({
  group: z.string().max(200),
  first: z.array(sortValue).min(1).max(8),
  last: z.array(sortValue).min(1).max(8),
});

export type ListCursor = z.infer<typeof listCursorSchema>;

type LabelChip = { id: string; name: string; color: string };
type FixVersionChip = { id: string; name: string; released: boolean; archived: boolean };

/** One Liste row, as `ItemRow` shows it. */
export type ListWindowRow = {
  id: string;
  key: string;
  type: ItemType;
  kind: ItemKind;
  title: string;
  statusId: string;
  priority: number;
  estimatePoints: number | null;
  depth: number;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  labels: LabelChip[];
  blocked: boolean;
  fixVersions: FixVersionChip[];
  /** The direct parent, shown as a pill: the Liste is flat (JIR-93). */
  parent: { key: string; title: string; type: ItemType } | null;
  /** The group the row belongs to; `""` when the Liste is not grouped. */
  groupKey: string;
};

/** A group met in a window, with its figures over the whole filtered group. */
export type ListWindowGroup = { key: string; label: string; summary: ViewGroupSummary };

export type ListWindow = {
  /** Every row the filters keep, loaded or not. */
  total: number;
  rows: ListWindowRow[];
  /** The groups of these rows, in their order. */
  groups: ListWindowGroup[];
  /** Null after the last row. */
  nextCursor: ListCursor | null;
};

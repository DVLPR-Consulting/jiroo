import type { ItemKind, ItemType } from "@/lib/design/constants";
import type { ListCursor } from "@/lib/items/list-window";

/**
 * The Backlog's « Backlog » section served by windows (JIR-146, JIR-120 D4):
 * the tasks without a sprint, not done, read 100 at a time from a cursor on
 * the sort values of the last row shown (the rank alone in manual order),
 * like the Liste's windows (`lib/items/list-window.ts`). Sprint sections stay
 * whole.
 */

type FixVersionChip = { id: string; name: string; released: boolean; archived: boolean };

/** One row of the Backlog section, as `BacklogRow` shows it. */
export type BacklogWindowRow = {
  id: string;
  key: string;
  title: string;
  type: "tache";
  kind: ItemKind;
  statusId: string;
  priority: number;
  estimatePoints: number | null;
  assigneeId: string | null;
  assigneeName: string | null;
  rank: string;
  blocked: boolean;
  fixVersions: FixVersionChip[];
  parent: { key: string; title: string; type: ItemType } | null;
  /** The group the row belongs to; `""` when the Backlog is not grouped. */
  groupKey: string;
};

/** A group met in a window, with its task count over the whole filtered group. */
export type BacklogWindowGroup = { key: string; label: string; count: number };

export type BacklogWindow = {
  /** Every task of the section the filters keep, loaded or not. */
  total: number;
  rows: BacklogWindowRow[];
  /** The groups of these rows, in their order. */
  groups: BacklogWindowGroup[];
  /** Null after the last row. */
  nextCursor: ListCursor | null;
};

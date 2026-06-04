import { z } from "zod";
import { ITEM_TYPES, PRIORITIES, type ItemType } from "@/lib/design/constants";
import {
  GROUP_KEYS,
  SORT_FIELDS,
  writeViewState,
  type Filters,
  type GroupKey,
  type SortDir,
  type SortField,
  type ViewState,
} from "./filter";

// ---------------------------------------------------------------------------
// DisplayMode
// ---------------------------------------------------------------------------

export type DisplayMode = "board" | "list" | "tree";

const DISPLAY_MODES = ["board", "list", "tree"] as const;

// ---------------------------------------------------------------------------
// Column types — the shape assigned to the `views` table columns
// ---------------------------------------------------------------------------

/** The value stored in the `sort` jsonb column. */
type SortColumn = "manual" | { field: SortField; dir: SortDir };

/** What `viewStateToColumns` returns; maps directly to DB columns. */
export type ViewColumns = {
  displayMode: DisplayMode;
  groupBy: GroupKey | null;
  filters: Filters;
  sort: SortColumn;
};

// ---------------------------------------------------------------------------
// viewStateToColumns
// ---------------------------------------------------------------------------

/**
 * Converts an in-memory ViewState + DisplayMode into the shape that is
 * persisted to the `views` table columns.
 *
 * Sort sentinel: a `null` sort → the string `"manual"`;
 * a real sort → its `{ field, dir }` object (stored as jsonb).
 */
export function viewStateToColumns(state: ViewState, displayMode: DisplayMode): ViewColumns {
  return {
    displayMode,
    groupBy: state.group,
    filters: state.filters,
    sort: state.sort ?? "manual",
  };
}

// ---------------------------------------------------------------------------
// columnsToViewState
// ---------------------------------------------------------------------------

/**
 * Converts a raw DB row back into a ViewState + DisplayMode.
 * Fully defensive: unknown/malformed values are replaced with safe defaults
 * so that a junk jsonb row can never crash the app.
 */
export function columnsToViewState(row: {
  displayMode: unknown;
  groupBy: unknown;
  filters: unknown;
  sort: unknown;
}): { state: ViewState; displayMode: DisplayMode } {
  // --- displayMode ---
  const displayMode: DisplayMode =
    typeof row.displayMode === "string" &&
    (DISPLAY_MODES as readonly string[]).includes(row.displayMode)
      ? (row.displayMode as DisplayMode)
      : "board";

  // --- groupBy → group ---
  const group: GroupKey | null =
    typeof row.groupBy === "string" &&
    (GROUP_KEYS as string[]).includes(row.groupBy)
      ? (row.groupBy as GroupKey)
      : null;

  // --- sort ---
  // The "manual" sentinel and any primitive fall through to null; only a
  // well-formed { field, dir } object is restored.
  let sort: ViewState["sort"] = null;
  if (row.sort !== "manual" && typeof row.sort === "object" && row.sort !== null) {
    const s = row.sort as Record<string, unknown>;
    if (
      typeof s.field === "string" &&
      (SORT_FIELDS as readonly string[]).includes(s.field) &&
      (s.dir === "asc" || s.dir === "desc")
    ) {
      sort = { field: s.field as SortField, dir: s.dir };
    }
  }

  // --- filters ---
  const rawFilters = (typeof row.filters === "object" && row.filters !== null ? row.filters : {}) as Record<string, unknown>;

  const q = typeof rawFilters.q === "string" ? rawFilters.q : "";

  const types: ItemType[] = Array.isArray(rawFilters.types)
    ? (rawFilters.types as unknown[]).filter(
        (t): t is ItemType =>
          typeof t === "string" && (ITEM_TYPES as readonly string[]).includes(t),
      )
    : [];

  const statusIds: string[] = Array.isArray(rawFilters.statusIds)
    ? (rawFilters.statusIds as unknown[]).filter((s): s is string => typeof s === "string")
    : [];

  const priorities: number[] = Array.isArray(rawFilters.priorities)
    ? (rawFilters.priorities as unknown[]).filter(
        (p): p is number =>
          typeof p === "number" && (PRIORITIES as readonly number[]).includes(p),
      )
    : [];

  const assignees: string[] = Array.isArray(rawFilters.assignees)
    ? (rawFilters.assignees as unknown[]).filter((a): a is string => typeof a === "string")
    : [];

  const labels: string[] = Array.isArray(rawFilters.labels)
    ? (rawFilters.labels as unknown[]).filter((l): l is string => typeof l === "string")
    : [];

  const state: ViewState = {
    filters: { q, types, statusIds, priorities, assignees, labels },
    group,
    sort,
  };

  return { state, displayMode };
}

// ---------------------------------------------------------------------------
// isViewDirty
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `current` differs from `saved` (the `view`) in any field.
 * Array comparisons (types, statusIds, priorities, assignees) are
 * order-insensitive so that param ordering differences don't cause
 * false positives.
 */
export function isViewDirty(
  view: { state: ViewState; displayMode: DisplayMode },
  current: { state: ViewState; displayMode: DisplayMode },
): boolean {
  if (view.displayMode !== current.displayMode) return true;

  const vs = view.state;
  const cs = current.state;

  // group
  if (vs.group !== cs.group) return true;

  // sort
  if (vs.sort === null && cs.sort !== null) return true;
  if (vs.sort !== null && cs.sort === null) return true;
  if (vs.sort !== null && cs.sort !== null) {
    if (vs.sort.field !== cs.sort.field || vs.sort.dir !== cs.sort.dir) return true;
  }

  // filters — scalar
  if (vs.filters.q !== cs.filters.q) return true;

  // filters — CSV-style arrays (order-insensitive)
  if (!sameSet(vs.filters.types, cs.filters.types)) return true;
  if (!sameSet(vs.filters.statusIds, cs.filters.statusIds)) return true;
  if (!sameSet(vs.filters.priorities, cs.filters.priorities)) return true;
  if (!sameSet(vs.filters.assignees, cs.filters.assignees)) return true;
  if (!sameSet(vs.filters.labels, cs.filters.labels)) return true;

  return false;
}

/** Order-insensitive equality for arrays of primitives. */
function sameSet<T extends string | number>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  for (const v of b) {
    if (!setA.has(v)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// buildViewUrl
// ---------------------------------------------------------------------------

/**
 * Builds the path + querystring that applies a saved view.
 * Reuses `writeViewState` to encode filters/group/sort, then appends
 * `view=<displayMode>` and `v=<id>`. Param ordering is deterministic.
 */
export function buildViewUrl(
  view: { id: string; state: ViewState; displayMode: DisplayMode },
  basePath: string,
): string {
  // Use a sorted URLSearchParams to guarantee deterministic output.
  const sp = new URLSearchParams();
  writeViewState(sp, view.state);
  sp.set("view", view.displayMode);
  sp.set("v", view.id);
  // Sort for determinism (URLSearchParams.sort() is spec-defined stable sort).
  sp.sort();
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const displayModeSchema = z.enum(["board", "list", "tree"]);

const filtersSchema = z.object({
  q: z.string().default(""),
  types: z.array(z.enum(ITEM_TYPES)).default([]),
  statusIds: z.array(z.string()).default([]),
  priorities: z.array(z.number()).default([]),
  assignees: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
});

const sortSchema = z
  .object({
    field: z.enum(SORT_FIELDS as [SortField, ...SortField[]]),
    dir: z.enum(["asc", "desc"]),
  })
  .nullable();

/** Input for creating a new saved view. */
export const createViewInput = z.object({
  name: z.string().trim().min(1).max(80),
  backlogId: z.string().uuid(),
  displayMode: displayModeSchema,
  filters: filtersSchema,
  group: z.enum(GROUP_KEYS as [GroupKey, ...GroupKey[]]).nullable(),
  sort: sortSchema,
  shared: z.boolean(),
});

/**
 * Input for the in-place "Save" of a view's display state.
 * Carries ONLY the 4 state fields — name/shared/backlogId are intentionally
 * absent so a caller can't believe a rename/visibility change happened here.
 */
export const updateViewStateInput = z.object({
  displayMode: displayModeSchema,
  filters: filtersSchema,
  group: z.enum(GROUP_KEYS as [GroupKey, ...GroupKey[]]).nullable(),
  sort: sortSchema,
});

/** Input for renaming a saved view. */
export const renameViewInput = z.object({
  name: z.string().trim().min(1).max(80),
});

/** Input for toggling a view's shared flag. */
export const setSharedInput = z.object({
  shared: z.boolean(),
});

export type CreateViewInput = z.infer<typeof createViewInput>;
export type UpdateViewStateInput = z.infer<typeof updateViewStateInput>;
export type RenameViewInput = z.infer<typeof renameViewInput>;
export type SetSharedInput = z.infer<typeof setSharedInput>;

// ---------------------------------------------------------------------------
// ViewRow — minimal structural type for the access/partition helpers.
// Compatible with the Drizzle inferred row type from the `views` table.
// ---------------------------------------------------------------------------

export type ViewRow = {
  id: string;
  ownerId: string;
  shared: boolean;
  name: string;
};

// ---------------------------------------------------------------------------
// canMutateView — owner-only mutation guard (pure, unit-tested)
// ---------------------------------------------------------------------------

/**
 * Returns `true` iff the actor is the view's owner.
 * Views use a strict owner-only model: sharing allows read access for others,
 * but write/delete is always restricted to the original creator.
 */
export function canMutateView(view: { ownerId: string }, userId: string): boolean {
  return view.ownerId === userId;
}

// ---------------------------------------------------------------------------
// partitionViews — personal vs shared split (pure, unit-tested)
// ---------------------------------------------------------------------------

/**
 * Splits a list of view rows into two buckets for a given user:
 * - `personal`: rows owned by `userId` (both private and the user's own shared)
 * - `shared`: rows with `shared === true` owned by someone else
 *
 * Rows that are neither (other users' private views) are excluded entirely.
 * Input order is preserved within each bucket.
 */
export function partitionViews(
  rows: ViewRow[],
  userId: string,
): { personal: ViewRow[]; shared: ViewRow[] } {
  const personal: ViewRow[] = [];
  const shared: ViewRow[] = [];

  for (const row of rows) {
    if (row.ownerId === userId) {
      personal.push(row);
    } else if (row.shared) {
      shared.push(row);
    }
    // others' private views are dropped
  }

  return { personal, shared };
}

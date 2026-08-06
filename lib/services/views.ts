import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { views } from "@/lib/db/schema/domain";
import {
  canMutateView,
  partitionViews,
  viewStateToColumns,
  createViewInput,
  updateViewStateInput,
  renameViewInput,
  setSharedInput,
  type ViewRow,
} from "@/lib/items/views";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Re-export ViewRow so callers can type-annotate without importing from two places.
export type { ViewRow };

// ---- reads (no tx) ----

/**
 * Returns ALL views visible to `userId` across every backlog — i.e. rows
 * where `ownerId === userId` OR `shared === true` — ordered by name asc.
 * Used by the app layout to feed the sidebar once at the top level.
 */
export async function listVisibleViews(userId: string) {
  return db
    .select()
    .from(views)
    .where(or(eq(views.ownerId, userId), eq(views.shared, true)))
    .orderBy(asc(views.name));
}

/**
 * Returns all views visible to `userId` for the given backlog, split into
 * `personal` (owned by the user) and `shared` (other users' shared views).
 * Rows are ordered by name ascending before partitioning so each bucket is
 * also alphabetically sorted.
 */
export async function listViews(
  backlogId: string,
  userId: string,
): Promise<{ personal: ViewRow[]; shared: ViewRow[] }> {
  const rows = await db
    .select()
    .from(views)
    .where(
      and(
        eq(views.backlogId, backlogId),
        or(eq(views.ownerId, userId), eq(views.shared, true)),
      ),
    )
    .orderBy(asc(views.name));

  return partitionViews(rows, userId);
}

/** Returns the view row for `id`, or `null` if it does not exist. */
export async function getViewById(id: string) {
  const [row] = await db.select().from(views).where(eq(views.id, id));
  return row ?? null;
}

// ---- mutations (tx) ----

/**
 * Creates a new saved view owned by `ownerId`.
 * The owner is always derived from the authenticated actor — never from client input.
 */
export async function createView(input: unknown, ownerId: string) {
  const data = createViewInput.parse(input);

  const cols = viewStateToColumns(
    { filters: data.filters, group: data.group, sort: data.sort },
    data.displayMode,
  );

  // A single INSERT — no lock, no multi-statement, nothing to roll back — so no tx.
  const [row] = await db
    .insert(views)
    .values({
      name: data.name,
      backlogId: data.backlogId,
      ownerId,
      shared: data.shared,
      displayMode: cols.displayMode,
      groupBy: cols.groupBy,
      filters: cols.filters,
      sort: cols.sort,
    })
    .returning();
  return row!;
}

/**
 * Overwrites the display state (displayMode / groupBy / filters / sort) of an
 * existing view in-place. This is the "Save" action for a dirty view.
 * Owner-only by default; an action may pass an already-authorized shared-view override.
 */
export async function updateView(
  id: string,
  input: unknown,
  actorId: string,
  options: { allowAny: boolean } = { allowAny: false },
) {
  // State-only schema: name/shared/backlogId are NOT accepted here, so a caller
  // can't think a rename happened just because it passed a `name` field.
  const data = updateViewStateInput.parse(input);

  const cols = viewStateToColumns(
    { filters: data.filters, group: data.group, sort: data.sort },
    data.displayMode,
  );

  return db.transaction(async (tx: Tx) => {
    const [cur] = await tx
      .select()
      .from(views)
      .where(eq(views.id, id))
      .for("update");
    if (!cur) throw new Error("Vue introuvable.");
    if (!options.allowAny && !canMutateView(cur, actorId)) {
      throw new Error("Action réservée au propriétaire de la vue.");
    }

    const [updated] = await tx
      .update(views)
      .set({
        displayMode: cols.displayMode,
        groupBy: cols.groupBy,
        filters: cols.filters,
        sort: cols.sort,
      })
      .where(eq(views.id, id))
      .returning();
    return updated!;
  });
}

/**
 * Renames a saved view. Owner-only unless shared-view authorization was resolved upstream.
 */
export async function renameView(
  id: string,
  input: unknown,
  actorId: string,
  options: { allowAny: boolean } = { allowAny: false },
) {
  const data = renameViewInput.parse(input);

  return db.transaction(async (tx: Tx) => {
    const [cur] = await tx
      .select()
      .from(views)
      .where(eq(views.id, id))
      .for("update");
    if (!cur) throw new Error("Vue introuvable.");
    if (!options.allowAny && !canMutateView(cur, actorId)) {
      throw new Error("Action réservée au propriétaire de la vue.");
    }

    const [updated] = await tx
      .update(views)
      .set({ name: data.name })
      .where(eq(views.id, id))
      .returning();
    return updated!;
  });
}

/**
 * Sets the `shared` flag. Owner-only unless shared-view authorization was resolved upstream.
 */
export async function setShared(
  id: string,
  input: unknown,
  actorId: string,
  options: { allowAny: boolean } = { allowAny: false },
) {
  const data = setSharedInput.parse(input);

  return db.transaction(async (tx: Tx) => {
    const [cur] = await tx
      .select()
      .from(views)
      .where(eq(views.id, id))
      .for("update");
    if (!cur) throw new Error("Vue introuvable.");
    if (!options.allowAny && !canMutateView(cur, actorId)) {
      throw new Error("Action réservée au propriétaire de la vue.");
    }

    const [updated] = await tx
      .update(views)
      .set({ shared: data.shared })
      .where(eq(views.id, id))
      .returning();
    return updated!;
  });
}

/**
 * Permanently deletes a view. Owner-only unless shared-view authorization was resolved upstream.
 */
export async function deleteView(
  id: string,
  actorId: string,
  options: { allowAny: boolean } = { allowAny: false },
) {
  return db.transaction(async (tx: Tx) => {
    const [cur] = await tx
      .select()
      .from(views)
      .where(eq(views.id, id))
      .for("update");
    if (!cur) throw new Error("Vue introuvable.");
    if (!options.allowAny && !canMutateView(cur, actorId)) {
      throw new Error("Action réservée au propriétaire de la vue.");
    }

    await tx.delete(views).where(eq(views.id, id));
    return cur;
  });
}

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activities,
  backlogs,
  itemFixVersions,
  items,
  releases,
} from "@/lib/db/schema/domain";
import {
  changeItemFixVersionsSchema,
  type ChangeItemFixVersionsInput,
} from "@/lib/validation/release";

export type ItemFixVersionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type FixVersionLabel = { id: string; name: string };

export type FixVersionMutationResult = {
  changed: boolean;
  before: FixVersionLabel[];
  after: FixVersionLabel[];
};

type BulkFixVersionInput = {
  backlogId: string;
  itemIds: string[];
  mode: ChangeItemFixVersionsInput["mode"];
  releaseIds: string[];
};

const INSERT_BATCH_SIZE = 1_000;

export function listItemFixVersionPairs(backlogId: string) {
  return db
    .select({
      itemId: itemFixVersions.itemId,
      releaseId: itemFixVersions.releaseId,
      name: releases.name,
    })
    .from(itemFixVersions)
    .innerJoin(
      items,
      and(
        eq(items.id, itemFixVersions.itemId),
        eq(items.backlogId, itemFixVersions.backlogId),
      ),
    )
    .innerJoin(
      releases,
      and(
        eq(releases.id, itemFixVersions.releaseId),
        eq(releases.backlogId, itemFixVersions.backlogId),
      ),
    )
    .where(and(eq(itemFixVersions.backlogId, backlogId), isNull(items.deletedAt)))
    .orderBy(asc(itemFixVersions.itemId), asc(itemFixVersions.releaseId));
}

function labelsFor(ids: Iterable<string>, releaseById: Map<string, FixVersionLabel>): FixVersionLabel[] {
  return [...ids]
    .sort()
    .map((id) => {
      const release = releaseById.get(id);
      if (!release) throw new Error("Une ou plusieurs releases sont invalides pour ce backlog.");
      return release;
    });
}

async function mutateItemFixVersionsInTx(
  tx: ItemFixVersionTx,
  input: BulkFixVersionInput,
  actorId: string,
  requestCorrelationId: string,
): Promise<Map<string, FixVersionMutationResult>> {
  const itemIds = [...input.itemIds].sort();
  const requestedReleaseIds = [...input.releaseIds].sort();

  const [backlog] = await tx
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.id, input.backlogId))
    .for("update");
  if (!backlog) throw new Error("Backlog introuvable.");

  const selectedItems = await tx
    .select({ id: items.id, backlogId: items.backlogId })
    .from(items)
    .where(and(inArray(items.id, itemIds), isNull(items.deletedAt)))
    .orderBy(asc(items.id))
    .for("update");
  if (selectedItems.length !== itemIds.length) {
    throw new Error("Un ou plusieurs items sont introuvables.");
  }
  if (selectedItems.some((item) => item.backlogId !== input.backlogId)) {
    throw new Error("Tous les items doivent appartenir au backlog.");
  }

  const currentRows = await tx
    .select({ itemId: itemFixVersions.itemId, releaseId: itemFixVersions.releaseId })
    .from(itemFixVersions)
    .where(
      and(
        eq(itemFixVersions.backlogId, input.backlogId),
        inArray(itemFixVersions.itemId, itemIds),
      ),
    )
    .orderBy(asc(itemFixVersions.itemId), asc(itemFixVersions.releaseId))
    .for("update");
  const currentByItem = new Map(itemIds.map((itemId) => [itemId, new Set<string>()]));
  for (const row of currentRows) currentByItem.get(row.itemId)?.add(row.releaseId);

  const candidateIds = [
    ...new Set([
      ...requestedReleaseIds,
      ...currentRows.map((row) => row.releaseId),
    ]),
  ].sort();
  const releaseRows = candidateIds.length
    ? await tx
        .select({
          id: releases.id,
          backlogId: releases.backlogId,
          name: releases.name,
          archivedAt: releases.archivedAt,
        })
        .from(releases)
        .where(inArray(releases.id, candidateIds))
        .orderBy(asc(releases.id))
        .for("update")
    : [];
  if (
    releaseRows.length !== candidateIds.length ||
    releaseRows.some((release) => release.backlogId !== input.backlogId)
  ) {
    throw new Error("Une ou plusieurs releases sont invalides pour ce backlog.");
  }
  const releaseById = new Map(releaseRows.map(({ id, name }) => [id, { id, name }]));
  const archivedIds = new Set(
    releaseRows.filter((release) => release.archivedAt !== null).map((release) => release.id),
  );

  const results = new Map<string, FixVersionMutationResult>();
  const additions: Array<typeof itemFixVersions.$inferInsert> = [];
  const removals = new Map<string, string[]>();
  const activityRows: Array<typeof activities.$inferInsert> = [];

  for (const itemId of itemIds) {
    const current = currentByItem.get(itemId) ?? new Set<string>();
    const after = new Set(current);
    if (input.mode === "replace") {
      after.clear();
      for (const releaseId of requestedReleaseIds) after.add(releaseId);
    } else if (input.mode === "add") {
      for (const releaseId of requestedReleaseIds) after.add(releaseId);
    } else {
      for (const releaseId of requestedReleaseIds) after.delete(releaseId);
    }

    const toAdd = [...after].filter((releaseId) => !current.has(releaseId)).sort();
    const toRemove = [...current].filter((releaseId) => !after.has(releaseId)).sort();
    if (toAdd.some((releaseId) => archivedIds.has(releaseId))) {
      throw new Error("Une release archivée ne peut pas être ajoutée.");
    }

    const beforeLabels = labelsFor(current, releaseById);
    const afterLabels = labelsFor(after, releaseById);
    const changed = toAdd.length > 0 || toRemove.length > 0;
    results.set(itemId, { changed, before: beforeLabels, after: afterLabels });
    if (!changed) continue;

    for (const releaseId of toAdd) {
      additions.push({ backlogId: input.backlogId, itemId, releaseId });
    }
    if (toRemove.length > 0) removals.set(itemId, toRemove);
    activityRows.push({
      itemId,
      actorId,
      action: "update",
      field: "fix_versions",
      oldValue: JSON.stringify(beforeLabels),
      newValue: JSON.stringify(afterLabels),
      requestCorrelationId,
    });
  }

  for (const [itemId, releaseIds] of removals) {
    await tx
      .delete(itemFixVersions)
      .where(
        and(
          eq(itemFixVersions.itemId, itemId),
          inArray(itemFixVersions.releaseId, releaseIds),
        ),
      );
  }
  for (let offset = 0; offset < additions.length; offset += INSERT_BATCH_SIZE) {
    await tx.insert(itemFixVersions).values(additions.slice(offset, offset + INSERT_BATCH_SIZE));
  }
  if (activityRows.length > 0) await tx.insert(activities).values(activityRows);

  return results;
}

export async function changeItemFixVersionsInTx(
  tx: ItemFixVersionTx,
  input: ChangeItemFixVersionsInput,
  actorId: string,
  requestCorrelationId: string,
): Promise<FixVersionMutationResult> {
  const results = await mutateItemFixVersionsInTx(
    tx,
    { ...input, itemIds: [input.itemId] },
    actorId,
    requestCorrelationId,
  );
  return results.get(input.itemId)!;
}

export function replaceItemFixVersionsInTx(
  tx: ItemFixVersionTx,
  input: { backlogId: string; itemId: string; releaseIds: string[] },
  actorId: string,
  requestCorrelationId: string,
) {
  return changeItemFixVersionsInTx(
    tx,
    { ...input, mode: "replace" },
    actorId,
    requestCorrelationId,
  );
}

export async function bulkChangeItemFixVersionsInTx(
  tx: ItemFixVersionTx,
  input: BulkFixVersionInput,
  actorId: string,
  requestCorrelationId: string,
): Promise<{ changedCount: number; unchangedCount: number }> {
  const results = await mutateItemFixVersionsInTx(tx, input, actorId, requestCorrelationId);
  const changedCount = [...results.values()].filter((result) => result.changed).length;
  return { changedCount, unchangedCount: input.itemIds.length - changedCount };
}

export async function changeItemFixVersions(
  input: unknown,
  actorId: string,
  requestCorrelationId: string,
): Promise<FixVersionMutationResult> {
  const data = changeItemFixVersionsSchema.parse(input);
  return db.transaction((tx) =>
    changeItemFixVersionsInTx(tx, data, actorId, requestCorrelationId),
  );
}

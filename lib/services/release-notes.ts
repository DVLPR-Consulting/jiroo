import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { itemFixVersions, items, releasePublications, releases, statuses } from "@/lib/db/schema/domain";
import type { ReleaseNotesModel } from "@/lib/releases/notes";

/** Upper bound of items read for one release notes document. */
export const RELEASE_NOTES_ITEM_LIMIT = 5_000;

const releaseNotesCommand = z.object({ backlogId: z.uuid(), releaseId: z.uuid() }).strict();

/**
 * Reads the model for release notes from the version's CURRENT items (Jira
 * regenerates notes from the version's current state on each view). Sub-tasks
 * and trashed items are excluded. Two bounded queries whatever the item count.
 */
export async function getReleaseNotesModel(input: unknown): Promise<ReleaseNotesModel | null> {
  const data = releaseNotesCommand.parse(input);
  const [[release], rows] = await Promise.all([
    db
      .select({
        name: releases.name,
        description: releases.description,
        effectiveReleaseDate: releasePublications.effectiveDate,
      })
      .from(releases)
      .leftJoin(
        releasePublications,
        and(
          eq(releasePublications.releaseId, releases.id),
          eq(releasePublications.backlogId, releases.backlogId),
          isNull(releasePublications.unreleasedAt),
        ),
      )
      .where(and(eq(releases.id, data.releaseId), eq(releases.backlogId, data.backlogId))),
    db
      .select({
        key: items.key,
        title: items.title,
        kind: items.kind,
        type: items.type,
        statusCategory: statuses.category,
      })
      .from(itemFixVersions)
      .innerJoin(
        items,
        and(eq(items.id, itemFixVersions.itemId), eq(items.backlogId, itemFixVersions.backlogId)),
      )
      .innerJoin(
        statuses,
        and(eq(statuses.id, items.statusId), eq(statuses.backlogId, items.backlogId)),
      )
      .where(
        and(
          eq(itemFixVersions.backlogId, data.backlogId),
          eq(itemFixVersions.releaseId, data.releaseId),
          isNull(items.deletedAt),
          ne(items.type, "soustache"),
        ),
      )
      .orderBy(asc(items.key))
      .limit(RELEASE_NOTES_ITEM_LIMIT + 1),
  ]);
  if (!release) return null;
  return {
    releaseName: release.name,
    description: release.description,
    effectiveReleaseDate: release.effectiveReleaseDate,
    truncated: rows.length > RELEASE_NOTES_ITEM_LIMIT,
    items: rows.slice(0, RELEASE_NOTES_ITEM_LIMIT).map((row) => ({
      key: row.key,
      title: row.title,
      kind: row.kind,
      type: row.type,
      completed: row.statusCategory === "done",
    })),
  };
}

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogs,
  itemFixVersions,
  items,
  releaseEvents,
  releasePublicationItems,
  releasePublications,
  releases,
  statuses,
} from "@/lib/db/schema/domain";
import {
  createReleaseSchema,
  publishReleaseSchema,
  revisionedReleaseIdentitySchema,
  updateReleaseSchema,
} from "@/lib/validation/release";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ReleaseProgress = {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  totalPoints: number;
  donePoints: number;
  unestimated: number;
};

export type ReleaseSummary = {
  id: string;
  name: string;
  description: string | null;
  driver: { id: string; name: string } | null;
  startDate: string | null;
  targetDate: string | null;
  effectiveReleaseDate: string | null;
  released: boolean;
  archived: boolean;
  overdue: boolean;
  revision: number;
  progress: ReleaseProgress;
};

export type ReleaseDetail = ReleaseSummary & {
  createdAt: Date;
  updatedAt: Date;
};

export type ReleaseScopeItem = {
  id: string;
  key: string;
  title: string;
  type: typeof items.$inferSelect.type;
  kind: typeof items.$inferSelect.kind;
  status: {
    id: string;
    name: string;
    category: typeof statuses.$inferSelect.category;
    color: string;
  };
  estimatePoints: number | null;
};

export type PublicationSnapshotItem = {
  id: string;
  itemId: string | null;
  itemKey: string;
  itemTitle: string;
  statusName: string;
  completed: boolean;
  estimatePoints: number | null;
  disposition: typeof releasePublicationItems.$inferSelect.disposition;
  destinationRelease: { id: string | null; name: string } | null;
};

export type ReleaseEvent = {
  id: string;
  releaseName: string;
  actor: { id: string | null; name: string };
  action: string;
  oldValue: unknown;
  newValue: unknown;
  requestCorrelationId: string | null;
  createdAt: Date;
};

type Page<T> = { rows: T[]; total: number };

export type PublishReleaseResult = {
  release: { id: string; revision: number };
  publicationId: string;
  totalCount: number;
  completedCount: number;
  incompleteCount: number;
  movedCount: number;
};

const pageCommand = z.object({
  backlogId: z.uuid(),
  page: z.number().int().min(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(100, "La taille de page ne peut pas dépasser 100."),
});
const releasePageCommand = pageCommand.extend({ releaseId: z.uuid() });
const publicationPageCommand = pageCommand.extend({ publicationId: z.uuid() });
const RELEASE_WRITE_BATCH_SIZE = 1_000;

async function lockBacklog(tx: Tx, backlogId: string) {
  const [backlog] = await tx
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.id, backlogId))
    .for("update");
  if (!backlog) throw new Error("Backlog introuvable.");
  return backlog;
}

async function lockRelease(tx: Tx, backlogId: string, releaseId: string) {
  const [release] = await tx
    .select()
    .from(releases)
    .where(and(eq(releases.id, releaseId), eq(releases.backlogId, backlogId)))
    .for("update");
  if (!release) throw new Error("Release introuvable.");
  return release;
}

async function lockReleases(tx: Tx, backlogId: string, releaseIds: string[]) {
  const sortedIds = [...new Set(releaseIds)].sort();
  return tx
    .select()
    .from(releases)
    .where(and(eq(releases.backlogId, backlogId), inArray(releases.id, sortedIds)))
    .orderBy(asc(releases.id))
    .for("update");
}

async function readUser(tx: Tx, userId: string, label: "Acteur" | "Pilote") {
  const [row] = await tx
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .for("key share");
  if (!row) throw new Error(`${label} introuvable.`);
  return row;
}

async function assertUniqueReleaseName(
  tx: Tx,
  backlogId: string,
  releaseName: string,
  exceptId?: string,
) {
  const [duplicate] = await tx
    .select({ id: releases.id })
    .from(releases)
    .where(
      and(
        eq(releases.backlogId, backlogId),
        sql`lower(${releases.name}) = lower(${releaseName})`,
        exceptId ? ne(releases.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (duplicate) throw new Error("Une release portant ce nom existe déjà.");
}

function assertDateOrder(startDate: string | null, targetDate: string | null) {
  if (startDate !== null && targetDate !== null && targetDate < startDate) {
    throw new Error("La date cible doit suivre la date de début.");
  }
}

function eventSnapshot(
  release: Pick<
    typeof releases.$inferSelect,
    "name" | "description" | "driverId" | "startDate" | "releaseDate" | "revision"
  >,
  driver: { id: string; name: string } | null,
) {
  return {
    name: release.name,
    description: release.description,
    driver,
    startDate: release.startDate,
    targetDate: release.releaseDate,
    revision: release.revision,
  };
}

async function appendReleaseEvent(
  tx: Tx,
  event: {
    backlogId: string;
    releaseId: string;
    publicationId?: string;
    releaseName: string;
    actor: { id: string; name: string };
    action: string;
    oldValue: unknown;
    newValue: unknown;
    requestCorrelationId: string;
  },
) {
  const { actor, ...values } = event;
  await tx.insert(releaseEvents).values({
    ...values,
    actorId: actor.id,
    actorLabel: actor.name,
  });
}

export async function createRelease(
  input: unknown,
  actorId: string,
  requestCorrelationId: string,
): Promise<{ id: string; revision: number }> {
  const data = createReleaseSchema.parse(input);
  const startDate = data.startDate ?? null;
  const targetDate = data.targetDate ?? null;
  assertDateOrder(startDate, targetDate);

  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    const actor = await readUser(tx, actorId, "Acteur");
    const driver = actor.id === data.driverId ? actor : await readUser(tx, data.driverId, "Pilote");
    await assertUniqueReleaseName(tx, data.backlogId, data.name);
    const [created] = await tx
      .insert(releases)
      .values({
        backlogId: data.backlogId,
        name: data.name,
        description: data.description ?? null,
        driverId: driver.id,
        createdBy: actor.id,
        startDate,
        releaseDate: targetDate,
      })
      .returning();
    if (!created) throw new Error("Création de release impossible.");
    await appendReleaseEvent(tx, {
      backlogId: data.backlogId,
      releaseId: created.id,
      releaseName: created.name,
      actor,
      action: "release_created",
      oldValue: null,
      newValue: eventSnapshot(created, driver),
      requestCorrelationId,
    });
    return { id: created.id, revision: created.revision };
  });
}

export async function updateRelease(
  input: unknown,
  actorId: string,
  requestCorrelationId: string,
): Promise<{ id: string; revision: number }> {
  const data = updateReleaseSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    const current = await lockRelease(tx, data.backlogId, data.releaseId);
    if (current.revision !== data.expectedRevision) {
      throw new Error("Cette release a changé. Rechargez-la avant de réessayer.");
    }
    const actor = await readUser(tx, actorId, "Acteur");
    const currentDriver =
      current.driverId === null ? null : await readUser(tx, current.driverId, "Pilote");
    const driver =
      data.driverId === undefined
        ? currentDriver
        : data.driverId === null
          ? null
          : data.driverId === current.driverId
            ? currentDriver
            : await readUser(tx, data.driverId, "Pilote");
    const startDate = data.startDate === undefined ? current.startDate : data.startDate;
    const targetDate = data.targetDate === undefined ? current.releaseDate : data.targetDate;
    assertDateOrder(startDate, targetDate);
    if (data.name !== undefined) {
      await assertUniqueReleaseName(tx, data.backlogId, data.name, current.id);
    }

    const [updated] = await tx
      .update(releases)
      .set({
        name: data.name ?? current.name,
        description: data.description === undefined ? current.description : data.description,
        driverId: driver?.id ?? null,
        startDate,
        releaseDate: targetDate,
        revision: current.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(releases.id, current.id))
      .returning();
    if (!updated) throw new Error("Mise à jour de release impossible.");
    await appendReleaseEvent(tx, {
      backlogId: data.backlogId,
      releaseId: updated.id,
      releaseName: updated.name,
      actor,
      action: "release_updated",
      oldValue: eventSnapshot(current, currentDriver),
      newValue: eventSnapshot(updated, driver),
      requestCorrelationId,
    });
    return { id: updated.id, revision: updated.revision };
  });
}

function assertExpectedRevision(current: { revision: number }, expectedRevision: number) {
  if (current.revision !== expectedRevision) {
    throw new Error("Cette release a changé. Rechargez-la avant de réessayer.");
  }
}

export async function publishRelease(
  input: unknown,
  actorId: string,
  requestCorrelationId: string,
): Promise<PublishReleaseResult> {
  const data = publishReleaseSchema.parse(input);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    const releaseIds = [
      data.releaseId,
      ...(data.incompleteDisposition === "move" ? [data.destinationReleaseId] : []),
    ];
    const lockedReleases = await lockReleases(tx, data.backlogId, releaseIds);
    const releaseById = new Map(lockedReleases.map((release) => [release.id, release]));
    const current = releaseById.get(data.releaseId);
    if (!current) throw new Error("Release introuvable.");
    assertExpectedRevision(current, data.expectedRevision);
    if (current.archivedAt !== null) {
      throw new Error("Une release archivée ne peut pas être publiée.");
    }

    const destination =
      data.incompleteDisposition === "move"
        ? releaseById.get(data.destinationReleaseId)
        : undefined;
    if (data.incompleteDisposition === "move") {
      if (!destination) {
        throw new Error("La release de destination est invalide pour ce backlog.");
      }
      if (destination.archivedAt !== null) {
        throw new Error("La release de destination est archivée.");
      }
    }

    const [activePublication] = await tx
      .select({ id: releasePublications.id })
      .from(releasePublications)
      .where(
        and(
          eq(releasePublications.backlogId, data.backlogId),
          eq(releasePublications.releaseId, current.id),
          isNull(releasePublications.supersededAt),
        ),
      )
      .limit(1)
      .for("update");
    if (activePublication) throw new Error("Cette release est déjà publiée.");

    const scopeItems = await tx
      .select({
        id: items.id,
        key: items.key,
        title: items.title,
        statusId: items.statusId,
        estimatePoints: items.estimatePoints,
      })
      .from(itemFixVersions)
      .innerJoin(
        items,
        and(
          eq(items.id, itemFixVersions.itemId),
          eq(items.backlogId, itemFixVersions.backlogId),
        ),
      )
      .where(
        and(
          eq(itemFixVersions.backlogId, data.backlogId),
          eq(itemFixVersions.releaseId, current.id),
          isNull(items.deletedAt),
        ),
      )
      .orderBy(asc(items.id))
      .for("update");
    const statusIds = [...new Set(scopeItems.map((item) => item.statusId))].sort();
    const statusRows =
      statusIds.length === 0
        ? []
        : await tx
            .select({
              id: statuses.id,
              backlogId: statuses.backlogId,
              name: statuses.name,
              category: statuses.category,
            })
            .from(statuses)
            .where(inArray(statuses.id, statusIds))
            .orderBy(asc(statuses.id));
    if (
      statusRows.length !== statusIds.length ||
      statusRows.some((status) => status.backlogId !== data.backlogId)
    ) {
      throw new Error("Le scope de la release est incohérent.");
    }
    const statusById = new Map(statusRows.map((status) => [status.id, status]));
    const actor = await readUser(tx, actorId, "Acteur");
    const [sequenceRow] = await tx
      .select({
        sequence: sql<number>`coalesce(max(${releasePublications.sequence}), 0)::int`,
      })
      .from(releasePublications)
      .where(
        and(
          eq(releasePublications.backlogId, data.backlogId),
          eq(releasePublications.releaseId, current.id),
        ),
      );
    const sequence = (sequenceRow?.sequence ?? 0) + 1;
    const nextRevision = current.revision + 1;
    const [publication] = await tx
      .insert(releasePublications)
      .values({
        backlogId: data.backlogId,
        releaseId: current.id,
        sequence,
        releaseRevision: nextRevision,
        releaseName: current.name,
        effectiveDate: data.effectiveDate,
        incompleteDisposition: data.incompleteDisposition,
        destinationReleaseId: destination?.id ?? null,
        destinationReleaseName: destination?.name ?? null,
        publishedBy: actor.id,
      })
      .returning({ id: releasePublications.id });
    if (!publication) throw new Error("Publication impossible.");

    const completedItemIds: string[] = [];
    const incompleteItemIds: string[] = [];
    const snapshotRows = scopeItems.map((item) => {
      const status = statusById.get(item.statusId);
      if (!status) throw new Error("Le scope de la release est incohérent.");
      const completed = status.category === "done";
      if (completed) completedItemIds.push(item.id);
      else incompleteItemIds.push(item.id);
      const moved = !completed && data.incompleteDisposition === "move";
      return {
        publicationId: publication.id,
        backlogId: data.backlogId,
        itemId: item.id,
        itemKey: item.key,
        itemTitle: item.title,
        statusName: status.name,
        completed,
        estimatePoints: item.estimatePoints,
        disposition: moved ? ("moved" as const) : ("retained" as const),
        destinationReleaseId: moved ? destination!.id : null,
        destinationReleaseName: moved ? destination!.name : null,
      };
    });
    for (let offset = 0; offset < snapshotRows.length; offset += RELEASE_WRITE_BATCH_SIZE) {
      await tx
        .insert(releasePublicationItems)
        .values(snapshotRows.slice(offset, offset + RELEASE_WRITE_BATCH_SIZE));
    }

    if (data.incompleteDisposition === "move" && incompleteItemIds.length > 0) {
      for (
        let offset = 0;
        offset < incompleteItemIds.length;
        offset += RELEASE_WRITE_BATCH_SIZE
      ) {
        const itemIdBatch = incompleteItemIds.slice(offset, offset + RELEASE_WRITE_BATCH_SIZE);
        await tx
          .delete(itemFixVersions)
          .where(
            and(
              eq(itemFixVersions.backlogId, data.backlogId),
              eq(itemFixVersions.releaseId, current.id),
              inArray(itemFixVersions.itemId, itemIdBatch),
            ),
          );
      }
      for (
        let offset = 0;
        offset < incompleteItemIds.length;
        offset += RELEASE_WRITE_BATCH_SIZE
      ) {
        await tx
          .insert(itemFixVersions)
          .values(
            incompleteItemIds.slice(offset, offset + RELEASE_WRITE_BATCH_SIZE).map((itemId) => ({
              backlogId: data.backlogId,
              itemId,
              releaseId: destination!.id,
            })),
          )
          .onConflictDoNothing();
      }
    }

    const [updated] = await tx
      .update(releases)
      .set({ revision: nextRevision, updatedAt: new Date() })
      .where(eq(releases.id, current.id))
      .returning({ id: releases.id, revision: releases.revision });
    if (!updated) throw new Error("Publication impossible.");
    await appendReleaseEvent(tx, {
      backlogId: data.backlogId,
      releaseId: current.id,
      publicationId: publication.id,
      releaseName: current.name,
      actor,
      action: "release_published",
      oldValue: { released: false, revision: current.revision },
      newValue: {
        released: true,
        revision: updated.revision,
        publicationId: publication.id,
        sequence,
        effectiveDate: data.effectiveDate,
        incompleteDisposition: data.incompleteDisposition,
        destinationRelease: destination ? { id: destination.id, name: destination.name } : null,
      },
      requestCorrelationId,
    });

    return {
      release: updated,
      publicationId: publication.id,
      totalCount: scopeItems.length,
      completedCount: completedItemIds.length,
      incompleteCount: incompleteItemIds.length,
      movedCount: data.incompleteDisposition === "move" ? incompleteItemIds.length : 0,
    };
  });
}

export async function unreleaseRelease(
  input: unknown,
  actorId: string,
  requestCorrelationId: string,
): Promise<{ release: { id: string; revision: number }; publicationId: string }> {
  const data = revisionedReleaseIdentitySchema.parse(input);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    const current = await lockRelease(tx, data.backlogId, data.releaseId);
    assertExpectedRevision(current, data.expectedRevision);
    const [publication] = await tx
      .select()
      .from(releasePublications)
      .where(
        and(
          eq(releasePublications.backlogId, data.backlogId),
          eq(releasePublications.releaseId, current.id),
          isNull(releasePublications.supersededAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!publication) throw new Error("Cette release n’est pas publiée.");
    const actor = await readUser(tx, actorId, "Acteur");
    await tx
      .update(releasePublications)
      .set({
        supersededAt: sql`greatest(current_timestamp, ${releasePublications.publishedAt})`,
      })
      .where(eq(releasePublications.id, publication.id));
    const [updated] = await tx
      .update(releases)
      .set({ revision: current.revision + 1, updatedAt: new Date() })
      .where(eq(releases.id, current.id))
      .returning({ id: releases.id, revision: releases.revision });
    if (!updated) throw new Error("Dépublication impossible.");
    await appendReleaseEvent(tx, {
      backlogId: data.backlogId,
      releaseId: current.id,
      publicationId: publication.id,
      releaseName: current.name,
      actor,
      action: "release_unreleased",
      oldValue: {
        released: true,
        revision: current.revision,
        publicationId: publication.id,
        sequence: publication.sequence,
        effectiveDate: publication.effectiveDate,
      },
      newValue: { released: false, revision: updated.revision },
      requestCorrelationId,
    });
    return { release: updated, publicationId: publication.id };
  });
}

async function setReleaseArchived(
  input: unknown,
  actorId: string,
  requestCorrelationId: string,
  archived: boolean,
): Promise<{ id: string; revision: number }> {
  const data = revisionedReleaseIdentitySchema.parse(input);
  return db.transaction(async (tx) => {
    await lockBacklog(tx, data.backlogId);
    const current = await lockRelease(tx, data.backlogId, data.releaseId);
    assertExpectedRevision(current, data.expectedRevision);
    if (archived && current.archivedAt !== null) {
      throw new Error("Cette release est déjà archivée.");
    }
    if (!archived && current.archivedAt === null) {
      throw new Error("Cette release n’est pas archivée.");
    }
    const actor = await readUser(tx, actorId, "Acteur");
    const [updated] = await tx
      .update(releases)
      .set({
        archivedAt: archived ? new Date() : null,
        revision: current.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(releases.id, current.id))
      .returning({ id: releases.id, revision: releases.revision });
    if (!updated) throw new Error("Changement d’archivage impossible.");
    await appendReleaseEvent(tx, {
      backlogId: data.backlogId,
      releaseId: current.id,
      releaseName: current.name,
      actor,
      action: archived ? "release_archived" : "release_unarchived",
      oldValue: { archived: !archived, revision: current.revision },
      newValue: { archived, revision: updated.revision },
      requestCorrelationId,
    });
    return updated;
  });
}

export function archiveRelease(
  input: unknown,
  actorId: string,
  requestCorrelationId: string,
) {
  return setReleaseArchived(input, actorId, requestCorrelationId, true);
}

export function unarchiveRelease(
  input: unknown,
  actorId: string,
  requestCorrelationId: string,
) {
  return setReleaseArchived(input, actorId, requestCorrelationId, false);
}

function releaseSummaryQuery(
  backlogId: string,
  options: { includeArchived: boolean; releaseId?: string },
) {
  const progress = db
    .select({
      releaseId: itemFixVersions.releaseId,
      total: sql<number>`count(*)::int`.as("total"),
      todo: sql<number>`count(*) filter (where ${statuses.category} = 'todo')::int`.as("todo"),
      inProgress:
        sql<number>`count(*) filter (where ${statuses.category} = 'in_progress')::int`.as(
          "in_progress",
        ),
      done: sql<number>`count(*) filter (where ${statuses.category} = 'done')::int`.as("done"),
      totalPoints:
        sql<number>`coalesce(sum(${items.estimatePoints}), 0)::double precision`.as(
          "total_points",
        ),
      donePoints:
        sql<number>`coalesce(sum(${items.estimatePoints}) filter (where ${statuses.category} = 'done'), 0)::double precision`.as(
          "done_points",
        ),
      unestimated:
        sql<number>`count(*) filter (where ${items.estimatePoints} is null)::int`.as(
          "unestimated",
        ),
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
      statuses,
      and(eq(statuses.id, items.statusId), eq(statuses.backlogId, items.backlogId)),
    )
    .where(and(eq(itemFixVersions.backlogId, backlogId), isNull(items.deletedAt)))
    .groupBy(itemFixVersions.releaseId)
    .as("release_progress");
  const publication = db
    .select({
      releaseId: releasePublications.releaseId,
      effectiveDate: releasePublications.effectiveDate,
    })
    .from(releasePublications)
    .where(
      and(
        eq(releasePublications.backlogId, backlogId),
        isNotNull(releasePublications.releaseId),
        isNull(releasePublications.supersededAt),
      ),
    )
    .as("active_release_publication");

  return db
    .select({
      id: releases.id,
      name: releases.name,
      description: releases.description,
      driverId: user.id,
      driverName: user.name,
      startDate: releases.startDate,
      targetDate: releases.releaseDate,
      effectiveReleaseDate: publication.effectiveDate,
      released: sql<boolean>`${publication.releaseId} is not null`,
      archived: sql<boolean>`${releases.archivedAt} is not null`,
      overdue: sql<boolean>`coalesce(${publication.releaseId} is null and ${releases.releaseDate} < current_date, false)`,
      revision: releases.revision,
      total: sql<number>`coalesce(${progress.total}, 0)::int`,
      todo: sql<number>`coalesce(${progress.todo}, 0)::int`,
      inProgress: sql<number>`coalesce(${progress.inProgress}, 0)::int`,
      done: sql<number>`coalesce(${progress.done}, 0)::int`,
      totalPoints: sql<number>`coalesce(${progress.totalPoints}, 0)::double precision`,
      donePoints: sql<number>`coalesce(${progress.donePoints}, 0)::double precision`,
      unestimated: sql<number>`coalesce(${progress.unestimated}, 0)::int`,
      createdAt: releases.createdAt,
      updatedAt: releases.updatedAt,
    })
    .from(releases)
    .leftJoin(user, eq(user.id, releases.driverId))
    .leftJoin(progress, eq(progress.releaseId, releases.id))
    .leftJoin(publication, eq(publication.releaseId, releases.id))
    .where(
      and(
        eq(releases.backlogId, backlogId),
        options.releaseId ? eq(releases.id, options.releaseId) : undefined,
        options.includeArchived ? undefined : isNull(releases.archivedAt),
      ),
    )
    .orderBy(asc(releases.releaseDate), asc(releases.name), asc(releases.id));
}

type SummaryRow = Awaited<ReturnType<typeof releaseSummaryQuery>>[number];

function toReleaseSummary(row: SummaryRow): ReleaseSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    driver: row.driverId && row.driverName ? { id: row.driverId, name: row.driverName } : null,
    startDate: row.startDate,
    targetDate: row.targetDate,
    effectiveReleaseDate: row.effectiveReleaseDate,
    released: row.released,
    archived: row.archived,
    overdue: row.overdue,
    revision: row.revision,
    progress: {
      total: row.total,
      todo: row.todo,
      inProgress: row.inProgress,
      done: row.done,
      totalPoints: row.totalPoints,
      donePoints: row.donePoints,
      unestimated: row.unestimated,
    },
  };
}

export async function listReleaseSummaries(
  backlogId: string,
  options: { includeArchived?: boolean } = {},
): Promise<ReleaseSummary[]> {
  const rows = await releaseSummaryQuery(backlogId, {
    includeArchived: options.includeArchived ?? false,
  });
  return rows.map(toReleaseSummary);
}

export async function getReleaseDetail(
  backlogId: string,
  releaseId: string,
): Promise<ReleaseDetail | null> {
  const [row] = await releaseSummaryQuery(backlogId, {
    includeArchived: true,
    releaseId,
  });
  if (!row) return null;
  return { ...toReleaseSummary(row), createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export async function listReleaseScopeItems(input: unknown): Promise<Page<ReleaseScopeItem>> {
  const data = releasePageCommand.parse(input);
  const where = and(
    eq(itemFixVersions.backlogId, data.backlogId),
    eq(itemFixVersions.releaseId, data.releaseId),
    isNull(items.deletedAt),
  );
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: items.id,
        key: items.key,
        title: items.title,
        type: items.type,
        kind: items.kind,
        statusId: statuses.id,
        statusName: statuses.name,
        statusCategory: statuses.category,
        statusColor: statuses.color,
        estimatePoints: items.estimatePoints,
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
        statuses,
        and(eq(statuses.id, items.statusId), eq(statuses.backlogId, items.backlogId)),
      )
      .where(where)
      .orderBy(asc(items.key), asc(items.id))
      .limit(data.pageSize)
      .offset((data.page - 1) * data.pageSize),
    db
      .select({ total: count() })
      .from(itemFixVersions)
      .innerJoin(
        items,
        and(
          eq(items.id, itemFixVersions.itemId),
          eq(items.backlogId, itemFixVersions.backlogId),
        ),
      )
      .where(where),
  ]);
  return {
    total: totalRows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      key: row.key,
      title: row.title,
      type: row.type,
      kind: row.kind,
      status: {
        id: row.statusId,
        name: row.statusName,
        category: row.statusCategory,
        color: row.statusColor,
      },
      estimatePoints: row.estimatePoints,
    })),
  };
}

export async function listPublicationSnapshotItems(
  input: unknown,
): Promise<Page<PublicationSnapshotItem>> {
  const data = publicationPageCommand.parse(input);
  const where = and(
    eq(releasePublicationItems.backlogId, data.backlogId),
    eq(releasePublicationItems.publicationId, data.publicationId),
  );
  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(releasePublicationItems)
      .where(where)
      .orderBy(asc(releasePublicationItems.itemKey), asc(releasePublicationItems.id))
      .limit(data.pageSize)
      .offset((data.page - 1) * data.pageSize),
    db.select({ total: count() }).from(releasePublicationItems).where(where),
  ]);
  return {
    total: totalRows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      itemKey: row.itemKey,
      itemTitle: row.itemTitle,
      statusName: row.statusName,
      completed: row.completed,
      estimatePoints: row.estimatePoints,
      disposition: row.disposition,
      destinationRelease:
        row.destinationReleaseName === null
          ? null
          : { id: row.destinationReleaseId, name: row.destinationReleaseName },
    })),
  };
}

export async function listReleaseEvents(input: unknown): Promise<Page<ReleaseEvent>> {
  const data = releasePageCommand.parse(input);
  const where = and(
    eq(releaseEvents.backlogId, data.backlogId),
    eq(releaseEvents.releaseId, data.releaseId),
  );
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: releaseEvents.id,
        releaseName: releaseEvents.releaseName,
        actorId: releaseEvents.actorId,
        actorLabel: releaseEvents.actorLabel,
        action: releaseEvents.action,
        oldValue: releaseEvents.oldValue,
        newValue: releaseEvents.newValue,
        requestCorrelationId: releaseEvents.requestCorrelationId,
        createdAt: releaseEvents.createdAt,
      })
      .from(releaseEvents)
      .where(where)
      .orderBy(desc(releaseEvents.createdAt), desc(releaseEvents.id))
      .limit(data.pageSize)
      .offset((data.page - 1) * data.pageSize),
    db.select({ total: count() }).from(releaseEvents).where(where),
  ]);
  return {
    total: totalRows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      releaseName: row.releaseName,
      actor: { id: row.actorId, name: row.actorLabel },
      action: row.action,
      oldValue: row.oldValue,
      newValue: row.newValue,
      requestCorrelationId: row.requestCorrelationId,
      createdAt: row.createdAt,
    })),
  };
}

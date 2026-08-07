import {
  and,
  asc,
  count,
  desc,
  eq,
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

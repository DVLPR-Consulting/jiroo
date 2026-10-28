import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import {
  accessModeEnum,
  activityActionEnum,
  displayModeEnum,
  itemKindEnum,
  itemTypeEnum,
  linkTypeEnum,
  notificationTypeEnum,
  permissionPrincipalEnum,
  permissionScopeEnum,
  refKindEnum,
  refStateEnum,
  releaseIncompleteDispositionEnum,
  repoProviderEnum,
  releaseItemDispositionEnum,
  roleActorTypeEnum,
  sprintEventTypeEnum,
  sprintOutcomeEnum,
  sprintRemovalReasonEnum,
  sprintStateEnum,
  statusCategoryEnum,
} from "./enums";
import { ltree, tsvector } from "./types";

// Global numeric sequence backing per-backlog item keys (e.g. CASS-42).
export const itemKeySeq = pgSequence("item_key_seq", { startWith: 1, increment: 1 });
export const sprintEventSequence = pgSequence("sprint_event_sequence");

export const backlogs = pgTable("backlogs", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#7c3030"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  // Jira's "project lead": informative only, grants nothing (JIR-82).
  leadUserId: text("lead_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A user's favourite backlogs, listed first on the home page and in the
// backlog selector (JIR-82, Jira's starred projects).
export const backlogStars = pgTable(
  "backlog_stars",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.backlogId] })],
);

export const sprints = pgTable(
  "sprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    goal: text("goal"),
    state: sprintStateEnum("state").notNull().default("planned"),
    rank: text("rank").notNull(),
    capacityPoints: numeric("capacity_points", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    plannedStartAt: timestamp("planned_start_at", { withTimezone: true }),
    plannedEndAt: timestamp("planned_end_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sprints_backlog_id_idx").on(t.backlogId, t.id),
    uniqueIndex("sprints_backlog_rank_idx").on(t.backlogId, t.rank),
    uniqueIndex("sprints_backlog_name_idx").on(t.backlogId, sql`lower(${t.name})`),
    uniqueIndex("sprints_one_active_per_backlog_idx")
      .on(t.backlogId)
      .where(sql`${t.state} = 'active'`),
    check(
      "sprints_capacity_points_range",
      sql`${t.capacityPoints} is null or (${t.capacityPoints} >= 0 and ${t.capacityPoints} <= 999.99)`,
    ),
    check(
      "sprints_planned_dates_order",
      sql`${t.plannedEndAt} is null or (${t.plannedStartAt} is not null and ${t.plannedEndAt} > ${t.plannedStartAt})`,
    ),
    check(
      "sprints_state_dates_consistent",
      sql`(
        (${t.state} = 'planned' and ${t.startedAt} is null and ${t.completedAt} is null)
        or (${t.state} = 'active' and ${t.startedAt} is not null and ${t.completedAt} is null)
        or (${t.state} = 'completed' and ${t.startedAt} is not null and ${t.completedAt} is not null and ${t.completedAt} >= ${t.startedAt})
      )`,
    ),
  ],
);

export const statuses = pgTable("statuses", {
  id: uuid("id").primaryKey().defaultRandom(),
  backlogId: uuid("backlog_id")
    .notNull()
    .references(() => backlogs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: statusCategoryEnum("category").notNull(),
  order: integer("order").notNull(),
  color: text("color").notNull(),
});

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    type: itemTypeEnum("type").notNull(),
    kind: itemKindEnum("kind").notNull().default("feature"),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    parentId: uuid("parent_id").references((): AnyPgColumn => items.id, {
      onDelete: "cascade",
    }),
    statusId: uuid("status_id")
      .notNull()
      .references(() => statuses.id),
    priority: integer("priority").notNull().default(0),
    estimatePoints: numeric("estimate_points", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id),
    rank: text("rank").notNull(),
    path: ltree("path").notNull(),
    depth: integer("depth").notNull().default(0),
    // Calendar days ("YYYY-MM-DD"): a day has no time zone (JIR-101).
    startDate: date("start_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    search: tsvector("search").generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('french', coalesce(${items.title}, '') || ' ' || coalesce(${items.description}, ''))`,
    ),
  },
  (t) => [
    // Rank is a single GLOBAL order per backlog (LexoRank-style total order), so the same
    // value can order siblings in the tree AND cards across a status column on the board.
    // UNIQUE per (backlog, rank) so concurrent same-gap drops collide at the DB and withRetry
    // re-midpoints. rank is NOT NULL, so no NULLS-NOT-DISTINCT handling is needed.
    uniqueIndex("items_backlog_rank_idx").on(t.backlogId, t.rank),
    uniqueIndex("items_backlog_id_idx").on(t.backlogId, t.id),
    index("items_path_idx").using("gist", t.path),
    index("items_search_idx").using("gin", t.search),
    check(
      "items_path_self_inclusive",
      sql`subpath(${t.path}, nlevel(${t.path}) - 1)::text = replace(${t.id}::text, '-', '')`,
    ),
    check(
      "items_estimate_points_range",
      sql`${t.estimatePoints} is null or (${t.estimatePoints} >= 0 and ${t.estimatePoints} <= 999.99)`,
    ),
    check(
      "items_start_before_due",
      sql`${t.startDate} is null or ${t.dueDate} is null or ${t.startDate} <= ${t.dueDate}`,
    ),
  ],
);

export const releases = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    startDate: date("start_date", { mode: "string" }),
    releaseDate: date("release_date", { mode: "string" }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedBy: text("released_by").references(() => user.id),
    effectiveReleaseDate: date("effective_release_date", { mode: "string" }),
    revision: integer("revision").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: text("archived_by").references(() => user.id),
    driverId: text("driver_id").references(() => user.id, { onDelete: "set null" }),
    // Manual release order (fractional index, one sequence per backlog). Nullable:
    // rows created before manual ordering are ranked lazily on the first reorder.
    rank: text("rank"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("releases_backlog_id_idx").on(t.backlogId, t.id),
    // NULL ranks stay distinct in PostgreSQL, so unranked legacy rows coexist.
    uniqueIndex("releases_backlog_rank_idx").on(t.backlogId, t.rank),
    uniqueIndex("releases_backlog_name_idx").on(t.backlogId, sql`lower(btrim(${t.name}))`),
    check("releases_name_nonempty", sql`btrim(${t.name}) <> ''`),
    check("releases_revision_positive", sql`${t.revision} > 0`),
    check(
      "releases_dates_order",
      sql`${t.startDate} is null or ${t.releaseDate} is null or ${t.releaseDate} >= ${t.startDate}`,
    ),
    check(
      "releases_publication_state_complete",
      sql`num_nonnulls(${t.releasedAt}, ${t.releasedBy}, ${t.effectiveReleaseDate}) in (0, 3)`,
    ),
    check(
      "releases_archive_state_complete",
      sql`num_nonnulls(${t.archivedAt}, ${t.archivedBy}) in (0, 2)`,
    ),
  ],
);

export const itemFixVersions = pgTable(
  "item_fix_versions",
  {
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    releaseId: uuid("release_id").notNull(),
    addedBy: text("added_by")
      .notNull()
      .references(() => user.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.releaseId] }),
    index("item_fix_versions_release_idx").on(t.releaseId),
    foreignKey({
      columns: [t.backlogId, t.itemId],
      foreignColumns: [items.backlogId, items.id],
      name: "item_fix_versions_item_same_backlog_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.backlogId, t.releaseId],
      foreignColumns: [releases.backlogId, releases.id],
      name: "item_fix_versions_release_same_backlog_fk",
    }).onDelete("cascade"),
  ],
);

export const releasePublications = pgTable(
  "release_publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "restrict" }),
    releaseId: uuid("release_id"),
    sequence: integer("sequence").notNull().default(1),
    releaseRevision: integer("release_revision").notNull(),
    releaseName: text("release_name").notNull(),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    incompleteDisposition: releaseIncompleteDispositionEnum("incomplete_disposition").notNull(),
    destinationReleaseId: uuid("destination_release_id"),
    destinationReleaseName: text("destination_release_name"),
    publishedBy: text("published_by")
      .notNull()
      .references(() => user.id),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    snapshotSealedAt: timestamp("snapshot_sealed_at", { withTimezone: true }),
    unreleasedAt: timestamp("unreleased_at", { withTimezone: true }),
    unreleasedBy: text("unreleased_by").references(() => user.id),
  },
  (t) => [
    index("release_publications_backlog_idx").on(t.backlogId),
    uniqueIndex("release_publications_backlog_id_idx").on(t.backlogId, t.id),
    uniqueIndex("release_publications_release_sequence_idx").on(t.releaseId, t.sequence),
    uniqueIndex("release_publications_one_active_per_release_idx")
      .on(t.releaseId)
      .where(sql`${t.unreleasedAt} is null`),
    check("release_publications_revision_positive", sql`${t.releaseRevision} > 0`),
    check("release_publications_sequence_positive", sql`${t.sequence} > 0`),
    check(
      "release_publications_unreleased_order",
      sql`${t.unreleasedAt} is null or ${t.unreleasedAt} >= ${t.publishedAt}`,
    ),
    check(
      "release_publications_unreleased_complete",
      sql`num_nonnulls(${t.unreleasedAt}, ${t.unreleasedBy}) in (0, 2)`,
    ),
    check(
      "release_publications_incomplete_disposition_consistent",
      sql`(
        (${t.incompleteDisposition} = 'keep' and ${t.destinationReleaseId} is null and ${t.destinationReleaseName} is null)
        or (${t.incompleteDisposition} = 'move' and ${t.destinationReleaseName} is not null)
      )`,
    ),
    foreignKey({
      columns: [t.backlogId, t.releaseId],
      foreignColumns: [releases.backlogId, releases.id],
      name: "release_publications_release_same_backlog_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.backlogId, t.destinationReleaseId],
      foreignColumns: [releases.backlogId, releases.id],
      name: "release_publications_destination_same_backlog_fk",
    }).onDelete("set null"),
  ],
);

export const releasePublicationItems = pgTable(
  "release_publication_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id").notNull(),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "restrict" }),
    itemId: uuid("item_id"),
    itemKey: text("item_key").notNull(),
    itemTitle: text("item_title").notNull(),
    itemType: itemTypeEnum("item_type").notNull(),
    statusId: uuid("status_id").notNull(),
    statusName: text("status_name").notNull(),
    statusCategory: statusCategoryEnum("status_category").notNull(),
    completed: boolean("completed").notNull().default(false),
    estimatePoints: numeric("estimate_points", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    disposition: releaseItemDispositionEnum("disposition").notNull(),
    destinationReleaseId: uuid("destination_release_id"),
    destinationReleaseName: text("destination_release_name"),
  },
  (t) => [
    uniqueIndex("release_publication_items_publication_key_idx").on(
      t.publicationId,
      t.itemKey,
    ),
    index("release_publication_items_item_idx").on(t.itemId),
    check(
      "release_publication_items_disposition_consistent",
      sql`(
        (${t.disposition} = 'retained' and ${t.destinationReleaseId} is null and ${t.destinationReleaseName} is null)
        or (${t.disposition} = 'moved' and ${t.destinationReleaseName} is not null)
      )`,
    ),
    foreignKey({
      columns: [t.backlogId, t.publicationId],
      foreignColumns: [releasePublications.backlogId, releasePublications.id],
      name: "release_publication_items_publication_same_backlog_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.backlogId, t.itemId],
      foreignColumns: [items.backlogId, items.id],
      name: "release_publication_items_item_same_backlog_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.backlogId, t.destinationReleaseId],
      foreignColumns: [releases.backlogId, releases.id],
      name: "release_publication_items_destination_same_backlog_fk",
    }).onDelete("set null"),
  ],
);

export const releaseEvents = pgTable(
  "release_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backlogId: uuid("backlog_id").references(() => backlogs.id, { onDelete: "set null" }),
    releaseId: uuid("release_id").references(() => releases.id, { onDelete: "set null" }),
    publicationId: uuid("publication_id").references(() => releasePublications.id, {
      onDelete: "set null",
    }),
    releaseName: text("release_name").notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    requestCorrelationId: text("request_correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("release_events_release_idx").on(t.releaseId),
    index("release_events_backlog_idx").on(t.backlogId),
    foreignKey({
      columns: [t.backlogId, t.releaseId],
      foreignColumns: [releases.backlogId, releases.id],
      name: "release_events_release_same_backlog_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.backlogId, t.publicationId],
      foreignColumns: [releasePublications.backlogId, releasePublications.id],
      name: "release_events_publication_same_backlog_fk",
    }).onDelete("set null"),
  ],
);

export const sprintItems = pgTable(
  "sprint_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    joinedBy: text("joined_by")
      .notNull()
      .references(() => user.id),
    estimateAtJoin: numeric("estimate_at_join", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    estimateAtStart: numeric("estimate_at_start", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    doneAtStart: boolean("done_at_start"),
    leftAt: timestamp("left_at", { withTimezone: true }),
    outcome: sprintOutcomeEnum("outcome"),
    destinationSprintId: uuid("destination_sprint_id").references(
      () => sprints.id,
      { onDelete: "restrict" },
    ),
  },
  (t) => [
    index("sprint_items_sprint_idx").on(t.sprintId),
    index("sprint_items_item_idx").on(t.itemId),
    uniqueIndex("sprint_items_sprint_id_idx").on(t.sprintId, t.id),
    uniqueIndex("sprint_items_one_current_item_idx")
      .on(t.itemId)
      .where(sql`${t.leftAt} is null`),
    check(
      "sprint_items_estimate_at_join_range",
      sql`${t.estimateAtJoin} is null or (${t.estimateAtJoin} >= 0 and ${t.estimateAtJoin} <= 999.99)`,
    ),
    check(
      "sprint_items_estimate_at_start_range",
      sql`${t.estimateAtStart} is null or (${t.estimateAtStart} >= 0 and ${t.estimateAtStart} <= 999.99)`,
    ),
    check(
      "sprint_items_outcome_consistent",
      sql`(
        (${t.leftAt} is null and ${t.outcome} is null and ${t.destinationSprintId} is null)
        or (${t.leftAt} is not null and ${t.outcome} is not null)
      )`,
    ),
    check(
      "sprint_items_destination_consistent",
      sql`(
        (${t.outcome} = 'carried_to_sprint' and ${t.destinationSprintId} is not null)
        or (${t.outcome} is distinct from 'carried_to_sprint' and ${t.destinationSprintId} is null)
      )`,
    ),
  ],
);

export const sprintEvents = pgTable(
  "sprint_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "restrict" }),
    sprintId: uuid("sprint_id").notNull(),
    eventType: sprintEventTypeEnum("event_type").notNull(),
    sourceMembershipId: uuid("source_membership_id"),
    itemId: uuid("item_id"),
    itemKey: text("item_key"),
    itemTitle: text("item_title"),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    requestCorrelationId: text("request_correlation_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    sequence: bigint("sequence", { mode: "bigint" })
      .notNull()
      .default(sql`nextval('sprint_event_sequence')`),
    previousEstimate: numeric("previous_estimate", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    nextEstimate: numeric("next_estimate", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    previousDone: boolean("previous_done"),
    nextDone: boolean("next_done"),
    relatedSprintId: uuid("related_sprint_id"),
    relatedSprintName: text("related_sprint_name"),
    removalReason: sprintRemovalReasonEnum("removal_reason"),
  },
  (t) => [
    uniqueIndex("sprint_events_sequence_idx").on(t.sequence),
    index("sprint_events_sprint_occurred_sequence_idx").on(
      t.sprintId,
      t.occurredAt,
      t.sequence,
    ),
    index("sprint_events_backlog_sprint_idx").on(t.backlogId, t.sprintId),
    check(
      "sprint_events_request_correlation_length",
      sql`char_length(btrim(${t.requestCorrelationId})) between 1 and 128`,
    ),
    check(
      "sprint_events_related_sprint_name_required",
      sql`(${t.relatedSprintId} is null) or (${t.relatedSprintName} is not null)`,
    ),
    check(
      "sprint_events_shape",
      sql`(
        (${t.eventType} in ('sprint_started', 'sprint_completed')
          and ${t.itemKey} is null and ${t.itemTitle} is null
          and ${t.previousEstimate} is null and ${t.nextEstimate} is null
          and ${t.previousDone} is null and ${t.nextDone} is null
          and ${t.removalReason} is null)
        or (${t.eventType} = 'item_added'
          and ${t.itemKey} is not null and ${t.itemTitle} is not null
          and ${t.previousEstimate} is null
          and ${t.previousDone} is null and ${t.nextDone} is not null
          and ${t.removalReason} is null)
        or (${t.eventType} = 'item_removed'
          and ${t.itemKey} is not null and ${t.itemTitle} is not null
          and ${t.nextEstimate} is null
          and ${t.previousDone} is null and ${t.nextDone} is null
          and ${t.removalReason} is not null)
        or (${t.eventType} = 'estimate_changed'
          and ${t.itemKey} is not null and ${t.itemTitle} is not null
          and ${t.previousEstimate} is distinct from ${t.nextEstimate}
          and ${t.previousDone} is null and ${t.nextDone} is null
          and ${t.removalReason} is null)
        or (${t.eventType} = 'item_completed'
          and ${t.itemKey} is not null and ${t.itemTitle} is not null
          and ${t.previousDone} = false and ${t.nextDone} = true
          and ${t.previousEstimate} is null and ${t.nextEstimate} is null
          and ${t.removalReason} is null)
        or (${t.eventType} = 'item_reopened'
          and ${t.itemKey} is not null and ${t.itemTitle} is not null
          and ${t.previousDone} = true and ${t.nextDone} = false
          and ${t.previousEstimate} is null and ${t.nextEstimate} is null
          and ${t.removalReason} is null)
      )`,
    ),
    foreignKey({
      columns: [t.backlogId, t.sprintId],
      foreignColumns: [sprints.backlogId, sprints.id],
      name: "sprint_events_sprint_same_backlog_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.sprintId, t.sourceMembershipId],
      foreignColumns: [sprintItems.sprintId, sprintItems.id],
      name: "sprint_events_membership_same_sprint_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.backlogId, t.itemId],
      foreignColumns: [items.backlogId, items.id],
      name: "sprint_events_item_same_backlog_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.backlogId, t.relatedSprintId],
      foreignColumns: [sprints.backlogId, sprints.id],
      name: "sprint_events_related_sprint_same_backlog_fk",
    }).onDelete("set null"),
  ],
);

export const sprintReportSnapshots = pgTable(
  "sprint_report_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "restrict" }),
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "restrict" }),
    sprintName: text("sprint_name").notNull(),
    sprintGoal: text("sprint_goal"),
    plannedStartAt: timestamp("planned_start_at", { withTimezone: true }),
    plannedEndAt: timestamp("planned_end_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    initialItemCount: integer("initial_item_count").notNull(),
    committedPoints: numeric("committed_points", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    initialUnestimatedCount: integer("initial_unestimated_count").notNull(),
    finalItemCount: integer("final_item_count").notNull(),
    completedItemCount: integer("completed_item_count").notNull(),
    completedPoints: numeric("completed_points", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    finalUnestimatedCount: integer("final_unestimated_count").notNull(),
    grossPointsAdded: numeric("gross_points_added", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    grossPointsRemoved: numeric("gross_points_removed", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    netEstimateDelta: numeric("net_estimate_delta", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    scopeEventCount: integer("scope_event_count").notNull(),
    finalDestinationSummary: jsonb("final_destination_summary")
      .$type<{
        backlog: number;
        sprints: Array<{ id: string | null; name: string; count: number }>;
      }>()
      .notNull(),
    requestCorrelationId: text("request_correlation_id").notNull(),
  },
  (t) => [
    uniqueIndex("sprint_report_snapshots_sprint_idx").on(t.sprintId),
    uniqueIndex("sprint_report_snapshots_backlog_sprint_id_idx").on(
      t.backlogId,
      t.sprintId,
      t.id,
    ),
    check(
      "sprint_report_snapshots_request_correlation_length",
      sql`char_length(btrim(${t.requestCorrelationId})) between 1 and 128`,
    ),
    check(
      "sprint_report_snapshots_counts_nonnegative",
      sql`${t.initialItemCount} >= 0
        and ${t.initialUnestimatedCount} >= 0
        and ${t.finalItemCount} >= 0
        and ${t.completedItemCount} >= 0
        and ${t.finalUnestimatedCount} >= 0
        and ${t.scopeEventCount} >= 0`,
    ),
    check(
      "sprint_report_snapshots_completed_count_within_final",
      sql`${t.completedItemCount} <= ${t.finalItemCount}`,
    ),
    foreignKey({
      columns: [t.backlogId, t.sprintId],
      foreignColumns: [sprints.backlogId, sprints.id],
      name: "sprint_report_snapshots_sprint_same_backlog_fk",
    }).onDelete("restrict"),
  ],
);

export const sprintReportItems = pgTable(
  "sprint_report_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id").notNull(),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "restrict" }),
    sprintId: uuid("sprint_id").notNull(),
    sourceItemId: uuid("source_item_id"),
    itemKey: text("item_key").notNull(),
    itemTitle: text("item_title").notNull(),
    itemType: itemTypeEnum("item_type").notNull(),
    itemKind: itemKindEnum("item_kind").notNull(),
    firstJoinedAt: timestamp("first_joined_at", { withTimezone: true }).notNull(),
    finalLeftAt: timestamp("final_left_at", { withTimezone: true }).notNull(),
    initialCommitment: boolean("initial_commitment").notNull(),
    addedAfterStart: boolean("added_after_start").notNull(),
    removedAfterStart: boolean("removed_after_start").notNull(),
    doneAtStart: boolean("done_at_start"),
    estimateAtStart: numeric("estimate_at_start", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    estimateAtFinalParticipation: numeric("estimate_at_final_participation", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    estimateAtCompletion: numeric("estimate_at_completion", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    finalStatusCategory: statusCategoryEnum("final_status_category").notNull(),
    finalOutcome: sprintOutcomeEnum("final_outcome").notNull(),
    destinationSprintId: uuid("destination_sprint_id"),
    destinationSprintName: text("destination_sprint_name"),
  },
  (t) => [
    uniqueIndex("sprint_report_items_snapshot_key_idx").on(t.snapshotId, t.itemKey),
    index("sprint_report_items_backlog_sprint_idx").on(t.backlogId, t.sprintId),
    check(
      "sprint_report_items_outcome_destination_consistent",
      sql`(
        (${t.finalOutcome} = 'carried_to_sprint' and ${t.destinationSprintName} is not null)
        or (${t.finalOutcome} is distinct from 'carried_to_sprint'
          and ${t.destinationSprintId} is null and ${t.destinationSprintName} is null)
      )`,
    ),
    check(
      "sprint_report_items_done_at_start_consistent",
      sql`${t.doneAtStart} is null or ${t.initialCommitment}`,
    ),
    foreignKey({
      columns: [t.backlogId, t.sprintId, t.snapshotId],
      foreignColumns: [
        sprintReportSnapshots.backlogId,
        sprintReportSnapshots.sprintId,
        sprintReportSnapshots.id,
      ],
      name: "sprint_report_items_snapshot_same_sprint_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.backlogId, t.sourceItemId],
      foreignColumns: [items.backlogId, items.id],
      name: "sprint_report_items_source_item_same_backlog_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.backlogId, t.destinationSprintId],
      foreignColumns: [sprints.backlogId, sprints.id],
      name: "sprint_report_items_destination_sprint_same_backlog_fk",
    }).onDelete("set null"),
  ],
);

export const labels = pgTable("labels", {
  id: uuid("id").primaryKey().defaultRandom(),
  backlogId: uuid("backlog_id").references(() => backlogs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
});

/**
 * A backlog's ticket templates (JIR-43): shared by everyone who creates items
 * there, managed by its administrators. Only stable fields are kept; label ids
 * are checked against the backlog's live labels when a template is applied.
 */
export const itemTemplates = pgTable(
  "item_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    itemType: itemTypeEnum("item_type"),
    kind: itemKindEnum("kind").notNull().default("feature"),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    priority: integer("priority").notNull().default(0),
    labelIds: uuid("label_ids").array().notNull().default(sql`'{}'::uuid[]`),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("item_templates_backlog_name_idx").on(t.backlogId, sql`lower(${t.name})`),
    check("item_templates_priority_range", sql`${t.priority} between 0 and 4`),
  ],
);

/**
 * A person's declared absence (JIR-124): whole calendar days, both ends
 * included. It is the person's, not a backlog's: every backlog they belong
 * to reads it. Presence is derived from it: working days minus absences.
 */
export const absences = pgTable(
  "absences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    /** The absence starts in the morning (`am`) or the afternoon (`pm`) of `start_date` (JIR-124). */
    startHalf: text("start_half", { enum: ["am", "pm"] }).notNull().default("am"),
    /** It ends with the morning (`am`) or the afternoon (`pm`) of `end_date`. */
    endHalf: text("end_half", { enum: ["am", "pm"] }).notNull().default("pm"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("absences_user_start_idx").on(t.userId, t.startDate),
    check("absences_halves", sql`${t.startHalf} in ('am', 'pm') and ${t.endHalf} in ('am', 'pm')`),
    check(
      "absences_dates_order",
      sql`${t.endDate} > ${t.startDate} or (${t.endDate} = ${t.startDate} and (${t.startHalf} = 'am' or ${t.endHalf} = 'pm'))`,
    ),
  ],
);

export const itemLabels = pgTable(
  "item_labels",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.labelId] })],
);

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id),
  body: text("body").notNull(),
  mentions: text("mentions").array().notNull().default(sql`'{}'`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id),
  action: activityActionEnum("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  requestCorrelationId: text("request_correlation_id"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  itemId: uuid("item_id").references(() => items.id, { onDelete: "cascade" }),
  commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const views = pgTable("views", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  shared: boolean("shared").notNull().default(false),
  backlogId: uuid("backlog_id").references(() => backlogs.id, { onDelete: "cascade" }),
  displayMode: displayModeEnum("display_mode").notNull().default("board"),
  groupBy: text("group_by"),
  filters: jsonb("filters").notNull().default(sql`'{}'::jsonb`),
  sort: jsonb("sort").notNull().default(sql`'"manual"'::jsonb`),
});

export const itemLinks = pgTable(
  "item_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    type: linkTypeEnum("type").notNull(),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("item_links_source_idx").on(t.sourceId),
    index("item_links_target_idx").on(t.targetId),
    uniqueIndex("item_links_uniq").on(t.sourceId, t.targetId, t.type),
    check("item_links_no_self", sql`${t.sourceId} <> ${t.targetId}`),
  ],
);

// A GitHub or GitLab repository connected to a backlog by webhook (JIR-95).
// Jiroo never calls the forge: it only receives signed webhooks. The secret
// is stored encrypted (lib/crypto/secret-box) and never shown again.
export const repoConnections = pgTable(
  "repo_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "cascade" }),
    provider: repoProviderEnum("provider").notNull(),
    // Origin of the forge: https://github.com, https://gitlab.com or a
    // self-hosted GitLab. Only used to build links.
    instanceUrl: text("instance_url").notNull(),
    // `owner/repo` (GitHub) or the GitLab project path, lower-cased.
    repositoryPath: text("repository_path").notNull(),
    secretCiphertext: text("secret_ciphertext").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("repo_connections_backlog_repository_idx").on(
      t.backlogId,
      t.provider,
      t.instanceUrl,
      t.repositoryPath,
    ),
  ],
);

// Webhook deliveries already applied, for idempotent replays (JIR-95).
export const repoWebhookDeliveries = pgTable(
  "repo_webhook_deliveries",
  {
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => repoConnections.id, { onDelete: "cascade" }),
    deliveryId: text("delivery_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.connectionId, t.deliveryId] }),
    index("repo_webhook_deliveries_received_idx").on(t.connectionId, t.receivedAt),
  ],
);

// Authenticated webhook requests per connection and minute (JIR-95): the
// request budget, reserved atomically and shared by every instance. Separate
// from the delivery log, so errors and replays count too.
export const repoWebhookRate = pgTable(
  "repo_webhook_rate",
  {
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => repoConnections.id, { onDelete: "cascade" }),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.connectionId, t.windowStart] })],
);

// Development references of an item: links pasted by hand (provider null)
// and references detected from repository webhooks (JIR-95), upserted per
// (item, kind, provider, external id). Deleting a connection keeps them.
export const itemRefs = pgTable(
  "item_refs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    kind: refKindEnum("kind").notNull(),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    connectionId: uuid("connection_id").references(() => repoConnections.id, {
      onDelete: "set null",
    }),
    provider: repoProviderEnum("provider"),
    // Repository-scoped identity, e.g. `github.com/owner/repo#12`.
    externalId: text("external_id"),
    title: text("title"),
    authorName: text("author_name"),
    state: refStateEnum("state"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
  },
  (t) => [
    index("item_refs_item_idx").on(t.itemId),
    // Manual links have no provider: NULLs stay distinct, so they never collide.
    uniqueIndex("item_refs_external_idx").on(t.itemId, t.kind, t.provider, t.externalId),
    check(
      "item_refs_external_identity",
      sql`(${t.provider} is null) = (${t.externalId} is null)`,
    ),
  ],
);

// Web links of an item (JIR-99): mockups, specs, documents — Jira's « Web
// links ». No uniqueness, as in Jira: the same page may carry two labels.
export const itemWebLinks = pgTable(
  "item_web_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    // Null: the label is derived from the URL when shown.
    title: text("title"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("item_web_links_item_idx").on(t.itemId)],
);

export const userGroups = pgTable("user_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  protected: boolean("protected").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => userGroups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("group_members_group_user_idx").on(t.groupId, t.userId)],
);

export const projectRoles = pgTable("project_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  protected: boolean("protected").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backlogRoleActors = pgTable(
  "backlog_role_actors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "cascade" }),
    projectRoleId: uuid("project_role_id")
      .notNull()
      .references(() => projectRoles.id, { onDelete: "restrict" }),
    actorType: roleActorTypeEnum("actor_type").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => userGroups.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "backlog_role_actors_principal_consistent",
      sql`(
        (${t.actorType} = 'user' and ${t.userId} is not null and ${t.groupId} is null)
        or (${t.actorType} = 'group' and ${t.groupId} is not null and ${t.userId} is null)
      )`,
    ),
    uniqueIndex("backlog_role_actors_user_idx")
      .on(t.backlogId, t.projectRoleId, t.userId)
      .where(sql`${t.actorType} = 'user'`),
    uniqueIndex("backlog_role_actors_group_idx")
      .on(t.backlogId, t.projectRoleId, t.groupId)
      .where(sql`${t.actorType} = 'group'`),
  ],
);

export const permissionSchemes = pgTable("permission_schemes", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  protected: boolean("protected").notNull().default(false),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const permissionGrants = pgTable(
  "permission_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: permissionScopeEnum("scope").notNull(),
    permissionSchemeId: uuid("permission_scheme_id").references(() => permissionSchemes.id, {
      onDelete: "cascade",
    }),
    permissionKey: text("permission_key").notNull(),
    principalType: permissionPrincipalEnum("principal_type").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => userGroups.id, { onDelete: "restrict" }),
    projectRoleId: uuid("project_role_id").references(() => projectRoles.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "permission_grants_scope_consistent",
      sql`(
        (${t.scope} = 'global' and ${t.permissionSchemeId} is null and ${t.principalType} in ('user', 'group'))
        or (${t.scope} = 'global' and ${t.permissionSchemeId} is null and ${t.principalType} = 'authenticated_user' and ${t.permissionKey} = 'browse_users')
        or (${t.scope} = 'backlog' and ${t.permissionSchemeId} is not null)
      )`,
    ),
    check(
      "permission_grants_principal_consistent",
      sql`(
        (${t.principalType} = 'user' and ${t.userId} is not null and ${t.groupId} is null and ${t.projectRoleId} is null)
        or (${t.principalType} = 'group' and ${t.groupId} is not null and ${t.userId} is null and ${t.projectRoleId} is null)
        or (${t.principalType} = 'project_role' and ${t.projectRoleId} is not null and ${t.userId} is null and ${t.groupId} is null)
        or (${t.principalType} = 'authenticated_user' and ${t.userId} is null and ${t.groupId} is null and ${t.projectRoleId} is null)
      )`,
    ),
    uniqueIndex("permission_grants_global_user_idx")
      .on(t.permissionKey, t.userId)
      .where(sql`${t.scope} = 'global' and ${t.principalType} = 'user'`),
    uniqueIndex("permission_grants_global_group_idx")
      .on(t.permissionKey, t.groupId)
      .where(sql`${t.scope} = 'global' and ${t.principalType} = 'group'`),
    // Everyone may only browse users: the CHECK above keeps any other global
    // permission, administer_jiroo first, off "all authenticated users".
    uniqueIndex("permission_grants_global_authenticated_user_idx")
      .on(t.permissionKey)
      .where(sql`${t.scope} = 'global' and ${t.principalType} = 'authenticated_user'`),
    uniqueIndex("permission_grants_backlog_user_idx")
      .on(t.permissionSchemeId, t.permissionKey, t.userId)
      .where(sql`${t.scope} = 'backlog' and ${t.principalType} = 'user'`),
    uniqueIndex("permission_grants_backlog_group_idx")
      .on(t.permissionSchemeId, t.permissionKey, t.groupId)
      .where(sql`${t.scope} = 'backlog' and ${t.principalType} = 'group'`),
    uniqueIndex("permission_grants_backlog_project_role_idx")
      .on(t.permissionSchemeId, t.permissionKey, t.projectRoleId)
      .where(sql`${t.scope} = 'backlog' and ${t.principalType} = 'project_role'`),
    uniqueIndex("permission_grants_backlog_authenticated_user_idx")
      .on(t.permissionSchemeId, t.permissionKey)
      .where(sql`${t.scope} = 'backlog' and ${t.principalType} = 'authenticated_user'`),
  ],
);

export const backlogPermissionConfigs = pgTable(
  "backlog_permission_configs",
  {
    backlogId: uuid("backlog_id")
      .primaryKey()
      .references(() => backlogs.id, { onDelete: "cascade" }),
    permissionSchemeId: uuid("permission_scheme_id")
      .notNull()
      .references(() => permissionSchemes.id, { onDelete: "restrict" }),
    accessMode: accessModeEnum("access_mode").notNull().default("simple"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("backlog_permission_configs_scheme_idx").on(t.permissionSchemeId)],
);

export const securityAuditEvents = pgTable("security_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  actorLabel: text("actor_label").notNull(),
  action: text("action").notNull(),
  scope: permissionScopeEnum("scope").notNull(),
  backlogId: uuid("backlog_id").references(() => backlogs.id, { onDelete: "set null" }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  requestCorrelationId: text("request_correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

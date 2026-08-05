import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
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
  activityActionEnum,
  displayModeEnum,
  itemKindEnum,
  itemTypeEnum,
  linkTypeEnum,
  notificationTypeEnum,
  refKindEnum,
  sprintOutcomeEnum,
  sprintStateEnum,
  statusCategoryEnum,
} from "./enums";
import { ltree, tsvector } from "./types";

// Global numeric sequence backing per-backlog item keys (e.g. CASS-42).
export const itemKeySeq = pgSequence("item_key_seq", { startWith: 1, increment: 1 });

export const backlogs = pgTable("backlogs", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#7c3030"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    dueDate: timestamp("due_date", { withTimezone: true }),
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

export const labels = pgTable("labels", {
  id: uuid("id").primaryKey().defaultRandom(),
  backlogId: uuid("backlog_id").references(() => backlogs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
});

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
  },
  (t) => [index("item_refs_item_idx").on(t.itemId)],
);

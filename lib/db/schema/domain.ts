import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
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
  itemTypeEnum,
  notificationTypeEnum,
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

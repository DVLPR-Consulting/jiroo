import { pgEnum } from "drizzle-orm/pg-core";

export const itemTypeEnum = pgEnum("item_type", ["composant", "epic", "tache", "soustache"]);
export const statusCategoryEnum = pgEnum("status_category", ["todo", "in_progress", "done"]);
export const activityActionEnum = pgEnum("activity_action", [
  "create",
  "update",
  "move",
  "delete",
  "comment",
  "status_change",
]);
export const notificationTypeEnum = pgEnum("notification_type", ["mention", "assignment"]);
export const displayModeEnum = pgEnum("display_mode", ["board", "list", "tree"]);
export const linkTypeEnum = pgEnum("link_type", ["blocks", "relates", "duplicates"]);

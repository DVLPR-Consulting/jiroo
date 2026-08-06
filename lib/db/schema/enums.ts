import { pgEnum } from "drizzle-orm/pg-core";

export const itemTypeEnum = pgEnum("item_type", ["composant", "epic", "tache", "soustache"]);
export const itemKindEnum = pgEnum("item_kind", ["feature", "bug"]);
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
export const displayModeEnum = pgEnum("display_mode", ["backlog", "board", "list", "tree"]);
export const linkTypeEnum = pgEnum("link_type", ["blocks", "relates", "duplicates"]);
export const refKindEnum = pgEnum("ref_kind", ["pr", "commit", "branch", "repo", "other"]);
export const sprintStateEnum = pgEnum("sprint_state", [
  "planned",
  "active",
  "completed",
]);
export const sprintOutcomeEnum = pgEnum("sprint_outcome", [
  "completed",
  "removed",
  "carried_to_backlog",
  "carried_to_sprint",
]);
export const permissionScopeEnum = pgEnum("permission_scope", ["global", "backlog"]);
export const permissionPrincipalEnum = pgEnum("permission_principal", [
  "user",
  "group",
  "project_role",
  "authenticated_user",
]);
export const accessModeEnum = pgEnum("access_mode", ["simple", "advanced"]);
export const roleActorTypeEnum = pgEnum("role_actor_type", ["user", "group"]);

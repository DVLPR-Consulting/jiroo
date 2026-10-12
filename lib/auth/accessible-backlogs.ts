import "server-only";

import { and, asc, eq, exists, isNull, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { checkPermissions } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogPermissionConfigs,
  backlogRoleActors,
  backlogs,
  groupMembers,
  permissionGrants,
} from "@/lib/db/schema/domain";

export type AccessibleBacklogDto = {
  id: string;
  key: string;
  name: string;
  color: string;
  archivedAt: Date | null;
};

const actor = alias(user, "accessible_actor");
const adminGrant = alias(permissionGrants, "accessible_admin_grant");
const adminMembership = alias(groupMembers, "accessible_admin_membership");
const config = alias(backlogPermissionConfigs, "accessible_backlog_config");
const browseGrant = alias(permissionGrants, "accessible_browse_grant");
const browseMembership = alias(groupMembers, "accessible_browse_membership");
const roleActor = alias(backlogRoleActors, "accessible_role_actor");
const roleMembership = alias(groupMembers, "accessible_role_membership");

export function browseAccessPredicate(userId: string): SQL {
  const adminMembershipExists = exists(
    db
      .select({ id: adminMembership.id })
      .from(adminMembership)
      .where(
        and(
          eq(adminMembership.groupId, adminGrant.groupId),
          eq(adminMembership.userId, userId),
        ),
      ),
  );
  const adminGrantExists = exists(
    db
      .select({ id: adminGrant.id })
      .from(adminGrant)
      .where(
        and(
          eq(adminGrant.scope, "global"),
          eq(adminGrant.permissionKey, "administer_jiroo"),
          or(
            and(eq(adminGrant.principalType, "user"), eq(adminGrant.userId, userId)),
            and(eq(adminGrant.principalType, "group"), adminMembershipExists),
          ),
        ),
      ),
  );

  const browseMembershipExists = exists(
    db
      .select({ id: browseMembership.id })
      .from(browseMembership)
      .where(
        and(
          eq(browseMembership.groupId, browseGrant.groupId),
          eq(browseMembership.userId, userId),
        ),
      ),
  );
  const roleMembershipExists = exists(
    db
      .select({ id: roleMembership.id })
      .from(roleMembership)
      .where(
        and(
          eq(roleMembership.groupId, roleActor.groupId),
          eq(roleMembership.userId, userId),
        ),
      ),
  );
  const roleActorExists = exists(
    db
      .select({ id: roleActor.id })
      .from(roleActor)
      .where(
        and(
          eq(roleActor.backlogId, backlogs.id),
          eq(roleActor.projectRoleId, browseGrant.projectRoleId),
          or(
            and(eq(roleActor.actorType, "user"), eq(roleActor.userId, userId)),
            and(eq(roleActor.actorType, "group"), roleMembershipExists),
          ),
        ),
      ),
  );
  const browseGrantExists = exists(
    db
      .select({ backlogId: config.backlogId })
      .from(config)
      .innerJoin(browseGrant, eq(browseGrant.permissionSchemeId, config.permissionSchemeId))
      .where(
        and(
          eq(config.backlogId, backlogs.id),
          eq(browseGrant.scope, "backlog"),
          eq(browseGrant.permissionKey, "browse_backlog"),
          or(
            and(eq(browseGrant.principalType, "user"), eq(browseGrant.userId, userId)),
            and(eq(browseGrant.principalType, "group"), browseMembershipExists),
            and(eq(browseGrant.principalType, "project_role"), roleActorExists),
            eq(browseGrant.principalType, "authenticated_user"),
          ),
        ),
      ),
  );

  return exists(
    db
      .select({ id: actor.id })
      .from(actor)
      .where(
        and(
          eq(actor.id, userId),
          or(eq(actor.role, "admin"), adminGrantExists, browseGrantExists),
        ),
      ),
  );
}

export type BacklogCapabilities = {
  createItems: boolean;
  editItems: boolean;
  transitionItems: boolean;
  scheduleItems: boolean;
  assignItems: boolean;
  deleteItems: boolean;
  restoreItems: boolean;
  addComments: boolean;
  editOwnComments: boolean;
  deleteOwnComments: boolean;
  deleteAllComments: boolean;
  linkItems: boolean;
  manageSprints: boolean;
  manageWorkflow: boolean;
  manageMembers: boolean;
  manageReleases?: boolean;
  bulkChangeItems: boolean;
};

const CAPABILITY_PERMISSIONS = {
  createItems: "create_items",
  editItems: "edit_items",
  transitionItems: "transition_items",
  scheduleItems: "schedule_items",
  assignItems: "assign_items",
  deleteItems: "delete_items",
  restoreItems: "restore_items",
  addComments: "add_comments",
  editOwnComments: "edit_own_comments",
  deleteOwnComments: "delete_own_comments",
  deleteAllComments: "delete_all_comments",
  linkItems: "link_items",
  manageSprints: "manage_sprints",
  manageWorkflow: "manage_workflows",
  manageMembers: "manage_members",
  manageReleases: "manage_releases",
} as const;

export async function getBacklogCapabilities(
  userId: string,
  backlogId: string,
): Promise<BacklogCapabilities | null> {
  // One batched resolution per scope instead of a checkPermission per
  // capability (each about five sequential queries).
  const [backlogDecisions, globalDecisions] = await Promise.all([
    checkPermissions({
      actorId: userId,
      permissions: ["browse_backlog", ...Object.values(CAPABILITY_PERMISSIONS)],
      scope: { type: "backlog", backlogId },
    }),
    checkPermissions({
      actorId: userId,
      permissions: ["bulk_change_items"],
      scope: { type: "global" },
    }),
  ]);
  if (!backlogDecisions.get("browse_backlog")?.allowed) return null;

  return {
    ...Object.fromEntries(
      Object.entries(CAPABILITY_PERMISSIONS).map(([capability, permission]) => [
        capability,
        backlogDecisions.get(permission)?.allowed === true,
      ]),
    ),
    bulkChangeItems: globalDecisions.get("bulk_change_items")?.allowed === true,
  } as BacklogCapabilities;
}

export async function listAccessibleBacklogIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(browseAccessPredicate(userId))
    .orderBy(asc(backlogs.id));
  return rows.map((row) => row.id);
}

export async function listAccessibleBacklogs(
  userId: string,
  options?: { includeArchived?: boolean },
): Promise<AccessibleBacklogDto[]> {
  return db
    .select({
      id: backlogs.id,
      key: backlogs.key,
      name: backlogs.name,
      color: backlogs.color,
      archivedAt: backlogs.archivedAt,
    })
    .from(backlogs)
    .where(
      options?.includeArchived
        ? browseAccessPredicate(userId)
        : and(isNull(backlogs.archivedAt), browseAccessPredicate(userId)),
    )
    .orderBy(asc(backlogs.name));
}

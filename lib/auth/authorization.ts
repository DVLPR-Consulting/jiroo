import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, exists, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  evaluatePermission,
  type GrantMatch,
  type PermissionDecision,
  type PermissionReason,
  type PermissionScope,
} from "@/lib/auth/decision";
import {
  permissionDefinition,
  type PermissionKey,
} from "@/lib/auth/permissions";
import { resolvePlatformAdministratorIds } from "@/lib/auth/platform-administrator";
import { cachedRead } from "@/lib/auth/request-cache";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogPermissionConfigs,
  backlogRoleActors,
  backlogs,
  groupMembers,
  permissionGrants,
  projectRoles,
  securityAuditEvents,
  userGroups,
} from "@/lib/db/schema/domain";

export type CheckPermissionInput = {
  actorId: string;
  permission: string;
  scope: PermissionScope;
};

export type AuthorizationDecision = Omit<PermissionDecision, "permission"> & {
  permission: string;
};

export class PermissionDeniedError extends Error {
  readonly decision: AuthorizationDecision;

  constructor(decision: AuthorizationDecision) {
    super("Vous n’avez pas la permission d’effectuer cette action.");
    this.name = "PermissionDeniedError";
    this.decision = decision;
  }
}

export class ResourceNotFoundError extends Error {
  readonly resourceType: string;
  readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super("La ressource demandée est introuvable.");
    this.name = "ResourceNotFoundError";
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

type Actor = { id: string; name: string; role: string | null };

// The reads below go through the request's cache (JIR-119): an action that
// checks several permissions of one actor on one backlog reads the actor,
// the backlog's scheme, the administrator status and each grant question once.
function loadActor(actorId: string): Promise<Actor | null> {
  return cachedRead(`actor:${actorId}`, async () => {
    const [actor] = await db
      .select({ id: user.id, name: user.name, role: user.role })
      .from(user)
      .where(eq(user.id, actorId))
      .limit(1);
    return actor ?? null;
  });
}

type BacklogAuthorizationContext = { permissionSchemeId: string | null };

function loadBacklogAuthorizationContext(
  backlogId: string,
): Promise<BacklogAuthorizationContext | null> {
  return cachedRead(`backlog-scheme:${backlogId}`, async () => {
    const [context] = await db
      .select({ permissionSchemeId: backlogPermissionConfigs.permissionSchemeId })
      .from(backlogs)
      .leftJoin(
        backlogPermissionConfigs,
        eq(backlogPermissionConfigs.backlogId, backlogs.id),
      )
      .where(eq(backlogs.id, backlogId))
      .limit(1);
    return context ?? null;
  });
}

function groupMembershipExists(actorId: string) {
  return exists(
    db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, permissionGrants.groupId),
          eq(groupMembers.userId, actorId),
        ),
      ),
  );
}

function roleOccupancyExists(actorId: string, backlogId: string) {
  const roleGroupMembership = db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, backlogRoleActors.groupId),
        eq(groupMembers.userId, actorId),
      ),
    );

  return exists(
    db
      .select({ id: backlogRoleActors.id })
      .from(backlogRoleActors)
      .where(
        and(
          eq(backlogRoleActors.backlogId, backlogId),
          eq(backlogRoleActors.projectRoleId, permissionGrants.projectRoleId),
          or(
            and(
              eq(backlogRoleActors.actorType, "user"),
              eq(backlogRoleActors.userId, actorId),
            ),
            and(eq(backlogRoleActors.actorType, "group"), exists(roleGroupMembership)),
          ),
        ),
      ),
  );
}

type LoadMatchesInput = {
  actor: Actor;
  permission: PermissionKey;
  scope: PermissionScope;
  permissionSchemeId?: string;
};

function loadGrantMatches(input: LoadMatchesInput): Promise<GrantMatch[]> {
  const scope = input.scope.type === "backlog" ? `backlog:${input.scope.backlogId}` : "global";
  const key = `grants:${input.actor.id}:${input.permission}:${scope}:${input.permissionSchemeId ?? ""}`;
  return cachedRead(key, async () => {
    const byPermission = await loadGrantMatchesByPermission({
      ...input,
      permissions: [input.permission],
    });
    return byPermission.get(input.permission) ?? [];
  });
}

/** The grant matches of several permissions in one query, per permission. */
async function loadGrantMatchesByPermission(
  input: Omit<LoadMatchesInput, "permission"> & { permissions: PermissionKey[] },
): Promise<Map<PermissionKey, GrantMatch[]>> {
  const principalCondition =
    input.scope.type === "global"
      ? or(
          and(
            eq(permissionGrants.principalType, "user"),
            eq(permissionGrants.userId, input.actor.id),
          ),
          and(
            eq(permissionGrants.principalType, "group"),
            groupMembershipExists(input.actor.id),
          ),
          // Only browse_users can be granted globally to everyone (CHECK).
          eq(permissionGrants.principalType, "authenticated_user"),
        )
      : or(
          and(
            eq(permissionGrants.principalType, "user"),
            eq(permissionGrants.userId, input.actor.id),
          ),
          and(
            eq(permissionGrants.principalType, "group"),
            groupMembershipExists(input.actor.id),
          ),
          and(
            eq(permissionGrants.principalType, "project_role"),
            roleOccupancyExists(input.actor.id, input.scope.backlogId),
          ),
          eq(permissionGrants.principalType, "authenticated_user"),
        );

  const scopeCondition =
    input.scope.type === "global"
      ? and(eq(permissionGrants.scope, "global"), isNull(permissionGrants.permissionSchemeId))
      : and(
          eq(permissionGrants.scope, "backlog"),
          eq(permissionGrants.permissionSchemeId, input.permissionSchemeId ?? ""),
        );

  const rows = await db
    .select({
      permissionKey: permissionGrants.permissionKey,
      principalType: permissionGrants.principalType,
      userId: permissionGrants.userId,
      groupId: permissionGrants.groupId,
      groupName: userGroups.name,
      projectRoleId: permissionGrants.projectRoleId,
      projectRoleName: projectRoles.name,
    })
    .from(permissionGrants)
    .leftJoin(userGroups, eq(permissionGrants.groupId, userGroups.id))
    .leftJoin(projectRoles, eq(permissionGrants.projectRoleId, projectRoles.id))
    .where(and(
      scopeCondition,
      inArray(permissionGrants.permissionKey, input.permissions),
      principalCondition,
    ));

  const matchesByPermission = new Map<PermissionKey, Map<string, GrantMatch>>();
  for (const row of rows) {
    let match: GrantMatch | null = null;
    if (row.principalType === "user" && row.userId) {
      match = { type: "user", id: row.userId, label: input.actor.name };
    } else if (row.principalType === "group" && row.groupId && row.groupName) {
      match = { type: "group", id: row.groupId, label: row.groupName };
    } else if (
      row.principalType === "project_role" &&
      row.projectRoleId &&
      row.projectRoleName
    ) {
      match = {
        type: "project_role",
        id: row.projectRoleId,
        label: row.projectRoleName,
      };
    } else if (row.principalType === "authenticated_user") {
      match = {
        type: "authenticated_user",
        id: "authenticated_user",
        label: "Tous les utilisateurs authentifiés",
      };
    }

    if (match) {
      const permission = row.permissionKey as PermissionKey;
      const matches = matchesByPermission.get(permission) ?? new Map<string, GrantMatch>();
      matches.set(`${match.type}:${match.id}`, match);
      matchesByPermission.set(permission, matches);
    }
  }

  return new Map(
    [...matchesByPermission].map(([permission, matches]) => [permission, [...matches.values()]]),
  );
}

function deniedUnknown(input: CheckPermissionInput): AuthorizationDecision {
  return {
    allowed: false,
    permission: input.permission,
    scope: input.scope,
    reasons: [{ type: "no_matching_grant" }],
  };
}

function knownPermission(input: CheckPermissionInput): PermissionKey | null {
  try {
    const definition = permissionDefinition(input.permission);
    return definition.scope === input.scope.type ? (input.permission as PermissionKey) : null;
  } catch {
    return null;
  }
}

function isPlatformAdministrator(actor: Actor): Promise<boolean> {
  return cachedRead(`platform-administrator:${actor.id}`, () => readPlatformAdministrator(actor));
}

async function readPlatformAdministrator(actor: Actor): Promise<boolean> {
  const [grants, memberships] = await Promise.all([
    db
      .select({
        id: permissionGrants.id,
        principalType: permissionGrants.principalType,
        userId: permissionGrants.userId,
        groupId: permissionGrants.groupId,
      })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.scope, "global"),
          eq(permissionGrants.permissionKey, "administer_jiroo"),
        ),
      ),
    db
      .select({ groupId: groupMembers.groupId, userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, actor.id)),
  ]);
  return resolvePlatformAdministratorIds({
    users: [{ id: actor.id, role: actor.role }],
    grants,
    memberships,
  }).has(actor.id);
}

export async function checkPermission(
  input: CheckPermissionInput,
): Promise<AuthorizationDecision> {
  const permission = knownPermission(input);
  if (!permission) return deniedUnknown(input);

  const actor = await loadActor(input.actorId);
  if (!actor) return deniedUnknown(input);

  let permissionSchemeId: string | undefined;
  if (input.scope.type === "backlog") {
    const context = await loadBacklogAuthorizationContext(input.scope.backlogId);
    if (!context) return deniedUnknown(input);
    permissionSchemeId = context.permissionSchemeId ?? undefined;
  }

  const platformAdministrator = await isPlatformAdministrator(actor);
  const matches =
    input.scope.type === "backlog" && !permissionSchemeId
      ? []
      : await loadGrantMatches({
          actor,
          permission,
          scope: input.scope,
          permissionSchemeId,
        });
  const hasBrowse =
    input.scope.type === "global" || permission === "browse_backlog"
      ? true
      : !permissionSchemeId
        ? false
      : (
          await loadGrantMatches({
            actor,
            permission: "browse_backlog",
            scope: input.scope,
            permissionSchemeId,
          })
        ).length > 0;

  return evaluatePermission({
    permission,
    scope: input.scope,
    platformAdministrator,
    hasBrowse,
    matches,
  });
}

export type CheckPermissionsInput = {
  actorId: string;
  permissions: readonly string[];
  scope: PermissionScope;
};

/**
 * `checkPermission` for several permissions of one actor and scope: the same
 * decisions, but the actor, the backlog's scheme, the administrator status
 * and every grant match (browse included) are loaded once, in two rounds of
 * queries instead of about five queries per permission.
 */
export async function checkPermissions(
  input: CheckPermissionsInput,
): Promise<Map<string, AuthorizationDecision>> {
  const decisions = new Map<string, AuthorizationDecision>();
  const known: PermissionKey[] = [];
  for (const permission of new Set(input.permissions)) {
    const single = { actorId: input.actorId, permission, scope: input.scope };
    const key = knownPermission(single);
    if (key) known.push(key);
    else decisions.set(permission, deniedUnknown(single));
  }
  const denyKnown = () => {
    for (const permission of known) {
      decisions.set(
        permission,
        deniedUnknown({ actorId: input.actorId, permission, scope: input.scope }),
      );
    }
    return decisions;
  };
  if (known.length === 0) return decisions;

  const [actor, context] = await Promise.all([
    loadActor(input.actorId),
    input.scope.type === "backlog"
      ? loadBacklogAuthorizationContext(input.scope.backlogId)
      : Promise.resolve(null),
  ]);
  if (!actor) return denyKnown();
  if (input.scope.type === "backlog" && !context) return denyKnown();
  const permissionSchemeId = context?.permissionSchemeId ?? undefined;

  const unmatchable = input.scope.type === "backlog" && !permissionSchemeId;
  const matchedPermissions: PermissionKey[] = unmatchable
    ? []
    : input.scope.type === "backlog" && !known.includes("browse_backlog")
      ? [...known, "browse_backlog"]
      : known;
  const [platformAdministrator, matchesByPermission] = await Promise.all([
    isPlatformAdministrator(actor),
    matchedPermissions.length > 0
      ? loadGrantMatchesByPermission({
          actor,
          permissions: matchedPermissions,
          scope: input.scope,
          permissionSchemeId,
        })
      : Promise.resolve(new Map<PermissionKey, GrantMatch[]>()),
  ]);
  const hasBrowseGrant = (matchesByPermission.get("browse_backlog")?.length ?? 0) > 0;

  for (const permission of known) {
    const hasBrowse =
      input.scope.type === "global" || permission === "browse_backlog"
        ? true
        : !permissionSchemeId
          ? false
          : hasBrowseGrant;
    decisions.set(permission, evaluatePermission({
      permission,
      scope: input.scope,
      platformAdministrator,
      hasBrowse,
      matches: matchesByPermission.get(permission) ?? [],
    }));
  }
  return decisions;
}

export type AssignableUserIdentity = { id: string; name: string };

function backlogPermissionMatchSql(input: {
  backlogId: string | SQL;
  permissionSchemeId: string | SQL | null;
  permission: "browse_backlog" | "assignable_user";
}) {
  return sql`exists (
    select 1
    from permission_grants as candidate_grant
    where candidate_grant.scope = 'backlog'
      and candidate_grant.permission_scheme_id = ${input.permissionSchemeId}
      and candidate_grant.permission_key = ${input.permission}
      and (
        (candidate_grant.principal_type = 'user' and candidate_grant.user_id = directory_user.id)
        or (
          candidate_grant.principal_type = 'group'
          and exists (
            select 1
            from group_members as candidate_group_member
            where candidate_group_member.group_id = candidate_grant.group_id
              and candidate_group_member.user_id = directory_user.id
          )
        )
        or (
          candidate_grant.principal_type = 'project_role'
          and exists (
            select 1
            from backlog_role_actors as candidate_role_actor
            where candidate_role_actor.backlog_id = ${input.backlogId}
              and candidate_role_actor.project_role_id = candidate_grant.project_role_id
              and (
                (
                  candidate_role_actor.actor_type = 'user'
                  and candidate_role_actor.user_id = directory_user.id
                )
                or (
                  candidate_role_actor.actor_type = 'group'
                  and exists (
                    select 1
                    from group_members as candidate_role_group_member
                    where candidate_role_group_member.group_id = candidate_role_actor.group_id
                      and candidate_role_group_member.user_id = directory_user.id
                  )
                )
              )
          )
        )
        or candidate_grant.principal_type = 'authenticated_user'
      )
  )`;
}

type AuthorizationExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The same assignable directory in one grouped read, including administrator bypass. */
export async function listAssignableUsersForBacklogs(
  backlogIds: readonly string[],
  executor: AuthorizationExecutor = db,
): Promise<(AssignableUserIdentity & { backlogId: string })[]> {
  const ids = [...new Set(backlogIds)];
  if (ids.length === 0) return [];
  const context = {
    backlogId: sql`backlogs.id`,
    permissionSchemeId: sql`backlog_permission_configs.permission_scheme_id`,
  };
  const browseMatch = backlogPermissionMatchSql({ ...context, permission: "browse_backlog" });
  const assignableMatch = backlogPermissionMatchSql({ ...context, permission: "assignable_user" });
  const result = await executor.execute<AssignableUserIdentity & { backlogId: string }>(sql`
    select backlogs.id as "backlogId", directory_user.id, directory_user.name
    from backlogs
    left join backlog_permission_configs on backlog_permission_configs.backlog_id = backlogs.id
    cross join "user" as directory_user
    where ${inArray(backlogs.id, ids)} and (
      directory_user.role = 'admin'
      or exists (
        select 1
        from permission_grants as administrator_grant
        where administrator_grant.scope = 'global'
          and administrator_grant.permission_scheme_id is null
          and administrator_grant.permission_key = 'administer_jiroo'
          and (
            (
              administrator_grant.principal_type = 'user'
              and administrator_grant.user_id = directory_user.id
            )
            or (
              administrator_grant.principal_type = 'group'
              and exists (
                select 1
                from group_members as administrator_group_member
                where administrator_group_member.group_id = administrator_grant.group_id
                  and administrator_group_member.user_id = directory_user.id
              )
            )
          )
      )
      or (
        backlog_permission_configs.permission_scheme_id is not null
        and ${browseMatch} and ${assignableMatch}
      )
    )
    order by backlogs.id, lower(directory_user.name), directory_user.id
  `);
  return result.rows;
}

export async function listAssignableUsersForBacklog(
  backlogId: string,
): Promise<AssignableUserIdentity[]> {
  return (await listAssignableUsersForBacklogs([backlogId])).map(({ id, name }) => ({ id, name }));
}

/**
 * The people attached through each backlog's permission scheme: both browse
 * and assignment must match, without the global administrator bypass. A
 * global administrator belongs only when attached like any other person.
 * Backlogs with no attached team fall back to their assignable directory;
 * this costs at most one extra grouped read, limited to those backlogs.
 */
export async function listBacklogTeams(
  backlogIds: readonly string[],
  executor: AuthorizationExecutor = db,
): Promise<(AssignableUserIdentity & { backlogId: string })[]> {
  const ids = [...new Set(backlogIds)];
  if (ids.length === 0) return [];
  const context = {
    backlogId: sql`backlogs.id`,
    permissionSchemeId: sql`backlog_permission_configs.permission_scheme_id`,
  };
  const browseMatch = backlogPermissionMatchSql({ ...context, permission: "browse_backlog" });
  const assignableMatch = backlogPermissionMatchSql({ ...context, permission: "assignable_user" });
  const result = await executor.execute<AssignableUserIdentity & { backlogId: string }>(sql`
    select backlogs.id as "backlogId", directory_user.id, directory_user.name
    from backlogs
    left join backlog_permission_configs on backlog_permission_configs.backlog_id = backlogs.id
    cross join "user" as directory_user
    where ${inArray(backlogs.id, ids)}
      and backlog_permission_configs.permission_scheme_id is not null
      and ${browseMatch} and ${assignableMatch}
    order by backlogs.id, lower(directory_user.name), directory_user.id
  `);
  const attached = new Set(result.rows.map((person) => person.backlogId));
  const empty = ids.filter((id) => !attached.has(id));
  const fallback = await listAssignableUsersForBacklogs(empty, executor);
  // Each backlog occurs in only one result; a stable sort preserves its SQL name order.
  return [...result.rows, ...fallback].sort((a, b) => a.backlogId.localeCompare(b.backlogId));
}

/** One backlog's attached team, with the same empty-team fallback as the grouped reader. */
export async function listBacklogTeam(backlogId: string): Promise<AssignableUserIdentity[]> {
  return (await listBacklogTeams([backlogId])).map(({ id, name }) => ({ id, name }));
}

export function explainPermission(input: CheckPermissionInput): Promise<AuthorizationDecision> {
  return checkPermission(input);
}

async function assertResourceExists(scope: PermissionScope): Promise<void> {
  if (scope.type === "global") return;
  const [resource] = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.id, scope.backlogId))
    .limit(1);
  if (!resource) throw new ResourceNotFoundError("backlog", scope.backlogId);
}

export async function requirePermissionWithoutBypassAudit(
  input: CheckPermissionInput,
): Promise<AuthorizationDecision> {
  await assertResourceExists(input.scope);
  const decision = await checkPermission(input);
  if (!decision.allowed) throw new PermissionDeniedError(decision);
  return decision;
}

export type PermissionBypassAuditTarget = {
  targetType: string;
  targetId: string;
  requestCorrelationId?: string;
};

export async function requirePermission(
  input: CheckPermissionInput,
  target?: PermissionBypassAuditTarget,
): Promise<AuthorizationDecision> {
  const decision = await requirePermissionWithoutBypassAudit(input);
  if (decision.reasons.some((reason) => reason.type === "platform_administrator")) {
    await appendPlatformAdministratorBypassEvent({
      actorId: input.actorId,
      permission: input.permission,
      scope: input.scope,
      targetType: target?.targetType ?? input.scope.type,
      targetId:
        target?.targetId ??
        (input.scope.type === "backlog" ? input.scope.backlogId : input.permission),
      requestCorrelationId: target?.requestCorrelationId ?? randomUUID(),
    });
  }
  return decision;
}

export type PlatformAdministratorBypassEventInput = {
  actorId: string;
  permission: string;
  scope: PermissionScope;
  targetType: string;
  targetId: string;
  requestCorrelationId: string;
};

export async function appendPlatformAdministratorBypassEvent(
  input: PlatformAdministratorBypassEventInput,
): Promise<void> {
  const definition = permissionDefinition(input.permission);
  if (definition.scope !== input.scope.type) throw new Error("Permission inconnue.");
  if (!input.actorId || !input.targetType || !input.targetId || !input.requestCorrelationId) {
    throw new Error("Événement de sécurité invalide.");
  }
  const actor = await loadActor(input.actorId);
  if (!actor) throw new ResourceNotFoundError("user", input.actorId);
  if (!(await isPlatformAdministrator(actor))) {
    throw new PermissionDeniedError({
      allowed: false,
      permission: definition.key,
      scope: input.scope,
      reasons: [{ type: "no_matching_grant" }],
    });
  }
  await db.insert(securityAuditEvents).values({
    actorId: actor.id,
    actorLabel: actor.name,
    action: "platform_administrator_bypass",
    scope: input.scope.type,
    backlogId: input.scope.type === "backlog" ? input.scope.backlogId : undefined,
    targetType: input.targetType,
    targetId: input.targetId,
    newValue: { permission: definition.key },
    requestCorrelationId: input.requestCorrelationId,
  });
}

export type { PermissionReason };

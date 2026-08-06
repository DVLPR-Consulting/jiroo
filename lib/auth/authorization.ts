import "server-only";

import { and, eq, exists, isNull, or } from "drizzle-orm";
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

async function loadActor(actorId: string): Promise<Actor | null> {
  const [actor] = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(eq(user.id, actorId))
    .limit(1);
  return actor ?? null;
}

type BacklogAuthorizationContext = { permissionSchemeId: string | null };

async function loadBacklogAuthorizationContext(
  backlogId: string,
): Promise<BacklogAuthorizationContext | null> {
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

async function loadGrantMatches(input: LoadMatchesInput): Promise<GrantMatch[]> {
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
    .where(and(scopeCondition, eq(permissionGrants.permissionKey, input.permission), principalCondition));

  const matches = new Map<string, GrantMatch>();
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

    if (match) matches.set(`${match.type}:${match.id}`, match);
  }

  return [...matches.values()];
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

async function isPlatformAdministrator(actor: Actor): Promise<boolean> {
  if (actor.role === "admin") return true;
  const matches = await loadGrantMatches({
    actor,
    permission: "administer_jiroo",
    scope: { type: "global" },
  });
  return matches.length > 0;
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

export async function requirePermission(
  input: CheckPermissionInput,
): Promise<AuthorizationDecision> {
  await assertResourceExists(input.scope);
  const decision = await checkPermission(input);
  if (!decision.allowed) throw new PermissionDeniedError(decision);
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

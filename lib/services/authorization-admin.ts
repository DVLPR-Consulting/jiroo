import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { explainPermission } from "@/lib/auth/authorization";
import { permissionDefinition, PROTECTED_ROLE_PERMISSION_KEYS } from "@/lib/auth/permissions";
import { resolvePlatformAdministratorIds } from "@/lib/auth/platform-administrator";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogPermissionConfigs,
  backlogRoleActors,
  backlogs,
  groupMembers,
  permissionGrants,
  permissionSchemes,
  projectRoles,
  securityAuditEvents,
  userGroups,
} from "@/lib/db/schema/domain";
import {
  accessModeInput,
  backlogRoleActorInput,
  globalGrantInput,
  globalGrantRemovalInput,
  grantInput,
  groupCreateInput,
  groupDeleteInput,
  groupMembershipInput,
  groupRenameInput,
  moveBacklogRoleActorInput,
  permissionHelperInput,
  permissionSchemeCloneInput,
  projectRoleCreateInput,
  projectRoleDeleteInput,
  projectRoleUpdateInput,
  schemeAssociationInput,
  schemeGrantRemovalInput,
  securityHistoryInput,
  type BacklogRoleActorInput,
  type GlobalGrantPrincipalInput,
  type SchemeGrantPrincipalInput,
} from "@/lib/validation/authorization";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type JsonValue = Record<string, unknown> | null;

const STALE_SCHEME_MESSAGE = "Ce schéma a été modifié. Rechargez la page.";
const LAST_PLATFORM_ADMIN_MESSAGE =
  "Le dernier administrateur de la plateforme ne peut pas être retiré.";
const LAST_BACKLOG_ADMIN_MESSAGE =
  "Le dernier administrateur effectif du backlog ne peut pas être retiré.";
const SIMPLE_SHARED_MESSAGE =
  "Le mode Simple est indisponible : ce schéma est partagé.";
const SIMPLE_MATRIX_MESSAGE =
  "Le mode Simple est indisponible : ce schéma contient des autorisations avancées.";
const STALE_SCHEME_USAGE_MESSAGE =
  "Les backlogs associés à ce schéma ont changé. Rechargez la page.";
const PRIVILEGED_GROUP_MEMBERSHIP_MESSAGE =
  "Seul un administrateur Jiroo peut modifier les membres de ce groupe.";
// Group-reference writes take membership topology first. Scheme/configuration writes
// then take scheme topology, scheme rows by ID, and backlog configurations by ID.
const MEMBERSHIP_TOPOLOGY_LOCK = "authorization-membership-topology";
const SCHEME_TOPOLOGY_LOCK = "authorization-scheme-topology";

export class StaleSchemeVersionError extends Error {
  constructor() {
    super(STALE_SCHEME_MESSAGE);
    this.name = "StaleSchemeVersionError";
  }
}

export class ProtectedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtectedInvariantError";
  }
}

type SecurityAuditEvent = {
  actorId: string;
  actorLabel: string;
  action: string;
  scope: "global" | "backlog";
  backlogId?: string;
  targetType: string;
  targetId: string;
  oldValue?: JsonValue;
  newValue?: JsonValue;
  requestCorrelationId: string;
};

async function appendSecurityAuditEvent(
  tx: Transaction,
  event: SecurityAuditEvent,
): Promise<void> {
  await tx.insert(securityAuditEvents).values({
    actorId: event.actorId,
    actorLabel: event.actorLabel,
    action: event.action,
    scope: event.scope,
    backlogId: event.backlogId,
    targetType: event.targetType,
    targetId: event.targetId,
    oldValue: event.oldValue,
    newValue: event.newValue,
    requestCorrelationId: event.requestCorrelationId,
  });
}

async function lockAggregate(tx: Transaction, aggregate: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${aggregate}))`);
}

async function actorLabel(tx: Transaction, actorId: string): Promise<string> {
  const [actor] = await tx
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, actorId))
    .limit(1);
  if (!actor) throw new ProtectedInvariantError("Utilisateur introuvable.");
  return actor.name;
}

function correlationId(value?: string): string {
  return value ?? randomUUID();
}

function generatedKey(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function principalColumns(
  principal: SchemeGrantPrincipalInput | GlobalGrantPrincipalInput,
): {
  principalType: "user" | "group" | "project_role" | "authenticated_user";
  userId?: string;
  groupId?: string;
  projectRoleId?: string;
} {
  switch (principal.type) {
    case "user":
      return { principalType: "user", userId: principal.userId };
    case "group":
      return { principalType: "group", groupId: principal.groupId };
    case "project_role":
      return { principalType: "project_role", projectRoleId: principal.projectRoleId };
    case "authenticated_user":
      return { principalType: "authenticated_user" };
  }
}

async function assertPrincipalExists(
  tx: Transaction,
  principal: SchemeGrantPrincipalInput | GlobalGrantPrincipalInput,
): Promise<void> {
  if (principal.type === "authenticated_user") return;
  if (principal.type === "user") {
    const [stored] = await tx.select({ id: user.id }).from(user).where(eq(user.id, principal.userId));
    if (!stored) throw new ProtectedInvariantError("Utilisateur introuvable.");
    return;
  }
  if (principal.type === "group") {
    const [stored] = await tx
      .select({ id: userGroups.id })
      .from(userGroups)
      .where(eq(userGroups.id, principal.groupId));
    if (!stored) throw new ProtectedInvariantError("Groupe introuvable.");
    return;
  }
  const [stored] = await tx
    .select({ id: projectRoles.id })
    .from(projectRoles)
    .where(eq(projectRoles.id, principal.projectRoleId));
  if (!stored) throw new ProtectedInvariantError("Rôle de projet introuvable.");
}

async function lockedGroup(tx: Transaction, groupId: string) {
  await lockAggregate(tx, `authorization-group:${groupId}`);
  const [group] = await tx
    .select({ id: userGroups.id, key: userGroups.key, name: userGroups.name, protected: userGroups.protected })
    .from(userGroups)
    .where(eq(userGroups.id, groupId))
    .for("update");
  if (!group) throw new ProtectedInvariantError("Groupe introuvable.");
  return group;
}

async function existingGroup(tx: Transaction, groupId: string) {
  await lockAggregate(tx, `authorization-group:${groupId}`);
  const [group] = await tx
    .select({ id: userGroups.id, key: userGroups.key, name: userGroups.name, protected: userGroups.protected })
    .from(userGroups)
    .where(eq(userGroups.id, groupId));
  if (!group) throw new ProtectedInvariantError("Groupe introuvable.");
  return group;
}

async function groupRequiresPlatformAdministration(
  tx: Transaction,
  group: { id: string; protected: boolean },
): Promise<boolean> {
  if (group.protected) return true;
  const [grant] = await tx
    .select({ id: permissionGrants.id })
    .from(permissionGrants)
    .where(
      and(
        eq(permissionGrants.scope, "global"),
        eq(permissionGrants.permissionKey, "administer_jiroo"),
        eq(permissionGrants.groupId, group.id),
      ),
    )
    .limit(1);
  return Boolean(grant);
}

async function platformAdministratorIds(tx: Transaction): Promise<Set<string>> {
  const users = await tx.select({ id: user.id, role: user.role }).from(user);
  const grants = await tx
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
    );
  const memberships = await tx
    .select({ groupId: groupMembers.groupId, userId: groupMembers.userId })
    .from(groupMembers);
  return resolvePlatformAdministratorIds({ users, grants, memberships });
}

async function assertGroupMembershipActorAllowed(
  tx: Transaction,
  group: { id: string; protected: boolean },
  actorId: string,
): Promise<void> {
  if (!(await groupRequiresPlatformAdministration(tx, group))) return;
  if (!(await platformAdministratorIds(tx)).has(actorId)) {
    throw new ProtectedInvariantError(PRIVILEGED_GROUP_MEMBERSHIP_MESSAGE);
  }
}

async function lockedRole(tx: Transaction, projectRoleId: string) {
  await lockAggregate(tx, `authorization-role:${projectRoleId}`);
  const [role] = await tx
    .select({
      id: projectRoles.id,
      key: projectRoles.key,
      name: projectRoles.name,
      description: projectRoles.description,
      protected: projectRoles.protected,
    })
    .from(projectRoles)
    .where(eq(projectRoles.id, projectRoleId))
    .for("update");
  if (!role) throw new ProtectedInvariantError("Rôle de projet introuvable.");
  return role;
}

async function lockedScheme(tx: Transaction, schemeId: string) {
  await lockAggregate(tx, `authorization-scheme:${schemeId}`);
  const [scheme] = await tx
    .select({
      id: permissionSchemes.id,
      key: permissionSchemes.key,
      name: permissionSchemes.name,
      description: permissionSchemes.description,
      protected: permissionSchemes.protected,
      version: permissionSchemes.version,
    })
    .from(permissionSchemes)
    .where(eq(permissionSchemes.id, schemeId))
    .for("update");
  if (!scheme) throw new ProtectedInvariantError("Schéma de permissions introuvable.");
  return scheme;
}

async function lockedBacklogConfig(tx: Transaction, backlogId: string) {
  await lockAggregate(tx, `authorization-backlog:${backlogId}`);
  const [config] = await tx
    .select({
      backlogId: backlogPermissionConfigs.backlogId,
      permissionSchemeId: backlogPermissionConfigs.permissionSchemeId,
      accessMode: backlogPermissionConfigs.accessMode,
      backlogKey: backlogs.key,
      backlogName: backlogs.name,
    })
    .from(backlogPermissionConfigs)
    .innerJoin(backlogs, eq(backlogs.id, backlogPermissionConfigs.backlogId))
    .where(eq(backlogPermissionConfigs.backlogId, backlogId))
    .for("update");
  if (!config) throw new ProtectedInvariantError("Configuration d’accès introuvable.");
  return config;
}

type LockedBacklogConfig = Awaited<ReturnType<typeof lockedBacklogConfig>>;

async function loadBacklogConfig(tx: Transaction, backlogId: string) {
  const [config] = await tx
    .select({
      backlogId: backlogPermissionConfigs.backlogId,
      permissionSchemeId: backlogPermissionConfigs.permissionSchemeId,
      accessMode: backlogPermissionConfigs.accessMode,
      backlogKey: backlogs.key,
      backlogName: backlogs.name,
    })
    .from(backlogPermissionConfigs)
    .innerJoin(backlogs, eq(backlogs.id, backlogPermissionConfigs.backlogId))
    .where(eq(backlogPermissionConfigs.backlogId, backlogId));
  if (!config) throw new ProtectedInvariantError("Configuration d’accès introuvable.");
  return config;
}

async function lockSchemes(tx: Transaction, schemeIds: string[]) {
  const schemes = new Map<string, Awaited<ReturnType<typeof lockedScheme>>>();
  for (const schemeId of [...new Set(schemeIds)].sort()) {
    schemes.set(schemeId, await lockedScheme(tx, schemeId));
  }
  return schemes;
}

async function lockSchemeConfigurations(
  tx: Transaction,
  schemeIds: string[],
): Promise<LockedBacklogConfig[]> {
  const uniqueSchemeIds = [...new Set(schemeIds)];
  if (uniqueSchemeIds.length === 0) return [];
  const backlogRows = await tx
    .select({ backlogId: backlogPermissionConfigs.backlogId })
    .from(backlogPermissionConfigs)
    .where(inArray(backlogPermissionConfigs.permissionSchemeId, uniqueSchemeIds));
  for (const backlogId of backlogRows.map((row) => row.backlogId).sort()) {
    await lockAggregate(tx, `authorization-backlog:${backlogId}`);
  }
  return tx
    .select({
      backlogId: backlogPermissionConfigs.backlogId,
      permissionSchemeId: backlogPermissionConfigs.permissionSchemeId,
      accessMode: backlogPermissionConfigs.accessMode,
      backlogKey: backlogs.key,
      backlogName: backlogs.name,
    })
    .from(backlogPermissionConfigs)
    .innerJoin(backlogs, eq(backlogs.id, backlogPermissionConfigs.backlogId))
    .where(inArray(backlogPermissionConfigs.permissionSchemeId, uniqueSchemeIds))
    .orderBy(asc(backlogPermissionConfigs.backlogId))
    .for("update");
}

type SchemeGrantProjection = {
  excludeGrantId?: string;
  add?: {
    permissionKey: string;
    principalType: "user" | "group" | "project_role" | "authenticated_user";
    projectRoleId?: string;
  };
};

async function assertCanonicalSimpleMatrix(
  tx: Transaction,
  schemeId: string,
  projection: SchemeGrantProjection = {},
): Promise<void> {
  const grants = await tx
    .select({
      id: permissionGrants.id,
      permissionKey: permissionGrants.permissionKey,
      principalType: permissionGrants.principalType,
      projectRoleId: permissionGrants.projectRoleId,
      projectRoleKey: projectRoles.key,
    })
    .from(permissionGrants)
    .leftJoin(projectRoles, eq(projectRoles.id, permissionGrants.projectRoleId))
    .where(eq(permissionGrants.permissionSchemeId, schemeId));

  const projected = grants
    .filter((grant) => grant.id !== projection.excludeGrantId)
    .map((grant) => ({
      permissionKey: grant.permissionKey,
      principalType: grant.principalType,
      projectRoleKey: grant.projectRoleKey,
    }));
  if (projection.add) {
    let projectRoleKey: string | null = null;
    if (projection.add.projectRoleId) {
      const [role] = await tx
        .select({ key: projectRoles.key })
        .from(projectRoles)
        .where(eq(projectRoles.id, projection.add.projectRoleId));
      projectRoleKey = role?.key ?? null;
    }
    projected.push({ ...projection.add, projectRoleKey });
  }

  const expectedPairs = new Set(
    Object.entries(PROTECTED_ROLE_PERMISSION_KEYS).flatMap(([roleKey, permissions]) =>
      permissions.map((permissionKey) => `${roleKey}:${permissionKey}`),
    ),
  );
  const actualPairs = new Set<string>();
  for (const grant of projected) {
    if (grant.principalType !== "project_role" || !grant.projectRoleKey) {
      throw new ProtectedInvariantError(SIMPLE_MATRIX_MESSAGE);
    }
    const pair = `${grant.projectRoleKey}:${grant.permissionKey}`;
    if (!expectedPairs.has(pair)) throw new ProtectedInvariantError(SIMPLE_MATRIX_MESSAGE);
    actualPairs.add(pair);
  }
  if (projected.length !== expectedPairs.size || actualPairs.size !== expectedPairs.size) {
    throw new ProtectedInvariantError(SIMPLE_MATRIX_MESSAGE);
  }
}

async function assertSimpleSchemeInvariant(
  tx: Transaction,
  schemeId: string,
  configs: LockedBacklogConfig[],
  grantProjection: SchemeGrantProjection = {},
): Promise<void> {
  const schemeConfigs = configs.filter((config) => config.permissionSchemeId === schemeId);
  if (!schemeConfigs.some((config) => config.accessMode === "simple")) return;
  if (schemeConfigs.length !== 1) throw new ProtectedInvariantError(SIMPLE_SHARED_MESSAGE);
  await assertCanonicalSimpleMatrix(tx, schemeId, grantProjection);
}

function assertExpectedSchemeUsage(
  schemeId: string,
  configs: LockedBacklogConfig[],
  expectedUsageCount: number,
): void {
  const actualUsageCount = configs.filter(
    (config) => config.permissionSchemeId === schemeId,
  ).length;
  if (actualUsageCount !== expectedUsageCount) {
    throw new ProtectedInvariantError(STALE_SCHEME_USAGE_MESSAGE);
  }
}

type EffectiveAdminExclusion = {
  grantId?: string;
  roleActorId?: string;
  membership?: { groupId: string; userId: string };
};

async function effectiveBacklogAdministratorIds(
  tx: Transaction,
  backlogId: string,
  schemeId: string,
  exclusion: EffectiveAdminExclusion = {},
): Promise<Set<string>> {
  const users = await tx.select({ id: user.id }).from(user);
  const grants = await tx
    .select({
      id: permissionGrants.id,
      permissionKey: permissionGrants.permissionKey,
      principalType: permissionGrants.principalType,
      userId: permissionGrants.userId,
      groupId: permissionGrants.groupId,
      projectRoleId: permissionGrants.projectRoleId,
    })
    .from(permissionGrants)
    .where(
      and(
        eq(permissionGrants.permissionSchemeId, schemeId),
        inArray(permissionGrants.permissionKey, ["browse_backlog", "administer_backlog"]),
      ),
    );
  const memberships = await tx
    .select({ groupId: groupMembers.groupId, userId: groupMembers.userId })
    .from(groupMembers);
  const roleActors = await tx
    .select({
      id: backlogRoleActors.id,
      projectRoleId: backlogRoleActors.projectRoleId,
      actorType: backlogRoleActors.actorType,
      userId: backlogRoleActors.userId,
      groupId: backlogRoleActors.groupId,
    })
    .from(backlogRoleActors)
    .where(eq(backlogRoleActors.backlogId, backlogId));

  const membership = new Set(
    memberships
      .filter(
        (entry) =>
          !exclusion.membership ||
          entry.groupId !== exclusion.membership.groupId ||
          entry.userId !== exclusion.membership.userId,
      )
      .map((entry) => `${entry.groupId}:${entry.userId}`),
  );
  const actors = roleActors.filter((entry) => entry.id !== exclusion.roleActorId);
  const matches = (userId: string, grant: (typeof grants)[number]): boolean => {
    if (grant.id === exclusion.grantId) return false;
    if (grant.principalType === "authenticated_user") return true;
    if (grant.principalType === "user") return grant.userId === userId;
    if (grant.principalType === "group") {
      return Boolean(grant.groupId && membership.has(`${grant.groupId}:${userId}`));
    }
    return actors.some(
      (entry) =>
        entry.projectRoleId === grant.projectRoleId &&
        ((entry.actorType === "user" && entry.userId === userId) ||
          (entry.actorType === "group" &&
            Boolean(entry.groupId && membership.has(`${entry.groupId}:${userId}`)))),
    );
  };

  const result = new Set<string>();
  for (const candidate of users) {
    const canBrowse = grants.some(
      (grant) => grant.permissionKey === "browse_backlog" && matches(candidate.id, grant),
    );
    const canAdminister = grants.some(
      (grant) => grant.permissionKey === "administer_backlog" && matches(candidate.id, grant),
    );
    if (canBrowse && canAdminister) result.add(candidate.id);
  }
  return result;
}

async function assertBacklogAdministratorsRemain(
  tx: Transaction,
  backlogIds: string[],
  exclusion: EffectiveAdminExclusion = {},
  schemeOverride?: string,
): Promise<void> {
  const orderedBacklogIds = [...new Set(backlogIds)].sort();
  for (const backlogId of orderedBacklogIds) {
    await lockAggregate(tx, `authorization-backlog:${backlogId}`);
  }
  for (const backlogId of orderedBacklogIds) {
    const [config] = await tx
      .select({ permissionSchemeId: backlogPermissionConfigs.permissionSchemeId })
      .from(backlogPermissionConfigs)
      .where(eq(backlogPermissionConfigs.backlogId, backlogId));
    if (!config) throw new ProtectedInvariantError("Configuration d’accès introuvable.");
    const effective = await effectiveBacklogAdministratorIds(
      tx,
      backlogId,
      schemeOverride ?? config.permissionSchemeId,
      exclusion,
    );
    if (effective.size === 0) throw new ProtectedInvariantError(LAST_BACKLOG_ADMIN_MESSAGE);
  }
}

async function assertPlatformAdministratorsRemain(
  tx: Transaction,
  exclusion: { grantId?: string; membership?: { groupId: string; userId: string } } = {},
): Promise<void> {
  const users = await tx.select({ id: user.id, role: user.role }).from(user);
  const grants = await tx
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
    );
  const memberships = await tx
    .select({ groupId: groupMembers.groupId, userId: groupMembers.userId })
    .from(groupMembers);
  const members = memberships.filter(
    (entry) =>
      !exclusion.membership ||
      entry.groupId !== exclusion.membership.groupId ||
      entry.userId !== exclusion.membership.userId,
  );
  const administratorIds = resolvePlatformAdministratorIds({
    users,
    grants: grants.filter((grant) => grant.id !== exclusion.grantId),
    memberships: members,
  });
  if (administratorIds.size === 0) throw new ProtectedInvariantError(LAST_PLATFORM_ADMIN_MESSAGE);
}

async function affectedBacklogsForScheme(tx: Transaction, schemeId: string) {
  return tx
    .select({ id: backlogs.id, key: backlogs.key, name: backlogs.name })
    .from(backlogPermissionConfigs)
    .innerJoin(backlogs, eq(backlogs.id, backlogPermissionConfigs.backlogId))
    .where(eq(backlogPermissionConfigs.permissionSchemeId, schemeId))
    .orderBy(asc(backlogs.name), asc(backlogs.id));
}

async function backlogDependenciesForGroup(tx: Transaction, groupId: string) {
  return tx
    .select({ id: backlogs.id, key: backlogs.key, name: backlogs.name })
    .from(backlogs)
    .innerJoin(backlogPermissionConfigs, eq(backlogPermissionConfigs.backlogId, backlogs.id))
    .leftJoin(
      permissionGrants,
      and(
        eq(permissionGrants.permissionSchemeId, backlogPermissionConfigs.permissionSchemeId),
        eq(permissionGrants.groupId, groupId),
      ),
    )
    .leftJoin(
      backlogRoleActors,
      and(eq(backlogRoleActors.backlogId, backlogs.id), eq(backlogRoleActors.groupId, groupId)),
    )
    .where(or(eq(permissionGrants.groupId, groupId), eq(backlogRoleActors.groupId, groupId)));
}

async function affectedBacklogsForGroup(tx: Transaction, groupId: string) {
  const [platformGrant] = await tx
    .select({ id: permissionGrants.id })
    .from(permissionGrants)
    .where(
      and(
        eq(permissionGrants.scope, "global"),
        eq(permissionGrants.permissionKey, "administer_jiroo"),
        eq(permissionGrants.groupId, groupId),
      ),
    )
    .limit(1);
  const rows = platformGrant
    ? await tx
        .select({ id: backlogs.id, key: backlogs.key, name: backlogs.name })
        .from(backlogs)
        .orderBy(asc(backlogs.name), asc(backlogs.id))
    : await backlogDependenciesForGroup(tx, groupId);
  return [...new Map(rows.map((row) => [row.id, row])).values()].sort(
    (left, right) => left.name.localeCompare(right.name, "fr") || left.id.localeCompare(right.id),
  );
}

async function allBacklogKeys(tx: Transaction): Promise<string[]> {
  const rows = await tx.select({ key: backlogs.key }).from(backlogs).orderBy(asc(backlogs.key));
  return rows.map((row) => row.key);
}

export async function createGroup(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = groupCreateInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, `authorization-group-name:${parsed.name.toLocaleLowerCase("fr")}`);
    const label = await actorLabel(tx, actorId);
    const [group] = await tx
      .insert(userGroups)
      .values({ key: generatedKey("group"), name: parsed.name })
      .returning({ id: userGroups.id, name: userGroups.name, protected: userGroups.protected });
    if (!group) throw new Error("Création du groupe impossible.");
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "group_created",
      scope: "global",
      targetType: "group",
      targetId: group.id,
      newValue: { name: group.name },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return group;
  });
}

export async function renameGroup(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = groupRenameInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, MEMBERSHIP_TOPOLOGY_LOCK);
    const group = await lockedGroup(tx, parsed.groupId);
    const label = await actorLabel(tx, actorId);
    const [updated] = await tx
      .update(userGroups)
      .set({ name: parsed.name, updatedAt: new Date() })
      .where(eq(userGroups.id, group.id))
      .returning({ id: userGroups.id, name: userGroups.name, protected: userGroups.protected });
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "group_renamed",
      scope: "global",
      targetType: "group",
      targetId: group.id,
      oldValue: { name: group.name },
      newValue: { name: parsed.name },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return updated!;
  });
}

export async function addGroupMember(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = groupMembershipInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, MEMBERSHIP_TOPOLOGY_LOCK);
    await lockAggregate(tx, "authorization-global-permissions");
    const group = await existingGroup(tx, parsed.groupId);
    await assertGroupMembershipActorAllowed(tx, group, actorId);
    const label = await actorLabel(tx, actorId);
    await assertPrincipalExists(tx, { type: "user", userId: parsed.userId });
    const affected = await affectedBacklogsForGroup(tx, group.id);
    const [membership] = await tx
      .insert(groupMembers)
      .values(parsed)
      .onConflictDoNothing()
      .returning({ id: groupMembers.id });
    if (!membership) throw new ProtectedInvariantError("Cet utilisateur appartient déjà au groupe.");
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "group_member_added",
      scope: "global",
      targetType: "group",
      targetId: group.id,
      newValue: { userId: parsed.userId },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return {
      groupId: group.id,
      userId: parsed.userId,
      affectedBacklogKeys: affected.map((backlog) => backlog.key),
    };
  });
}

export async function removeGroupMember(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = groupMembershipInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, MEMBERSHIP_TOPOLOGY_LOCK);
    await lockAggregate(tx, "authorization-global-permissions");
    const group = await existingGroup(tx, parsed.groupId);
    await assertGroupMembershipActorAllowed(tx, group, actorId);
    const label = await actorLabel(tx, actorId);
    const [membership] = await tx
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, parsed.userId)))
      .for("update");
    if (!membership) throw new ProtectedInvariantError("Ce membre est introuvable dans le groupe.");

    const exclusion = { membership: { groupId: group.id, userId: parsed.userId } };
    await assertPlatformAdministratorsRemain(tx, exclusion);
    const affected = await affectedBacklogsForGroup(tx, group.id);
    const administrationDependencies = await backlogDependenciesForGroup(tx, group.id);
    await assertBacklogAdministratorsRemain(
      tx,
      administrationDependencies.map((backlog) => backlog.id),
      exclusion,
    );

    await tx.delete(groupMembers).where(eq(groupMembers.id, membership.id));
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "group_member_removed",
      scope: "global",
      targetType: "group",
      targetId: group.id,
      oldValue: { userId: parsed.userId },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return {
      groupId: group.id,
      userId: parsed.userId,
      affectedBacklogKeys: affected.map((backlog) => backlog.key),
    };
  });
}

export async function deleteGroup(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = groupDeleteInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, MEMBERSHIP_TOPOLOGY_LOCK);
    const group = await lockedGroup(tx, parsed.groupId);
    const label = await actorLabel(tx, actorId);
    if (group.protected) throw new ProtectedInvariantError("Ce groupe protégé ne peut pas être supprimé.");
    const grant = await tx
      .select({ id: permissionGrants.id })
      .from(permissionGrants)
      .where(eq(permissionGrants.groupId, group.id))
      .limit(1);
    const occupancy = await tx
      .select({ id: backlogRoleActors.id })
      .from(backlogRoleActors)
      .where(eq(backlogRoleActors.groupId, group.id))
      .limit(1);
    if (grant.length > 0 || occupancy.length > 0) {
      throw new ProtectedInvariantError(
        "Ce groupe est utilisé par une autorisation ou un rôle de backlog.",
      );
    }
    await tx.delete(userGroups).where(eq(userGroups.id, group.id));
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "group_deleted",
      scope: "global",
      targetType: "group",
      targetId: group.id,
      oldValue: { name: group.name },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return { id: group.id };
  });
}

export async function createProjectRole(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = projectRoleCreateInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, `authorization-role-name:${parsed.name.toLocaleLowerCase("fr")}`);
    const label = await actorLabel(tx, actorId);
    const [role] = await tx
      .insert(projectRoles)
      .values({ key: generatedKey("role"), name: parsed.name, description: parsed.description })
      .returning({
        id: projectRoles.id,
        name: projectRoles.name,
        description: projectRoles.description,
        protected: projectRoles.protected,
      });
    if (!role) throw new Error("Création du rôle impossible.");
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "project_role_created",
      scope: "global",
      targetType: "project_role",
      targetId: role.id,
      newValue: { name: role.name, description: role.description },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return role;
  });
}

export async function updateProjectRole(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = projectRoleUpdateInput.parse(input);
  return db.transaction(async (tx) => {
    const role = await lockedRole(tx, parsed.projectRoleId);
    const label = await actorLabel(tx, actorId);
    const [updated] = await tx
      .update(projectRoles)
      .set({ name: parsed.name, description: parsed.description, updatedAt: new Date() })
      .where(eq(projectRoles.id, role.id))
      .returning({
        id: projectRoles.id,
        name: projectRoles.name,
        description: projectRoles.description,
        protected: projectRoles.protected,
      });
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "project_role_updated",
      scope: "global",
      targetType: "project_role",
      targetId: role.id,
      oldValue: { name: role.name, description: role.description },
      newValue: { name: parsed.name, description: parsed.description },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return updated!;
  });
}

export async function deleteProjectRole(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = projectRoleDeleteInput.parse(input);
  return db.transaction(async (tx) => {
    const role = await lockedRole(tx, parsed.projectRoleId);
    const label = await actorLabel(tx, actorId);
    if (role.protected) throw new ProtectedInvariantError("Ce rôle protégé ne peut pas être supprimé.");
    const grant = await tx
      .select({ id: permissionGrants.id })
      .from(permissionGrants)
      .where(eq(permissionGrants.projectRoleId, role.id))
      .limit(1);
    const occupancy = await tx
      .select({ id: backlogRoleActors.id })
      .from(backlogRoleActors)
      .where(eq(backlogRoleActors.projectRoleId, role.id))
      .limit(1);
    if (grant.length > 0 || occupancy.length > 0) {
      throw new ProtectedInvariantError("Ce rôle de projet est encore utilisé.");
    }
    await tx.delete(projectRoles).where(eq(projectRoles.id, role.id));
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "project_role_deleted",
      scope: "global",
      targetType: "project_role",
      targetId: role.id,
      oldValue: { name: role.name },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return { id: role.id };
  });
}

function roleActorCondition(input: BacklogRoleActorInput) {
  return input.principal.type === "user"
    ? and(
        eq(backlogRoleActors.backlogId, input.backlogId),
        eq(backlogRoleActors.projectRoleId, input.projectRoleId),
        eq(backlogRoleActors.actorType, "user"),
        eq(backlogRoleActors.userId, input.principal.userId),
      )
    : and(
        eq(backlogRoleActors.backlogId, input.backlogId),
        eq(backlogRoleActors.projectRoleId, input.projectRoleId),
        eq(backlogRoleActors.actorType, "group"),
        eq(backlogRoleActors.groupId, input.principal.groupId),
      );
}

export async function assignBacklogRoleActor(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = backlogRoleActorInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, MEMBERSHIP_TOPOLOGY_LOCK);
    const config = await lockedBacklogConfig(tx, parsed.backlogId);
    await lockedRole(tx, parsed.projectRoleId);
    await assertPrincipalExists(tx, parsed.principal);
    const label = await actorLabel(tx, actorId);
    const values =
      parsed.principal.type === "user"
        ? { actorType: "user" as const, userId: parsed.principal.userId }
        : { actorType: "group" as const, groupId: parsed.principal.groupId };
    const [occupancy] = await tx
      .insert(backlogRoleActors)
      .values({ backlogId: parsed.backlogId, projectRoleId: parsed.projectRoleId, ...values })
      .onConflictDoNothing()
      .returning({ id: backlogRoleActors.id });
    if (!occupancy) throw new ProtectedInvariantError("Cette affectation de rôle existe déjà.");
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "backlog_role_actor_assigned",
      scope: "backlog",
      backlogId: parsed.backlogId,
      targetType: "backlog_role_actor",
      targetId: occupancy.id,
      newValue: { projectRoleId: parsed.projectRoleId, principal: parsed.principal },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return { id: occupancy.id, backlogKey: config.backlogKey };
  });
}

export async function removeBacklogRoleActor(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = backlogRoleActorInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, MEMBERSHIP_TOPOLOGY_LOCK);
    const config = await lockedBacklogConfig(tx, parsed.backlogId);
    await lockedRole(tx, parsed.projectRoleId);
    const label = await actorLabel(tx, actorId);
    const [occupancy] = await tx
      .select({ id: backlogRoleActors.id })
      .from(backlogRoleActors)
      .where(roleActorCondition(parsed))
      .for("update");
    if (!occupancy) throw new ProtectedInvariantError("Cette affectation de rôle est introuvable.");
    await assertBacklogAdministratorsRemain(tx, [parsed.backlogId], {
      roleActorId: occupancy.id,
    });
    await tx.delete(backlogRoleActors).where(eq(backlogRoleActors.id, occupancy.id));
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "backlog_role_actor_removed",
      scope: "backlog",
      backlogId: parsed.backlogId,
      targetType: "backlog_role_actor",
      targetId: occupancy.id,
      oldValue: { projectRoleId: parsed.projectRoleId, principal: parsed.principal },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return { id: occupancy.id, backlogKey: config.backlogKey };
  });
}

export async function moveBacklogRoleActor(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = moveBacklogRoleActorInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, MEMBERSHIP_TOPOLOGY_LOCK);
    const config = await lockedBacklogConfig(tx, parsed.backlogId);
    if (config.accessMode !== "simple") {
      throw new ProtectedInvariantError(
        "Le déplacement simplifié est réservé au mode Simple.",
      );
    }

    const lockedRoles = new Map<string, Awaited<ReturnType<typeof lockedRole>>>();
    for (const roleId of [
      parsed.sourceProjectRoleId,
      parsed.targetProjectRoleId,
    ].sort()) {
      lockedRoles.set(roleId, await lockedRole(tx, roleId));
    }
    const sourceRole = lockedRoles.get(parsed.sourceProjectRoleId)!;
    const targetRole = lockedRoles.get(parsed.targetProjectRoleId)!;
    if (!sourceRole.protected || !targetRole.protected) {
      throw new ProtectedInvariantError(
        "Le déplacement simplifié exige deux rôles protégés.",
      );
    }

    const sourceInput: BacklogRoleActorInput = {
      backlogId: parsed.backlogId,
      projectRoleId: parsed.sourceProjectRoleId,
      principal: parsed.principal,
    };
    const targetInput: BacklogRoleActorInput = {
      backlogId: parsed.backlogId,
      projectRoleId: parsed.targetProjectRoleId,
      principal: parsed.principal,
    };
    const [source] = await tx
      .select({ id: backlogRoleActors.id })
      .from(backlogRoleActors)
      .where(roleActorCondition(sourceInput))
      .for("update");
    if (!source) {
      throw new ProtectedInvariantError("Cette affectation de rôle est introuvable.");
    }
    const [target] = await tx
      .select({ id: backlogRoleActors.id })
      .from(backlogRoleActors)
      .where(roleActorCondition(targetInput))
      .for("update");
    if (target) {
      throw new ProtectedInvariantError("Cette affectation de rôle existe déjà.");
    }

    await assertBacklogAdministratorsRemain(tx, [parsed.backlogId], {
      roleActorId: source.id,
    });
    const label = await actorLabel(tx, actorId);
    await tx.delete(backlogRoleActors).where(eq(backlogRoleActors.id, source.id));
    const values = parsed.principal.type === "user"
      ? { actorType: "user" as const, userId: parsed.principal.userId }
      : { actorType: "group" as const, groupId: parsed.principal.groupId };
    const [occupancy] = await tx
      .insert(backlogRoleActors)
      .values({
        backlogId: parsed.backlogId,
        projectRoleId: parsed.targetProjectRoleId,
        ...values,
      })
      .returning({ id: backlogRoleActors.id });
    if (!occupancy) throw new Error("Déplacement de rôle impossible.");
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "backlog_role_actor_moved",
      scope: "backlog",
      backlogId: parsed.backlogId,
      targetType: "backlog_role_actor",
      targetId: occupancy.id,
      oldValue: {
        actorId: source.id,
        projectRoleId: parsed.sourceProjectRoleId,
        principal: parsed.principal,
      },
      newValue: {
        projectRoleId: parsed.targetProjectRoleId,
        principal: parsed.principal,
      },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return {
      id: occupancy.id,
      previousId: source.id,
      backlogKey: config.backlogKey,
    };
  });
}

export async function clonePermissionScheme(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = permissionSchemeCloneInput.parse(input);
  return db.transaction(async (tx) => {
    const source = await lockedScheme(tx, parsed.sourceSchemeId);
    const label = await actorLabel(tx, actorId);
    const [clone] = await tx
      .insert(permissionSchemes)
      .values({
        key: generatedKey("permission-scheme"),
        name: parsed.name,
        description: parsed.description,
      })
      .returning({
        id: permissionSchemes.id,
        name: permissionSchemes.name,
        description: permissionSchemes.description,
        version: permissionSchemes.version,
        protected: permissionSchemes.protected,
      });
    if (!clone) throw new Error("Clonage du schéma impossible.");
    const grants = await tx
      .select({
        permissionKey: permissionGrants.permissionKey,
        principalType: permissionGrants.principalType,
        userId: permissionGrants.userId,
        groupId: permissionGrants.groupId,
        projectRoleId: permissionGrants.projectRoleId,
      })
      .from(permissionGrants)
      .where(eq(permissionGrants.permissionSchemeId, source.id));
    if (grants.length > 0) {
      await tx.insert(permissionGrants).values(
        grants.map((grant) => ({
          scope: "backlog" as const,
          permissionSchemeId: clone.id,
          permissionKey: grant.permissionKey,
          principalType: grant.principalType,
          userId: grant.userId,
          groupId: grant.groupId,
          projectRoleId: grant.projectRoleId,
        })),
      );
    }
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "permission_scheme_cloned",
      scope: "global",
      targetType: "permission_scheme",
      targetId: clone.id,
      oldValue: { sourceSchemeId: source.id },
      newValue: { name: clone.name },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return clone;
  });
}

export async function addSchemeGrant(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = grantInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, MEMBERSHIP_TOPOLOGY_LOCK);
    await lockAggregate(tx, SCHEME_TOPOLOGY_LOCK);
    const scheme = await lockedScheme(tx, parsed.schemeId);
    const configs = await lockSchemeConfigurations(tx, [scheme.id]);
    if (scheme.version !== parsed.expectedVersion) throw new StaleSchemeVersionError();
    assertExpectedSchemeUsage(scheme.id, configs, parsed.expectedUsageCount);
    await assertPrincipalExists(tx, parsed.principal);
    const principal = principalColumns(parsed.principal);
    await assertSimpleSchemeInvariant(tx, scheme.id, configs, {
      add: {
        permissionKey: parsed.permission,
        principalType: principal.principalType,
        projectRoleId: principal.projectRoleId,
      },
    });
    const label = await actorLabel(tx, actorId);
    const [grant] = await tx
      .insert(permissionGrants)
      .values({
        scope: "backlog",
        permissionSchemeId: scheme.id,
        permissionKey: parsed.permission,
        ...principal,
      })
      .returning({ id: permissionGrants.id });
    if (!grant) throw new Error("Création de l’autorisation impossible.");
    const version = scheme.version + 1;
    await tx
      .update(permissionSchemes)
      .set({ version, updatedAt: new Date() })
      .where(eq(permissionSchemes.id, scheme.id));
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "permission_scheme_grant_added",
      scope: "backlog",
      targetType: "permission_grant",
      targetId: grant.id,
      newValue: { permission: parsed.permission, principal: parsed.principal, version },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    const affected = await affectedBacklogsForScheme(tx, scheme.id);
    return {
      id: grant.id,
      permission: parsed.permission,
      principalType: parsed.principal.type,
      version,
      affectedBacklogKeys: affected.map((backlog) => backlog.key),
    };
  });
}

export async function removeSchemeGrant(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = schemeGrantRemovalInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, MEMBERSHIP_TOPOLOGY_LOCK);
    await lockAggregate(tx, SCHEME_TOPOLOGY_LOCK);
    const scheme = await lockedScheme(tx, parsed.schemeId);
    const configs = await lockSchemeConfigurations(tx, [scheme.id]);
    if (scheme.version !== parsed.expectedVersion) throw new StaleSchemeVersionError();
    assertExpectedSchemeUsage(scheme.id, configs, parsed.expectedUsageCount);
    const label = await actorLabel(tx, actorId);
    const [grant] = await tx
      .select({
        id: permissionGrants.id,
        permissionKey: permissionGrants.permissionKey,
        principalType: permissionGrants.principalType,
        userId: permissionGrants.userId,
        groupId: permissionGrants.groupId,
        projectRoleId: permissionGrants.projectRoleId,
      })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.id, parsed.grantId),
          eq(permissionGrants.permissionSchemeId, scheme.id),
        ),
      )
      .for("update");
    if (!grant) throw new ProtectedInvariantError("Autorisation introuvable.");
    await assertSimpleSchemeInvariant(tx, scheme.id, configs, {
      excludeGrantId: grant.id,
    });
    const affected = await affectedBacklogsForScheme(tx, scheme.id);
    await assertBacklogAdministratorsRemain(
      tx,
      affected.map((backlog) => backlog.id),
      { grantId: grant.id },
    );
    await tx.delete(permissionGrants).where(eq(permissionGrants.id, grant.id));
    const version = scheme.version + 1;
    await tx
      .update(permissionSchemes)
      .set({ version, updatedAt: new Date() })
      .where(eq(permissionSchemes.id, scheme.id));
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "permission_scheme_grant_removed",
      scope: "backlog",
      targetType: "permission_grant",
      targetId: grant.id,
      oldValue: {
        permission: grant.permissionKey,
        principalType: grant.principalType,
        userId: grant.userId,
        groupId: grant.groupId,
        projectRoleId: grant.projectRoleId,
        version: scheme.version,
      },
      newValue: { version },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return { id: grant.id, version, affectedBacklogKeys: affected.map((entry) => entry.key) };
  });
}

export async function addGlobalPermissionGrant(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = globalGrantInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, MEMBERSHIP_TOPOLOGY_LOCK);
    await lockAggregate(tx, "authorization-global-permissions");
    await assertPrincipalExists(tx, parsed.principal);
    const label = await actorLabel(tx, actorId);
    const [grant] = await tx
      .insert(permissionGrants)
      .values({
        scope: "global",
        permissionKey: parsed.permission,
        ...principalColumns(parsed.principal),
      })
      .returning({ id: permissionGrants.id });
    if (!grant) throw new Error("Création de l’autorisation impossible.");
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "global_permission_grant_added",
      scope: "global",
      targetType: "permission_grant",
      targetId: grant.id,
      newValue: { permission: parsed.permission, principal: parsed.principal },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return {
      id: grant.id,
      permission: parsed.permission,
      principalType: parsed.principal.type,
      affectedBacklogKeys:
        parsed.permission === "administer_jiroo" ? await allBacklogKeys(tx) : [],
    };
  });
}

export async function removeGlobalPermissionGrant(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = globalGrantRemovalInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, MEMBERSHIP_TOPOLOGY_LOCK);
    await lockAggregate(tx, "authorization-global-permissions");
    const label = await actorLabel(tx, actorId);
    const [grant] = await tx
      .select({
        id: permissionGrants.id,
        permissionKey: permissionGrants.permissionKey,
        principalType: permissionGrants.principalType,
        userId: permissionGrants.userId,
        groupId: permissionGrants.groupId,
      })
      .from(permissionGrants)
      .where(and(eq(permissionGrants.id, parsed.grantId), eq(permissionGrants.scope, "global")))
      .for("update");
    if (!grant) throw new ProtectedInvariantError("Autorisation introuvable.");
    if (grant.permissionKey === "administer_jiroo") {
      await assertPlatformAdministratorsRemain(tx, { grantId: grant.id });
    }
    const affectedBacklogKeys =
      grant.permissionKey === "administer_jiroo" ? await allBacklogKeys(tx) : [];
    await tx.delete(permissionGrants).where(eq(permissionGrants.id, grant.id));
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "global_permission_grant_removed",
      scope: "global",
      targetType: "permission_grant",
      targetId: grant.id,
      oldValue: {
        permission: grant.permissionKey,
        principalType: grant.principalType,
        userId: grant.userId,
        groupId: grant.groupId,
      },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return { id: grant.id, affectedBacklogKeys };
  });
}

export async function associatePermissionScheme(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = schemeAssociationInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, SCHEME_TOPOLOGY_LOCK);
    const initialConfig = await loadBacklogConfig(tx, parsed.backlogId);
    await lockSchemes(tx, [initialConfig.permissionSchemeId, parsed.schemeId]);
    const configs = await lockSchemeConfigurations(tx, [
      initialConfig.permissionSchemeId,
      parsed.schemeId,
    ]);
    const config = configs.find((entry) => entry.backlogId === parsed.backlogId);
    if (!config) throw new ProtectedInvariantError("Configuration d’accès introuvable.");
    const projectedConfigs = configs.map((entry) =>
      entry.backlogId === parsed.backlogId
        ? { ...entry, permissionSchemeId: parsed.schemeId }
        : entry,
    );
    await assertSimpleSchemeInvariant(tx, config.permissionSchemeId, projectedConfigs);
    if (parsed.schemeId !== config.permissionSchemeId) {
      await assertSimpleSchemeInvariant(tx, parsed.schemeId, projectedConfigs);
    }
    const label = await actorLabel(tx, actorId);
    await assertBacklogAdministratorsRemain(tx, [parsed.backlogId], {}, parsed.schemeId);
    await tx
      .update(backlogPermissionConfigs)
      .set({ permissionSchemeId: parsed.schemeId, updatedAt: new Date() })
      .where(eq(backlogPermissionConfigs.backlogId, parsed.backlogId));
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "backlog_permission_scheme_associated",
      scope: "backlog",
      backlogId: parsed.backlogId,
      targetType: "backlog_permission_config",
      targetId: parsed.backlogId,
      oldValue: { schemeId: config.permissionSchemeId },
      newValue: { schemeId: parsed.schemeId },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return { backlogId: parsed.backlogId, backlogKey: config.backlogKey, schemeId: parsed.schemeId };
  });
}

export async function setBacklogAccessMode(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
) {
  const parsed = accessModeInput.parse(input);
  return db.transaction(async (tx) => {
    await lockAggregate(tx, SCHEME_TOPOLOGY_LOCK);
    const initialConfig = await loadBacklogConfig(tx, parsed.backlogId);
    await lockSchemes(tx, [initialConfig.permissionSchemeId]);
    const configs = await lockSchemeConfigurations(tx, [initialConfig.permissionSchemeId]);
    const config = configs.find((entry) => entry.backlogId === parsed.backlogId);
    if (!config) throw new ProtectedInvariantError("Configuration d’accès introuvable.");
    const label = await actorLabel(tx, actorId);
    const projectedConfigs = configs.map((entry) =>
      entry.backlogId === parsed.backlogId ? { ...entry, accessMode: parsed.mode } : entry,
    );
    await assertSimpleSchemeInvariant(tx, config.permissionSchemeId, projectedConfigs);
    await tx
      .update(backlogPermissionConfigs)
      .set({ accessMode: parsed.mode, updatedAt: new Date() })
      .where(eq(backlogPermissionConfigs.backlogId, parsed.backlogId));
    await appendSecurityAuditEvent(tx, {
      actorId,
      actorLabel: label,
      action: "backlog_access_mode_changed",
      scope: "backlog",
      backlogId: parsed.backlogId,
      targetType: "backlog_permission_config",
      targetId: parsed.backlogId,
      oldValue: { mode: config.accessMode },
      newValue: { mode: parsed.mode },
      requestCorrelationId: correlationId(requestCorrelationId),
    });
    return { backlogId: parsed.backlogId, backlogKey: config.backlogKey, mode: parsed.mode };
  });
}

export async function listAffectedBacklogs(schemeId: string) {
  const parsedSchemeId = permissionSchemeCloneInput.shape.sourceSchemeId.parse(schemeId);
  return affectedBacklogsForScheme(db as unknown as Transaction, parsedSchemeId);
}

export async function groupMembershipRequiredPermission(
  groupId: string,
): Promise<"manage_users_groups" | "administer_jiroo"> {
  const parsedGroupId = groupDeleteInput.shape.groupId.parse(groupId);
  const [group] = await db
    .select({ id: userGroups.id, protected: userGroups.protected })
    .from(userGroups)
    .where(eq(userGroups.id, parsedGroupId));
  if (!group) throw new ProtectedInvariantError("Groupe introuvable.");
  return (await groupRequiresPlatformAdministration(db as unknown as Transaction, group))
    ? "administer_jiroo"
    : "manage_users_groups";
}

export async function listGroups() {
  const [groups, memberships, grantReferences, roleReferences] = await Promise.all([
    db
      .select({ id: userGroups.id, name: userGroups.name, protected: userGroups.protected })
      .from(userGroups)
      .orderBy(asc(userGroups.name), asc(userGroups.id)),
    db
      .select({ groupId: groupMembers.groupId, id: user.id, name: user.name, email: user.email })
      .from(groupMembers)
      .innerJoin(user, eq(user.id, groupMembers.userId)),
    db
      .select({ groupId: permissionGrants.groupId, permissionKey: permissionGrants.permissionKey, scope: permissionGrants.scope, schemeName: permissionSchemes.name })
      .from(permissionGrants)
      .leftJoin(permissionSchemes, eq(permissionSchemes.id, permissionGrants.permissionSchemeId))
      .where(eq(permissionGrants.principalType, "group")),
    db
      .select({ groupId: backlogRoleActors.groupId, roleName: projectRoles.name, backlogName: backlogs.name })
      .from(backlogRoleActors)
      .innerJoin(projectRoles, eq(projectRoles.id, backlogRoleActors.projectRoleId))
      .innerJoin(backlogs, eq(backlogs.id, backlogRoleActors.backlogId))
      .where(eq(backlogRoleActors.actorType, "group")),
  ]);
  return groups.map((group) => ({
    ...group,
    membershipRequiresPlatformAdmin:
      group.protected ||
      grantReferences.some(
        (entry) =>
          entry.groupId === group.id &&
          entry.scope === "global" &&
          entry.permissionKey === "administer_jiroo",
      ),
    memberCount: memberships.filter((entry) => entry.groupId === group.id).length,
    members: memberships
      .filter((entry) => entry.groupId === group.id)
      .map(({ id, name, email }) => ({ id, name, email })),
    blockers: [
      ...grantReferences
        .filter((entry) => entry.groupId === group.id)
        .map((entry) => entry.scope === "global"
          ? `Permission globale « ${safePermissionLabel(entry.permissionKey)} »`
          : `Permission « ${safePermissionLabel(entry.permissionKey)} » dans ${entry.schemeName ?? "un schéma"}`),
      ...roleReferences
        .filter((entry) => entry.groupId === group.id)
        .map((entry) => `Rôle ${entry.roleName} dans ${entry.backlogName}`),
    ].sort((left, right) => left.localeCompare(right, "fr")),
  }));
}

export async function listProjectRoles() {
  const [roles, occupancies, grants] = await Promise.all([
    db
      .select({
        id: projectRoles.id,
        key: projectRoles.key,
        name: projectRoles.name,
        description: projectRoles.description,
        protected: projectRoles.protected,
      })
      .from(projectRoles)
      .orderBy(asc(projectRoles.name), asc(projectRoles.id)),
    db
      .select({ projectRoleId: backlogRoleActors.projectRoleId, backlogName: backlogs.name })
      .from(backlogRoleActors)
      .innerJoin(backlogs, eq(backlogs.id, backlogRoleActors.backlogId)),
    db
      .select({ projectRoleId: permissionGrants.projectRoleId, permissionKey: permissionGrants.permissionKey, schemeName: permissionSchemes.name })
      .from(permissionGrants)
      .innerJoin(permissionSchemes, eq(permissionSchemes.id, permissionGrants.permissionSchemeId))
      .where(eq(permissionGrants.principalType, "project_role")),
  ]);
  return roles.map((role) => ({
    ...role,
    occupancyCount: occupancies.filter((entry) => entry.projectRoleId === role.id).length,
    blockers: [
      ...occupancies.filter((entry) => entry.projectRoleId === role.id).map((entry) => `Affectation dans ${entry.backlogName}`),
      ...grants.filter((entry) => entry.projectRoleId === role.id).map((entry) => `Permission « ${safePermissionLabel(entry.permissionKey)} » dans ${entry.schemeName}`),
    ].sort((left, right) => left.localeCompare(right, "fr")),
  }));
}

function safePermissionLabel(key: string): string {
  try { return permissionDefinition(key).label; } catch { return "Permission inconnue"; }
}

function permissionCategory(key: string): string {
  if (["browse_backlog", "administer_backlog", "manage_members"].includes(key)) return "Accès";
  if (["manage_workflows", "manage_sprints", "manage_releases"].includes(key)) return "Administration du backlog";
  if (key.includes("comments")) return "Commentaires";
  if (key.includes("views")) return "Vues";
  return "Éléments";
}

export async function listGlobalPermissionGrants() {
  const rows = await db
    .select({
      id: permissionGrants.id,
      permission: permissionGrants.permissionKey,
      principalType: permissionGrants.principalType,
      userId: permissionGrants.userId,
      userName: user.name,
      groupId: permissionGrants.groupId,
      groupName: userGroups.name,
    })
    .from(permissionGrants)
    .leftJoin(user, eq(user.id, permissionGrants.userId))
    .leftJoin(userGroups, eq(userGroups.id, permissionGrants.groupId))
    .where(eq(permissionGrants.scope, "global"))
    .orderBy(asc(permissionGrants.permissionKey), asc(permissionGrants.id));
  return rows.flatMap((row) => {
    const principal = row.principalType === "user" && row.userId && row.userName
      ? { type: "user" as const, id: row.userId, label: row.userName }
      : row.principalType === "group" && row.groupId && row.groupName
        ? { type: "group" as const, id: row.groupId, label: row.groupName }
        : null;
    return principal ? [{ id: row.id, permission: row.permission, permissionLabel: safePermissionLabel(row.permission), principal }] : [];
  });
}

export async function listPermissionSchemes() {
  const [schemes, usages, grants] = await Promise.all([
    db
      .select({
        id: permissionSchemes.id,
        name: permissionSchemes.name,
        description: permissionSchemes.description,
        protected: permissionSchemes.protected,
        version: permissionSchemes.version,
      })
      .from(permissionSchemes)
      .orderBy(asc(permissionSchemes.name), asc(permissionSchemes.id)),
    db
      .select({ permissionSchemeId: backlogPermissionConfigs.permissionSchemeId, id: backlogs.id, key: backlogs.key, name: backlogs.name })
      .from(backlogPermissionConfigs)
      .innerJoin(backlogs, eq(backlogs.id, backlogPermissionConfigs.backlogId)),
    db
      .select({
        id: permissionGrants.id,
        permissionSchemeId: permissionGrants.permissionSchemeId,
        permission: permissionGrants.permissionKey,
        principalType: permissionGrants.principalType,
        userId: permissionGrants.userId,
        userName: user.name,
        groupId: permissionGrants.groupId,
        groupName: userGroups.name,
        roleId: permissionGrants.projectRoleId,
        roleName: projectRoles.name,
      })
      .from(permissionGrants)
      .leftJoin(user, eq(user.id, permissionGrants.userId))
      .leftJoin(userGroups, eq(userGroups.id, permissionGrants.groupId))
      .leftJoin(projectRoles, eq(projectRoles.id, permissionGrants.projectRoleId))
      .where(eq(permissionGrants.scope, "backlog"))
      .orderBy(asc(permissionGrants.permissionKey), asc(permissionGrants.id)),
  ]);
  return schemes.map((scheme) => ({
    ...scheme,
    usageCount: usages.filter((entry) => entry.permissionSchemeId === scheme.id).length,
    affectedBacklogs: usages.filter((entry) => entry.permissionSchemeId === scheme.id).map(({ id, key, name }) => ({ id, key, name })),
    grants: grants.filter((entry) => entry.permissionSchemeId === scheme.id).flatMap((entry) => {
      const principal = entry.principalType === "user" && entry.userId && entry.userName
        ? { type: "user" as const, id: entry.userId, label: entry.userName }
        : entry.principalType === "group" && entry.groupId && entry.groupName
          ? { type: "group" as const, id: entry.groupId, label: entry.groupName }
          : entry.principalType === "project_role" && entry.roleId && entry.roleName
            ? { type: "project_role" as const, id: entry.roleId, label: entry.roleName }
            : entry.principalType === "authenticated_user"
              ? { type: "authenticated_user" as const, id: "authenticated_user", label: "Tous les utilisateurs authentifiés" }
              : null;
      return principal ? [{ id: entry.id, permission: entry.permission, permissionLabel: safePermissionLabel(entry.permission), category: permissionCategory(entry.permission), principal }] : [];
    }),
  }));
}

export async function readBacklogAccess(backlogId: string) {
  const parsedBacklogId = schemeAssociationInput.shape.backlogId.parse(backlogId);
  const [config] = await db
    .select({
      backlogId: backlogs.id,
      backlogKey: backlogs.key,
      backlogName: backlogs.name,
      schemeId: permissionSchemes.id,
      schemeName: permissionSchemes.name,
      schemeVersion: permissionSchemes.version,
      mode: backlogPermissionConfigs.accessMode,
    })
    .from(backlogPermissionConfigs)
    .innerJoin(backlogs, eq(backlogs.id, backlogPermissionConfigs.backlogId))
    .innerJoin(permissionSchemes, eq(permissionSchemes.id, backlogPermissionConfigs.permissionSchemeId))
    .where(eq(backlogPermissionConfigs.backlogId, parsedBacklogId));
  if (!config) throw new ProtectedInvariantError("Configuration d’accès introuvable.");
  const [roles, actors] = await Promise.all([
    db.select({ id: projectRoles.id, key: projectRoles.key, name: projectRoles.name, description: projectRoles.description, protected: projectRoles.protected }).from(projectRoles).orderBy(asc(projectRoles.name)),
    db
      .select({ id: backlogRoleActors.id, projectRoleId: backlogRoleActors.projectRoleId, actorType: backlogRoleActors.actorType, userId: backlogRoleActors.userId, userName: user.name, userEmail: user.email, groupId: backlogRoleActors.groupId, groupName: userGroups.name })
      .from(backlogRoleActors)
      .leftJoin(user, eq(user.id, backlogRoleActors.userId))
      .leftJoin(userGroups, eq(userGroups.id, backlogRoleActors.groupId))
      .where(eq(backlogRoleActors.backlogId, parsedBacklogId)),
  ]);
  const roleDtos = await Promise.all(roles.map(async (role) => ({
    ...role,
    occupants: await Promise.all(actors.filter((entry) => entry.projectRoleId === role.id).flatMap((entry) => {
      const principal = entry.actorType === "user" && entry.userId && entry.userName
        ? { type: "user" as const, id: entry.userId, label: entry.userName, email: entry.userEmail ?? "" }
        : entry.actorType === "group" && entry.groupId && entry.groupName
          ? { type: "group" as const, id: entry.groupId, label: entry.groupName }
          : null;
      return principal ? [{ actorId: entry.id, principal }] : [];
    }).map(async (occupant) => ({
      ...occupant,
      removalBlocked: (await effectiveBacklogAdministratorIds(db as unknown as Transaction, parsedBacklogId, config.schemeId, { roleActorId: occupant.actorId })).size === 0,
    }))),
  })));
  return {
    backlog: { id: config.backlogId, key: config.backlogKey, name: config.backlogName },
    scheme: { id: config.schemeId, name: config.schemeName, version: config.schemeVersion },
    mode: config.mode,
    roles: roleDtos,
  };
}

export async function readSecurityHistory(input: unknown = {}) {
  const parsed = securityHistoryInput.parse(input);
  const rows = await db
    .select({
      id: securityAuditEvents.id,
      actorLabel: securityAuditEvents.actorLabel,
      action: securityAuditEvents.action,
      scope: securityAuditEvents.scope,
      backlogId: securityAuditEvents.backlogId,
      targetType: securityAuditEvents.targetType,
      targetId: securityAuditEvents.targetId,
      oldValue: securityAuditEvents.oldValue,
      newValue: securityAuditEvents.newValue,
      requestCorrelationId: securityAuditEvents.requestCorrelationId,
      createdAt: securityAuditEvents.createdAt,
    })
    .from(securityAuditEvents)
    .where(parsed.backlogId ? eq(securityAuditEvents.backlogId, parsed.backlogId) : undefined)
    .orderBy(desc(securityAuditEvents.createdAt), desc(securityAuditEvents.id))
    .limit(parsed.limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getPermissionHelperResult(input: unknown) {
  const parsed = permissionHelperInput.parse(input);
  const decision = await explainPermission({
    actorId: parsed.userId,
    permission: parsed.permission,
    scope: { type: "backlog", backlogId: parsed.backlogId },
  });
  return {
    allowed: decision.allowed,
    permission: decision.permission,
    reasons: decision.reasons.map((reason) => {
      if ("label" in reason) return { type: reason.type, label: reason.label };
      return { type: reason.type };
    }),
  };
}

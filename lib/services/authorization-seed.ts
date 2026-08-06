import { eq } from "drizzle-orm";
import {
  GLOBAL_PERMISSION_KEYS,
  PROTECTED_ROLE_PERMISSION_KEYS,
} from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  backlogPermissionConfigs,
  backlogRoleActors,
  groupMembers,
  permissionGrants,
  permissionSchemes,
  projectRoles,
  userGroups,
} from "@/lib/db/schema/domain";

export const PLATFORM_ADMINISTRATORS_GROUP_KEY = "platform-administrators";
export const ADMINISTRATORS_ROLE_KEY = "administrators";
export const MEMBERS_ROLE_KEY = "members";
export const VIEWERS_ROLE_KEY = "viewers";
export const DEFAULT_PERMISSION_SCHEME_KEY = "default-permission-scheme";

const PROTECTED_ROLES = [
  { key: ADMINISTRATORS_ROLE_KEY, name: "Administrateur" },
  { key: MEMBERS_ROLE_KEY, name: "Membre" },
  { key: VIEWERS_ROLE_KEY, name: "Lecteur" },
] as const;

export type SeedAuthorizationDefaultsInput = {
  platformAdministratorIds: string[];
  backlogAdministrators: Array<{ backlogId: string; userIds: string[] }>;
};

function privateSchemeKey(backlogId: string): string {
  return `backlog-${backlogId}-permission-scheme`;
}

type AuthorizationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function provisionBacklogAuthorization(
  tx: AuthorizationTransaction,
  input: { backlogId: string; administratorIds: readonly string[] },
): Promise<string> {
  const [[defaultScheme], [administratorRole]] = await Promise.all([
    tx
      .select({ id: permissionSchemes.id })
      .from(permissionSchemes)
      .where(eq(permissionSchemes.key, DEFAULT_PERMISSION_SCHEME_KEY)),
    tx
      .select({ id: projectRoles.id })
      .from(projectRoles)
      .where(eq(projectRoles.key, ADMINISTRATORS_ROLE_KEY)),
  ]);
  if (!defaultScheme) throw new Error("Le schéma de permissions par défaut est introuvable.");
  if (!administratorRole) throw new Error("Le rôle Administrateur est introuvable.");

  const schemeKey = privateSchemeKey(input.backlogId);
  await tx
    .insert(permissionSchemes)
    .values({
      key: schemeKey,
      name: `Schéma privé ${input.backlogId}`,
      description: "Copie privée du schéma de permissions par défaut.",
    })
    .onConflictDoNothing();
  const [privateScheme] = await tx
    .select({ id: permissionSchemes.id })
    .from(permissionSchemes)
    .where(eq(permissionSchemes.key, schemeKey));
  if (!privateScheme) {
    throw new Error(`Le schéma privé du backlog ${input.backlogId} est introuvable.`);
  }

  const defaultGrants = await tx
    .select({
      permissionKey: permissionGrants.permissionKey,
      principalType: permissionGrants.principalType,
      userId: permissionGrants.userId,
      groupId: permissionGrants.groupId,
      projectRoleId: permissionGrants.projectRoleId,
    })
    .from(permissionGrants)
    .where(eq(permissionGrants.permissionSchemeId, defaultScheme.id));
  if (defaultGrants.length === 0) {
    throw new Error("Le schéma de permissions par défaut ne contient aucun grant.");
  }
  await tx
    .insert(permissionGrants)
    .values(
      defaultGrants.map((grant) => ({
        scope: "backlog" as const,
        permissionSchemeId: privateScheme.id,
        permissionKey: grant.permissionKey,
        principalType: grant.principalType,
        userId: grant.userId,
        groupId: grant.groupId,
        projectRoleId: grant.projectRoleId,
      })),
    )
    .onConflictDoNothing();

  await tx
    .insert(backlogPermissionConfigs)
    .values({
      backlogId: input.backlogId,
      permissionSchemeId: privateScheme.id,
      accessMode: "simple",
    })
    .onConflictDoNothing();

  const administratorIds = [...new Set(input.administratorIds)];
  if (administratorIds.length > 0) {
    await tx
      .insert(backlogRoleActors)
      .values(
        administratorIds.map((userId) => ({
          backlogId: input.backlogId,
          projectRoleId: administratorRole.id,
          actorType: "user" as const,
          userId,
        })),
      )
      .onConflictDoNothing();
  }

  return privateScheme.id;
}

export async function seedAuthorizationDefaults(
  input: SeedAuthorizationDefaultsInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(userGroups)
      .values({
        key: PLATFORM_ADMINISTRATORS_GROUP_KEY,
        name: "Administrateurs de la plateforme",
        protected: true,
      })
      .onConflictDoUpdate({
        target: userGroups.key,
        set: { protected: true },
      });
    const [platformAdministratorsGroup] = await tx
      .select({ id: userGroups.id })
      .from(userGroups)
      .where(eq(userGroups.key, PLATFORM_ADMINISTRATORS_GROUP_KEY));
    if (!platformAdministratorsGroup) {
      throw new Error("Le groupe des administrateurs de la plateforme est introuvable.");
    }

    for (const role of PROTECTED_ROLES) {
      await tx
        .insert(projectRoles)
        .values({ ...role, protected: true })
        .onConflictDoUpdate({
          target: projectRoles.key,
          set: { protected: true },
        });
    }
    const storedRoles = await tx
      .select({ id: projectRoles.id, key: projectRoles.key })
      .from(projectRoles);
    const roleIds = new Map(storedRoles.map((role) => [role.key, role.id]));
    for (const role of PROTECTED_ROLES) {
      if (!roleIds.has(role.key)) throw new Error(`Le rôle protégé ${role.key} est introuvable.`);
    }

    await tx
      .insert(permissionSchemes)
      .values({
        key: DEFAULT_PERMISSION_SCHEME_KEY,
        name: "Schéma de permissions par défaut",
        description: "Configuration de référence pour les nouveaux backlogs.",
        protected: true,
      })
      .onConflictDoUpdate({
        target: permissionSchemes.key,
        set: { protected: true },
      });
    const [defaultScheme] = await tx
      .select({ id: permissionSchemes.id })
      .from(permissionSchemes)
      .where(eq(permissionSchemes.key, DEFAULT_PERMISSION_SCHEME_KEY));
    if (!defaultScheme) throw new Error("Le schéma de permissions par défaut est introuvable.");

    if (input.platformAdministratorIds.length > 0) {
      await tx
        .insert(groupMembers)
        .values(
          [...new Set(input.platformAdministratorIds)].map((userId) => ({
            groupId: platformAdministratorsGroup.id,
            userId,
          })),
        )
        .onConflictDoNothing();
    }

    await tx
      .insert(permissionGrants)
      .values(
        GLOBAL_PERMISSION_KEYS.map((permissionKey) => ({
          scope: "global" as const,
          permissionKey,
          principalType: "group" as const,
          groupId: platformAdministratorsGroup.id,
        })),
      )
      .onConflictDoNothing();

    const defaultRoleGrants = PROTECTED_ROLES.flatMap((role) =>
      PROTECTED_ROLE_PERMISSION_KEYS[role.key].map((permissionKey) => ({
        scope: "backlog" as const,
        permissionSchemeId: defaultScheme.id,
        permissionKey,
        principalType: "project_role" as const,
        projectRoleId: roleIds.get(role.key)!,
      })),
    );
    await tx.insert(permissionGrants).values(defaultRoleGrants).onConflictDoNothing();

    const backlogAdministrators = new Map<string, Set<string>>();
    for (const entry of input.backlogAdministrators) {
      const userIds = backlogAdministrators.get(entry.backlogId) ?? new Set<string>();
      for (const userId of entry.userIds) userIds.add(userId);
      backlogAdministrators.set(entry.backlogId, userIds);
    }

    for (const [backlogId, administratorIds] of backlogAdministrators) {
      await provisionBacklogAuthorization(tx, {
        backlogId,
        administratorIds: [...administratorIds],
      });
    }
  });
}

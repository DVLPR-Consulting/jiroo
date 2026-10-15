"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  appendPlatformAdministratorBypassEvent,
  PermissionDeniedError,
  requirePermissionWithoutBypassAudit as requirePermission,
  type AuthorizationDecision,
} from "@/lib/auth/authorization";
import { permissionDefinition } from "@/lib/auth/permissions";
import { requireBacklogReadPermissionById } from "@/lib/auth/action-authorization";
import { getSession } from "@/lib/auth/session";
import { invalidateBacklog } from "@/lib/realtime/publish";
import {
  addGlobalPermissionGrant,
  addGroupMember,
  addSchemeGrant,
  assignBacklogRoleActor,
  associatePermissionScheme,
  clonePermissionScheme,
  createGroup,
  createProjectRole,
  deleteGroup,
  deleteProjectRole,
  getPermissionHelperResult,
  groupMembershipRequiredPermission,
  moveBacklogRoleActor,
  readSecurityHistory,
  removeBacklogRoleActor,
  removeGlobalPermissionGrant,
  removeGroupMember,
  removeSchemeGrant,
  renameGroup,
  SchemeTopologyConfirmationRequiredError,
  setBacklogAccessMode,
  updateProjectRole,
} from "@/lib/services/authorization-admin";
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
} from "@/lib/validation/authorization";

type PermissionScope = { type: "global" } | { type: "backlog"; backlogId: string };

class SessionRequiredError extends Error {
  constructor() {
    super("Votre session a expiré. Reconnectez-vous.");
    this.name = "SessionRequiredError";
  }
}

const SAFE_INVARIANT_MESSAGES = new Set([
  "Ce schéma a été modifié. Rechargez la page.",
  "Le dernier administrateur de la plateforme ne peut pas être retiré.",
  "Le dernier administrateur effectif du backlog ne peut pas être retiré.",
  "Le mode Simple est indisponible : ce schéma est partagé.",
  "Le mode Simple est indisponible : ce schéma contient des autorisations avancées.",
  "Ce groupe est utilisé par une autorisation ou un rôle de backlog.",
  "Ce groupe protégé ne peut pas être supprimé.",
  "Ce rôle de projet est encore utilisé.",
  "Ce rôle protégé ne peut pas être supprimé.",
  "Utilisateur introuvable.",
  "Groupe introuvable.",
  "Rôle de projet introuvable.",
  "Schéma de permissions introuvable.",
  "Configuration d’accès introuvable.",
  "Autorisation introuvable.",
  "Cet utilisateur appartient déjà au groupe.",
  "Ce membre est introuvable dans le groupe.",
  "Cette affectation de rôle existe déjà.",
  "Cette affectation de rôle est introuvable.",
  "Seul un administrateur Jiroo peut modifier les membres de ce groupe.",
  "Le déplacement simplifié est réservé au mode Simple.",
  "Le déplacement simplifié exige deux rôles protégés.",
]);

async function authenticatedActorId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new SessionRequiredError();
  return session.user.id;
}

function permissionDeniedMessage(error: PermissionDeniedError): string {
  const label = permissionDefinition(error.decision.permission).label;
  return error.decision.scope.type === "backlog"
    ? `Vous n’avez pas la permission « ${label} » pour ce backlog.`
    : `Vous n’avez pas la permission « ${label} ».`;
}

function safeError(error: unknown): string {
  if (error instanceof PermissionDeniedError) return permissionDeniedMessage(error);
  if (error instanceof SessionRequiredError) return error.message;
  if (error instanceof ZodError) return "Les données saisies sont invalides.";
  if (error instanceof Error && SAFE_INVARIANT_MESSAGES.has(error.message)) return error.message;
  return "Action impossible. Réessayez.";
}

function usesPlatformAdministratorBypass(decision: AuthorizationDecision): boolean {
  return decision.reasons.some((reason) => reason.type === "platform_administrator");
}

async function authorizeMutation(input: {
  permission: string;
  scope: PermissionScope;
  targetType: string;
  targetId: string;
}, authenticatedId?: string): Promise<{ actorId: string; requestCorrelationId: string }> {
  const actorId = authenticatedId ?? await authenticatedActorId();
  const requestCorrelationId = randomUUID();
  const decision = await requirePermission({
    actorId,
    permission: input.permission,
    scope: input.scope,
  });
  if (usesPlatformAdministratorBypass(decision)) {
    await appendPlatformAdministratorBypassEvent({
      actorId,
      permission: input.permission,
      scope: input.scope,
      targetType: input.targetType,
      targetId: input.targetId,
      requestCorrelationId,
    });
  }
  return { actorId, requestCorrelationId };
}

async function authorizeBacklogMutation(input: {
  permission: string;
  backlogId: string;
  targetType: string;
  targetId: string;
}): Promise<{ actorId: string; requestCorrelationId: string }> {
  const actorId = await authenticatedActorId();
  await requireBacklogReadPermissionById({
    actorId,
    backlogId: input.backlogId,
    permission: "browse_backlog",
  });
  return authorizeMutation({
    permission: input.permission,
    scope: { type: "backlog", backlogId: input.backlogId },
    targetType: input.targetType,
    targetId: input.targetId,
  }, actorId);
}

async function authorizeAdditionalMutation(
  authorization: { actorId: string; requestCorrelationId: string },
  input: { permission: string; scope: PermissionScope; targetType: string; targetId: string },
): Promise<void> {
  const decision = await requirePermission({
    actorId: authorization.actorId,
    permission: input.permission,
    scope: input.scope,
  });
  if (usesPlatformAdministratorBypass(decision)) {
    await appendPlatformAdministratorBypassEvent({
      actorId: authorization.actorId,
      permission: input.permission,
      scope: input.scope,
      targetType: input.targetType,
      targetId: input.targetId,
      requestCorrelationId: authorization.requestCorrelationId,
    });
  }
}

async function authorizeRead(
  permission: string,
  scope: PermissionScope,
  authenticatedId?: string,
): Promise<string> {
  const actorId = authenticatedId ?? await authenticatedActorId();
  await requirePermission({ actorId, permission, scope });
  return actorId;
}

function revalidateAdmin(): void {
  revalidatePath("/admin");
}

async function revalidateAccess(
  backlogs: readonly { id: string; key: string }[],
  actorId: string,
): Promise<void> {
  revalidatePath("/admin");
  for (const backlog of new Map(backlogs.map((backlog) => [backlog.id, backlog])).values()) {
    await invalidateBacklog(backlog.key, {
      kind: "backlog",
      backlogId: backlog.id,
      actorId,
    });
  }
  revalidatePath("/");
  revalidatePath("/mine");
  revalidatePath("/trash");
}

export async function createGroupAction(input: unknown) {
  try {
    const parsed = groupCreateInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "manage_users_groups",
      scope: { type: "global" },
      targetType: "group",
      targetId: `new:${parsed.name}`,
    });
    const group = await createGroup(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    revalidateAdmin();
    return { ok: true as const, group };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function renameGroupAction(input: unknown) {
  try {
    const parsed = groupRenameInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "manage_users_groups",
      scope: { type: "global" },
      targetType: "group",
      targetId: parsed.groupId,
    });
    const group = await renameGroup(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    revalidateAdmin();
    return { ok: true as const, group };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function addGroupMemberAction(input: unknown) {
  try {
    const parsed = groupMembershipInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "manage_users_groups",
      scope: { type: "global" },
      targetType: "group_membership",
      targetId: `${parsed.groupId}:${parsed.userId}`,
    });
    if ((await groupMembershipRequiredPermission(parsed.groupId)) === "administer_jiroo") {
      await authorizeAdditionalMutation(authorization, {
        permission: "administer_jiroo",
        scope: { type: "global" },
        targetType: "group_membership",
        targetId: `${parsed.groupId}:${parsed.userId}`,
      });
    }
    const membership = await addGroupMember(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    await revalidateAccess(membership.affectedBacklogs, authorization.actorId);
    return { ok: true as const, membership };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function removeGroupMemberAction(input: unknown) {
  try {
    const parsed = groupMembershipInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "manage_users_groups",
      scope: { type: "global" },
      targetType: "group_membership",
      targetId: `${parsed.groupId}:${parsed.userId}`,
    });
    if ((await groupMembershipRequiredPermission(parsed.groupId)) === "administer_jiroo") {
      await authorizeAdditionalMutation(authorization, {
        permission: "administer_jiroo",
        scope: { type: "global" },
        targetType: "group_membership",
        targetId: `${parsed.groupId}:${parsed.userId}`,
      });
    }
    const membership = await removeGroupMember(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    await revalidateAccess(membership.affectedBacklogs, authorization.actorId);
    return { ok: true as const, membership };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function deleteGroupAction(input: unknown) {
  try {
    const parsed = groupDeleteInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "manage_users_groups",
      scope: { type: "global" },
      targetType: "group",
      targetId: parsed.groupId,
    });
    await deleteGroup(parsed, authorization.actorId, authorization.requestCorrelationId);
    revalidateAdmin();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function createProjectRoleAction(input: unknown) {
  try {
    const parsed = projectRoleCreateInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "manage_users_groups",
      scope: { type: "global" },
      targetType: "project_role",
      targetId: `new:${parsed.name}`,
    });
    const role = await createProjectRole(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    revalidateAdmin();
    return { ok: true as const, role };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function updateProjectRoleAction(input: unknown) {
  try {
    const parsed = projectRoleUpdateInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "manage_users_groups",
      scope: { type: "global" },
      targetType: "project_role",
      targetId: parsed.projectRoleId,
    });
    const role = await updateProjectRole(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    revalidateAdmin();
    return { ok: true as const, role };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function deleteProjectRoleAction(input: unknown) {
  try {
    const parsed = projectRoleDeleteInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "manage_users_groups",
      scope: { type: "global" },
      targetType: "project_role",
      targetId: parsed.projectRoleId,
    });
    await deleteProjectRole(parsed, authorization.actorId, authorization.requestCorrelationId);
    revalidateAdmin();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function assignBacklogRoleActorAction(input: unknown) {
  try {
    const parsed = backlogRoleActorInput.parse(input);
    const authorization = await authorizeBacklogMutation({
      permission: "manage_members",
      backlogId: parsed.backlogId,
      targetType: "backlog_role_actor",
      targetId: `${parsed.backlogId}:${parsed.projectRoleId}`,
    });
    const occupancy = await assignBacklogRoleActor(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    await revalidateAccess(
      [{ id: parsed.backlogId, key: occupancy.backlogKey }],
      authorization.actorId,
    );
    return { ok: true as const, occupancy };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function removeBacklogRoleActorAction(input: unknown) {
  try {
    const parsed = backlogRoleActorInput.parse(input);
    const authorization = await authorizeBacklogMutation({
      permission: "manage_members",
      backlogId: parsed.backlogId,
      targetType: "backlog_role_actor",
      targetId: `${parsed.backlogId}:${parsed.projectRoleId}`,
    });
    const occupancy = await removeBacklogRoleActor(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    await revalidateAccess(
      [{ id: parsed.backlogId, key: occupancy.backlogKey }],
      authorization.actorId,
    );
    return { ok: true as const, occupancy };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function moveBacklogRoleActorAction(input: unknown) {
  try {
    const parsed = moveBacklogRoleActorInput.parse(input);
    const authorization = await authorizeBacklogMutation({
      permission: "manage_members",
      backlogId: parsed.backlogId,
      targetType: "backlog_role_actor",
      targetId: `${parsed.backlogId}:${parsed.sourceProjectRoleId}:${parsed.targetProjectRoleId}`,
    });
    const occupancy = await moveBacklogRoleActor(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    await revalidateAccess(
      [{ id: parsed.backlogId, key: occupancy.backlogKey }],
      authorization.actorId,
    );
    return { ok: true as const, occupancy };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function clonePermissionSchemeAction(input: unknown) {
  try {
    const parsed = permissionSchemeCloneInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "administer_jiroo",
      scope: { type: "global" },
      targetType: "permission_scheme",
      targetId: parsed.sourceSchemeId,
    });
    const scheme = await clonePermissionScheme(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    revalidateAdmin();
    return { ok: true as const, scheme };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function addSchemeGrantAction(input: unknown) {
  try {
    const parsed = grantInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "administer_jiroo",
      scope: { type: "global" },
      targetType: "permission_scheme",
      targetId: parsed.schemeId,
    });
    const grant = await addSchemeGrant(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    await revalidateAccess(grant.affectedBacklogs, authorization.actorId);
    return { ok: true as const, grant };
  } catch (error) {
    if (error instanceof SchemeTopologyConfirmationRequiredError) {
      return {
        ok: false as const,
        confirmationRequired: true as const,
        affectedBacklogs: error.affectedBacklogs,
      };
    }
    return { ok: false as const, error: safeError(error) };
  }
}

export async function removeSchemeGrantAction(input: unknown) {
  try {
    const parsed = schemeGrantRemovalInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "administer_jiroo",
      scope: { type: "global" },
      targetType: "permission_scheme",
      targetId: parsed.schemeId,
    });
    const grant = await removeSchemeGrant(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    await revalidateAccess(grant.affectedBacklogs, authorization.actorId);
    return { ok: true as const, grant };
  } catch (error) {
    if (error instanceof SchemeTopologyConfirmationRequiredError) {
      return {
        ok: false as const,
        confirmationRequired: true as const,
        affectedBacklogs: error.affectedBacklogs,
      };
    }
    return { ok: false as const, error: safeError(error) };
  }
}

export async function addGlobalPermissionGrantAction(input: unknown) {
  try {
    const parsed = globalGrantInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "administer_jiroo",
      scope: { type: "global" },
      targetType: "global_permission_grant",
      targetId: `${parsed.permission}:${parsed.principal.type}`,
    });
    const grant = await addGlobalPermissionGrant(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    await revalidateAccess(grant.affectedBacklogs, authorization.actorId);
    return { ok: true as const, grant };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function removeGlobalPermissionGrantAction(input: unknown) {
  try {
    const parsed = globalGrantRemovalInput.parse(input);
    const authorization = await authorizeMutation({
      permission: "administer_jiroo",
      scope: { type: "global" },
      targetType: "global_permission_grant",
      targetId: parsed.grantId,
    });
    const grant = await removeGlobalPermissionGrant(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    await revalidateAccess(grant.affectedBacklogs, authorization.actorId);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function associatePermissionSchemeAction(input: unknown) {
  try {
    const parsed = schemeAssociationInput.parse(input);
    const authorization = await authorizeBacklogMutation({
      permission: "administer_backlog",
      backlogId: parsed.backlogId,
      targetType: "backlog_permission_config",
      targetId: parsed.backlogId,
    });
    const association = await associatePermissionScheme(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    await revalidateAccess(
      [{ id: parsed.backlogId, key: association.backlogKey }],
      authorization.actorId,
    );
    return { ok: true as const, association };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function setBacklogAccessModeAction(input: unknown) {
  try {
    const parsed = accessModeInput.parse(input);
    const authorization = await authorizeBacklogMutation({
      permission: "administer_backlog",
      backlogId: parsed.backlogId,
      targetType: "backlog_permission_config",
      targetId: parsed.backlogId,
    });
    const access = await setBacklogAccessMode(
      parsed,
      authorization.actorId,
      authorization.requestCorrelationId,
    );
    await revalidateAccess(
      [{ id: parsed.backlogId, key: access.backlogKey }],
      authorization.actorId,
    );
    return { ok: true as const, access };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function permissionHelperAction(input: unknown) {
  try {
    const parsed = permissionHelperInput.parse(input);
    const actorId = await authenticatedActorId();
    await requireBacklogReadPermissionById({
      actorId,
      backlogId: parsed.backlogId,
      permission: "browse_backlog",
    });
    try {
      await requirePermission({
        actorId,
        permission: "administer_backlog",
        scope: { type: "backlog", backlogId: parsed.backlogId },
      });
    } catch (error) {
      if (!(error instanceof PermissionDeniedError)) throw error;
      await requirePermission({
        actorId,
        permission: "administer_jiroo",
        scope: { type: "global" },
      });
    }
    await requirePermission({
      actorId,
      permission: "browse_users",
      scope: { type: "global" },
    });
    const result = await getPermissionHelperResult(parsed);
    return { ok: true as const, result };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

export async function readSecurityHistoryAction(input: unknown) {
  try {
    const parsed = securityHistoryInput.parse(input);
    if (parsed.backlogId) {
      const actorId = await authenticatedActorId();
      await requireBacklogReadPermissionById({
        actorId,
        backlogId: parsed.backlogId,
        permission: "browse_backlog",
      });
      try {
        await authorizeRead("administer_backlog", {
          type: "backlog",
          backlogId: parsed.backlogId,
        }, actorId);
      } catch (error) {
        if (!(error instanceof PermissionDeniedError)) throw error;
        await authorizeRead("administer_jiroo", { type: "global" }, actorId);
      }
    } else {
      await authorizeRead("administer_jiroo", { type: "global" });
    }
    const history = await readSecurityHistory(parsed);
    return { ok: true as const, history };
  } catch (error) {
    return { ok: false as const, error: safeError(error) };
  }
}

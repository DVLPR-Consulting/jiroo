import { z } from "zod";
import {
  BACKLOG_PERMISSION_KEYS,
  GLOBAL_PERMISSION_KEYS,
} from "@/lib/auth/permissions";

const uuid = z.uuid();
const userId = z.string().trim().min(1);
const administrationName = z.string().trim().min(1).max(80);
const description = z.string().trim().max(500).nullable().optional();
const expectedVersion = z.number().int().positive();
const expectedAffectedBacklogIds = z.array(uuid).superRefine((ids, context) => {
  const canonicalIds = [...new Set(ids)].sort();
  if (canonicalIds.length !== ids.length || canonicalIds.some((id, index) => id !== ids[index])) {
    context.addIssue({
      code: "custom",
      message: "Le snapshot des backlogs affectés doit être trié et sans doublon.",
    });
  }
});

const backlogPermission = z.enum(BACKLOG_PERMISSION_KEYS);
const globalPermission = z.enum(GLOBAL_PERMISSION_KEYS);

const userPrincipal = z
  .object({ type: z.literal("user"), userId })
  .strict();
const groupPrincipal = z
  .object({ type: z.literal("group"), groupId: uuid })
  .strict();
const projectRolePrincipal = z
  .object({ type: z.literal("project_role"), projectRoleId: uuid })
  .strict();
const authenticatedUserPrincipal = z
  .object({ type: z.literal("authenticated_user") })
  .strict();

export const schemeGrantPrincipalInput = z.discriminatedUnion("type", [
  userPrincipal,
  groupPrincipal,
  projectRolePrincipal,
  authenticatedUserPrincipal,
]);

export const globalGrantPrincipalInput = z.discriminatedUnion("type", [
  userPrincipal,
  groupPrincipal,
]);

export const backlogRolePrincipalInput = z.discriminatedUnion("type", [
  userPrincipal,
  groupPrincipal,
]);

export const groupCreateInput = z.object({ name: administrationName }).strict();
export const groupRenameInput = z
  .object({ groupId: uuid, name: administrationName })
  .strict();
export const groupMembershipInput = z.object({ groupId: uuid, userId }).strict();
export const groupDeleteInput = z.object({ groupId: uuid }).strict();

export const projectRoleCreateInput = z
  .object({ name: administrationName, description })
  .strict();
export const projectRoleUpdateInput = z
  .object({ projectRoleId: uuid, name: administrationName, description })
  .strict();
export const projectRoleDeleteInput = z.object({ projectRoleId: uuid }).strict();

export const backlogRoleActorInput = z
  .object({
    backlogId: uuid,
    projectRoleId: uuid,
    principal: backlogRolePrincipalInput,
  })
  .strict();

export const moveBacklogRoleActorInput = z
  .object({
    backlogId: uuid,
    sourceProjectRoleId: uuid,
    targetProjectRoleId: uuid,
    principal: backlogRolePrincipalInput,
  })
  .strict()
  .refine((input) => input.sourceProjectRoleId !== input.targetProjectRoleId, {
    message: "Les rôles source et cible doivent être différents.",
    path: ["targetProjectRoleId"],
  });

export const permissionSchemeCloneInput = z
  .object({ sourceSchemeId: uuid, name: administrationName, description })
  .strict();

export const grantInput = z
  .object({
    schemeId: uuid,
    permission: backlogPermission,
    principal: schemeGrantPrincipalInput,
    expectedVersion,
    expectedAffectedBacklogIds,
  })
  .strict();

export const schemeGrantRemovalInput = z
  .object({ schemeId: uuid, grantId: uuid, expectedVersion, expectedAffectedBacklogIds })
  .strict();

export const globalGrantInput = z
  .object({ permission: globalPermission, principal: globalGrantPrincipalInput })
  .strict();

export const globalGrantRemovalInput = z.object({ grantId: uuid }).strict();

export const schemeAssociationInput = z
  .object({ backlogId: uuid, schemeId: uuid })
  .strict();

export const accessModeInput = z
  .object({ backlogId: uuid, mode: z.enum(["simple", "advanced"]) })
  .strict();

export const securityHistoryInput = z
  .object({ backlogId: uuid.optional(), limit: z.number().int().min(1).max(200).default(50) })
  .strict();

export const permissionHelperInput = z
  .object({ backlogId: uuid, userId, permission: backlogPermission })
  .strict();

export type SchemeGrantPrincipalInput = z.infer<typeof schemeGrantPrincipalInput>;
export type GlobalGrantPrincipalInput = z.infer<typeof globalGrantPrincipalInput>;
export type BacklogRolePrincipalInput = z.infer<typeof backlogRolePrincipalInput>;
export type GroupCreateInput = z.infer<typeof groupCreateInput>;
export type GroupRenameInput = z.infer<typeof groupRenameInput>;
export type GroupMembershipInput = z.infer<typeof groupMembershipInput>;
export type GroupDeleteInput = z.infer<typeof groupDeleteInput>;
export type ProjectRoleCreateInput = z.infer<typeof projectRoleCreateInput>;
export type ProjectRoleUpdateInput = z.infer<typeof projectRoleUpdateInput>;
export type ProjectRoleDeleteInput = z.infer<typeof projectRoleDeleteInput>;
export type BacklogRoleActorInput = z.infer<typeof backlogRoleActorInput>;
export type MoveBacklogRoleActorInput = z.infer<typeof moveBacklogRoleActorInput>;
export type PermissionSchemeCloneInput = z.infer<typeof permissionSchemeCloneInput>;
export type GrantInput = z.infer<typeof grantInput>;
export type SchemeGrantRemovalInput = z.infer<typeof schemeGrantRemovalInput>;
export type GlobalGrantInput = z.infer<typeof globalGrantInput>;
export type GlobalGrantRemovalInput = z.infer<typeof globalGrantRemovalInput>;
export type SchemeAssociationInput = z.infer<typeof schemeAssociationInput>;
export type AccessModeInput = z.infer<typeof accessModeInput>;
export type SecurityHistoryInput = z.input<typeof securityHistoryInput>;
export type PermissionHelperInput = z.infer<typeof permissionHelperInput>;

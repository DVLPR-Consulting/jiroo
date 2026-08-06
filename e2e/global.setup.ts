import "dotenv/config";

import { createHmac } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { request, type FullConfig } from "@playwright/test";
import { asc, eq, sql } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { twoFactor, user } from "../lib/db/schema/auth";
import {
  backlogPermissionConfigs,
  backlogs,
  items,
  permissionSchemes,
  projectRoles,
  statuses,
} from "../lib/db/schema/domain";
import { STATUS_CATEGORY } from "../lib/design/constants";
import {
  addGroupMember,
  addSchemeGrant,
  assignBacklogRoleActor,
  associatePermissionScheme,
  clonePermissionScheme,
  createGroup,
  createProjectRole,
  setBacklogAccessMode,
} from "../lib/services/authorization-admin";
import {
  MEMBERS_ROLE_KEY,
  seedAuthorizationDefaults,
  VIEWERS_ROLE_KEY,
} from "../lib/services/authorization-seed";
import { buildPath, childDepth } from "../lib/tree/path";
import { rankLast } from "../lib/tree/rank";

const PASSWORD = process.env.JIROO_PLAYWRIGHT_PASSWORD ?? "Audit-Local-2026!";

const ACCOUNTS = [
  { key: "admin", email: "platform-admin@jiroo.local", name: "Administrateur E2E", role: "admin" as const, path: ".playwright/.auth/platform-admin.json" },
  { key: "member", email: "member@jiroo.local", name: "Membre E2E", role: "contributor" as const, path: ".playwright/.auth/member.json" },
  { key: "specialist", email: "specialist@jiroo.local", name: "Spécialiste E2E", role: "contributor" as const, path: ".playwright/.auth/specialist.json" },
  { key: "reader", email: "reader@jiroo.local", name: "Lecteur E2E", role: "viewer" as const, path: ".playwright/.auth/reader.json" },
  { key: "noAccess", email: "no-access@jiroo.local", name: "Sans accès E2E", role: "contributor" as const, path: ".playwright/.auth/no-access.json" },
] as const;

type AccountKey = (typeof ACCOUNTS)[number]["key"];

function generateTotp(secret: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = secret.toUpperCase().replace(/=+$/u, "");
  let bits = "";
  for (const character of normalized) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("Secret TOTP Base32 invalide.");
    bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(
    Array.from({ length: Math.floor(bits.length / 8) }, (_, index) =>
      Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2),
    ),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24)
    | ((digest[offset + 1]! & 0xff) << 16)
    | ((digest[offset + 2]! & 0xff) << 8)
    | (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function resetBrowserDatabase() {
  await db.execute(sql.raw(`
    TRUNCATE TABLE
      "security_audit_events",
      "backlogs",
      "permission_grants",
      "group_members",
      "backlog_role_actors",
      "backlog_permission_configs",
      "user_groups",
      "project_roles",
      "permission_schemes",
      "user"
    RESTART IDENTITY CASCADE
  `));
}

async function createStorageState({
  baseURL,
  email,
  name,
  role,
  path,
}: {
  baseURL: string;
  email: string;
  name: string;
  role: "admin" | "contributor" | "viewer";
  path: string;
}) {
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
  await db.update(user).set({ role }).where(eq(user.email, email));

  const authRequest = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const signIn = await authRequest.post("/api/auth/sign-in/email", {
    data: { email, password: PASSWORD },
  });
  if (!signIn.ok()) throw new Error(`Connexion Playwright impossible pour ${email} (${signIn.status()}).`);

  const enrollment = await authRequest.post("/api/auth/two-factor/enable", {
    data: { password: PASSWORD },
  });
  if (!enrollment.ok()) {
    throw new Error(
      `Enrôlement 2FA impossible pour ${email} (${enrollment.status()}): ${await enrollment.text()}`,
    );
  }
  const enrollmentBody = await enrollment.json() as { totpURI?: string };
  const secret = enrollmentBody.totpURI
    ? new URL(enrollmentBody.totpURI).searchParams.get("secret")
    : null;
  if (!secret) throw new Error(`Secret TOTP manquant pour ${email}.`);
  const verification = await authRequest.post("/api/auth/two-factor/verify-totp", {
    data: { code: generateTotp(secret), trustDevice: true },
  });
  if (!verification.ok()) {
    throw new Error(
      `Validation TOTP impossible pour ${email} (${verification.status()}): ${await verification.text()}`,
    );
  }

  const [enrolledUser] = await db.select({ id: user.id, enabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.email, email));
  const [enrolledFactor] = enrolledUser
    ? await db.select({ verified: twoFactor.verified }).from(twoFactor).where(eq(twoFactor.userId, enrolledUser.id))
    : [];
  if (!enrolledUser?.enabled || enrolledFactor?.verified !== true) {
    throw new Error(`Enrôlement 2FA incomplet pour ${email}.`);
  }

  await authRequest.storageState({ path });
  await authRequest.dispose();
  return enrolledUser.id;
}

async function createBacklogFixture({
  key,
  name,
  reporterId,
  titles,
}: {
  key: "CASS" | "LABS";
  name: string;
  reporterId: string;
  titles: string[];
}) {
  const [backlog] = await db.insert(backlogs).values({ key, name, color: key === "CASS" ? "#7c3030" : "#2563eb" }).returning({ id: backlogs.id });
  if (!backlog) throw new Error(`Backlog ${key} non créé.`);
  const insertedStatuses = await db.insert(statuses).values([
    { backlogId: backlog.id, name: "À faire", category: STATUS_CATEGORY.todo, order: 0, color: "#9aa0a6" },
    { backlogId: backlog.id, name: "En cours", category: STATUS_CATEGORY.doing, order: 1, color: "#d99a2b" },
    { backlogId: backlog.id, name: "En revue", category: STATUS_CATEGORY.review, order: 2, color: "#8b5cf6" },
    { backlogId: backlog.id, name: "Terminé", category: STATUS_CATEGORY.done, order: 3, color: "#3aa675" },
  ]).returning({ id: statuses.id, order: statuses.order });
  const todoId = insertedStatuses.find((status) => status.order === 0)?.id;
  if (!todoId) throw new Error(`Statut À faire ${key} non créé.`);

  let previousRank: string | null = null;
  const itemIds = titles.map(() => crypto.randomUUID());
  for (const [index, title] of titles.entries()) {
    const id = itemIds[index]!;
    const rank = rankLast(previousRank);
    previousRank = rank;
    const isCass = key === "CASS";
    const type = isCass && index === 0 ? "composant" : isCass && index === 1 ? "epic" : "tache";
    const parentId = isCass && index === 1 ? itemIds[0]! : isCass && index > 1 ? itemIds[1]! : null;
    const parentPath = parentId === itemIds[0]
      ? buildPath(null, itemIds[0]!)
      : parentId === itemIds[1]
        ? buildPath(buildPath(null, itemIds[0]!), itemIds[1]!)
        : null;
    await db.insert(items).values({
      id,
      key: `${key}-${9001 + index}`,
      type,
      backlogId: backlog.id,
      title,
      parentId,
      statusId: todoId,
      reporterId,
      rank,
      path: buildPath(parentPath, id),
      depth: childDepth(parentPath ? (index === 1 ? 0 : 1) : null),
      estimatePoints: index + 1,
    });
  }
  return backlog.id;
}

async function seedPermissionFixtures(accountIds: Record<AccountKey, string>, cassId: string, labsId: string) {
  await seedAuthorizationDefaults({
    platformAdministratorIds: [accountIds.admin],
    backlogAdministrators: [
      { backlogId: cassId, userIds: [accountIds.admin] },
      { backlogId: labsId, userIds: [accountIds.admin] },
    ],
  });

  const protectedRoles = await db.select({ id: projectRoles.id, key: projectRoles.key })
    .from(projectRoles)
    .orderBy(asc(projectRoles.key));
  const roleId = (key: string) => {
    const role = protectedRoles.find((candidate) => candidate.key === key);
    if (!role) throw new Error(`Rôle ${key} introuvable.`);
    return role.id;
  };
  await assignBacklogRoleActor({ backlogId: cassId, projectRoleId: roleId(MEMBERS_ROLE_KEY), principal: { type: "user", userId: accountIds.member } }, accountIds.admin, "e2e-seed-member");
  await assignBacklogRoleActor({ backlogId: cassId, projectRoleId: roleId(VIEWERS_ROLE_KEY), principal: { type: "user", userId: accountIds.reader } }, accountIds.admin, "e2e-seed-reader");

  const group = await createGroup({ name: "Équipe delivery" }, accountIds.admin, "e2e-seed-group");
  await addGroupMember({ groupId: group.id, userId: accountIds.member }, accountIds.admin, "e2e-seed-group-member");
  const specialistRole = await createProjectRole({ name: "Spécialiste delivery", description: "Sprints et futures releases, sans édition d’item." }, accountIds.admin, "e2e-seed-role");

  const [cassConfig] = await db.select({ schemeId: backlogPermissionConfigs.permissionSchemeId }).from(backlogPermissionConfigs).where(eq(backlogPermissionConfigs.backlogId, cassId));
  if (!cassConfig) throw new Error("Configuration CASS introuvable.");
  const shared = await clonePermissionScheme({ sourceSchemeId: cassConfig.schemeId, name: "Schéma partagé E2E", description: "Fixture multi-backlogs Playwright." }, accountIds.admin, "e2e-seed-clone");
  await db.update(permissionSchemes).set({ key: "e2e-shared-permission-scheme" }).where(eq(permissionSchemes.id, shared.id));
  await setBacklogAccessMode({ backlogId: cassId, mode: "advanced" }, accountIds.admin, "e2e-seed-cass-advanced");
  await setBacklogAccessMode({ backlogId: labsId, mode: "advanced" }, accountIds.admin, "e2e-seed-labs-advanced");
  await associatePermissionScheme({ backlogId: cassId, schemeId: shared.id }, accountIds.admin, "e2e-seed-cass-scheme");
  await associatePermissionScheme({ backlogId: labsId, schemeId: shared.id }, accountIds.admin, "e2e-seed-labs-scheme");

  await assignBacklogRoleActor({ backlogId: cassId, projectRoleId: specialistRole.id, principal: { type: "group", groupId: group.id } }, accountIds.admin, "e2e-seed-group-role");
  await assignBacklogRoleActor({ backlogId: cassId, projectRoleId: specialistRole.id, principal: { type: "user", userId: accountIds.specialist } }, accountIds.admin, "e2e-seed-specialist-role");

  const affectedBacklogIds = [cassId, labsId].sort();
  const grants = [
    { permission: "browse_backlog" as const, principal: { type: "project_role" as const, projectRoleId: specialistRole.id } },
    { permission: "manage_sprints" as const, principal: { type: "project_role" as const, projectRoleId: specialistRole.id } },
    { permission: "manage_releases" as const, principal: { type: "project_role" as const, projectRoleId: specialistRole.id } },
    { permission: "manage_shared_views" as const, principal: { type: "user" as const, userId: accountIds.member } },
    { permission: "delete_items" as const, principal: { type: "group" as const, groupId: group.id } },
  ];
  let version = shared.version;
  for (const grant of grants) {
    const result = await addSchemeGrant({ schemeId: shared.id, ...grant, expectedVersion: version, expectedAffectedBacklogIds: affectedBacklogIds }, accountIds.admin, `e2e-seed-grant-${grant.permission}`);
    version = result.version;
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL manquante.");
  await mkdir(".playwright/.auth", { recursive: true });
  await resetBrowserDatabase();

  const accountIds = {} as Record<AccountKey, string>;
  for (const account of ACCOUNTS) {
    accountIds[account.key] = await createStorageState({ baseURL, ...account });
  }
  const cassId = await createBacklogFixture({
    key: "CASS",
    name: "Cour de cassation",
    reporterId: accountIds.admin,
    titles: ["Authentification", "2FA TOTP", "Écran de vérification", "Permissions de sprint", "Audit de sécurité"],
  });
  const labsId = await createBacklogFixture({
    key: "LABS",
    name: "Laboratoire isolé",
    reporterId: accountIds.admin,
    titles: ["Prototype isolé"],
  });
  await seedPermissionFixtures(accountIds, cassId, labsId);
}

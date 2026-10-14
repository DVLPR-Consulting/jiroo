import { randomInt, randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogPermissionConfigs,
  backlogs,
  items,
  permissionGrants,
  permissionSchemes,
  securityAuditEvents,
  statuses,
} from "@/lib/db/schema/domain";

/**
 * Two backlogs for the repository connection tests (JIR-95): an
 * administrator and a browse-only reader of backlog A, an outsider, live and
 * deleted items in A, and one item in B whose key A's webhooks must ignore.
 */
export type RepoConnectionFixture = Awaited<ReturnType<typeof createRepoConnectionFixture>>;

function letters(count: number): string {
  return Array.from({ length: count }, () => String.fromCharCode(65 + randomInt(26))).join("");
}

export async function createRepoConnectionFixture(label: string) {
  const fixtureId = randomUUID();
  const admin = `repo-admin-${fixtureId}`;
  const reader = `repo-reader-${fixtureId}`;
  const outsider = `repo-outsider-${fixtureId}`;
  await db.insert(user).values([admin, reader, outsider].map((id) => ({
    id,
    name: `${label} ${id.split("-")[1]}`,
    email: `${id}@example.test`,
    emailVerified: true,
    role: "contributor",
  })));

  const [backlogA, backlogB] = await db
    .insert(backlogs)
    .values([
      { key: `R${letters(5)}`, name: `${label} A` },
      { key: `S${letters(5)}`, name: `${label} B` },
    ])
    .returning();
  const [scheme] = await db
    .insert(permissionSchemes)
    .values({ key: `repo-${fixtureId}`, name: `${label} schéma` })
    .returning();
  await db.insert(backlogPermissionConfigs).values({
    backlogId: backlogA!.id,
    permissionSchemeId: scheme!.id,
  });
  await db.insert(permissionGrants).values([
    { permissionKey: "browse_backlog", userId: admin },
    { permissionKey: "administer_backlog", userId: admin },
    { permissionKey: "browse_backlog", userId: reader },
  ].map((grant) => ({
    scope: "backlog" as const,
    permissionSchemeId: scheme!.id,
    principalType: "user" as const,
    ...grant,
  })));

  const [statusA, statusB] = await db
    .insert(statuses)
    .values([
      { backlogId: backlogA!.id, name: "À faire", category: "todo", order: 0, color: "#9aa0a6" },
      { backlogId: backlogB!.id, name: "À faire", category: "todo", order: 0, color: "#9aa0a6" },
    ])
    .returning();

  const base = randomInt(100_000, 900_000);
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const row = (index: number, backlog: typeof backlogA, status: typeof statusA, number: number, deleted = false) => ({
    id: ids[index]!,
    key: `${backlog!.key}-${number}`,
    type: "tache" as const,
    backlogId: backlog!.id,
    title: `${label} ${index}`,
    statusId: status!.id,
    reporterId: admin,
    rank: `a${index}`,
    path: `root.${ids[index]!.replaceAll("-", "")}`,
    deletedAt: deleted ? new Date() : null,
  });
  const [first, second, deleted, foreign] = await db
    .insert(items)
    .values([
      row(0, backlogA, statusA, base),
      row(1, backlogA, statusA, base + 1),
      row(2, backlogA, statusA, base + 2, true),
      row(3, backlogB, statusB, base),
    ])
    .returning({ id: items.id, key: items.key });

  return {
    users: { admin, reader, outsider },
    backlogA: backlogA!,
    backlogB: backlogB!,
    schemeId: scheme!.id,
    items: { first: first!, second: second!, deleted: deleted!, foreign: foreign! },
  };
}

export async function deleteRepoConnectionFixture(fixture: RepoConnectionFixture) {
  const userIds = Object.values(fixture.users);
  await db.delete(securityAuditEvents).where(inArray(securityAuditEvents.actorId, userIds));
  await db.delete(backlogs).where(inArray(backlogs.id, [fixture.backlogA.id, fixture.backlogB.id]));
  await db.delete(permissionSchemes).where(inArray(permissionSchemes.id, [fixture.schemeId]));
  await db.delete(user).where(inArray(user.id, userIds));
}

/** BETTER_AUTH_SECRET is set in real environments; tests provide their own. */
export function ensureTestSecretKey() {
  process.env.BETTER_AUTH_SECRET ??= "integration-test-only-secret-key-material-0123456789";
}

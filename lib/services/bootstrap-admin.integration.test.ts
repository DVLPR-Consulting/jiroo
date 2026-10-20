import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { account, user } from "@/lib/db/schema/auth";
import { groupMembers, permissionGrants, userGroups } from "@/lib/db/schema/domain";
import { PLATFORM_ADMINISTRATORS_GROUP_KEY } from "@/lib/services/authorization-seed";

vi.mock("server-only", () => ({}));

// The shared test database already has administrators: count only the
// accounts this suite creates, read from the database like the real rule.
const administrators = vi.hoisted(() => ({ extra: new Set<string>() }));
vi.mock("@/lib/services/authorization-admin", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { user: users } = await import("@/lib/db/schema/auth");
  return {
    platformAdministratorIds: async (tx: typeof import("@/lib/db").db) => {
      const rows = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "admin"), inArray(users.email, [...emailsRef.current])));
      return new Set([...rows.map((row) => row.id), ...administrators.extra]);
    },
  };
});
const emailsRef = vi.hoisted(() => ({ current: [] as string[] }));

const { bootstrapAdministrator, BootstrapAdminError } = await import("@/lib/services/bootstrap-admin");

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const run = randomUUID().slice(0, 8);
const emails = [
  `bootstrap-${run}@example.test`,
  `bootstrap-other-${run}@example.test`,
  `bootstrap-race-a-${run}@example.test`,
  `bootstrap-race-b-${run}@example.test`,
];
emailsRef.current = emails;
const PASSWORD = "Bootstrap-pass-1";

describeDb("bootstrapAdministrator (JIR-115)", () => {
  beforeEach(() => administrators.extra.clear());

  afterAll(async () => {
    await db.delete(user).where(inArray(user.email, emails));
  });

  it("creates the first administrator with the authorization defaults", async () => {
    const result = await bootstrapAdministrator({ email: emails[0]!, name: "Premier", password: PASSWORD });
    expect(result.outcome).toBe("created");
    const [created] = await db.select({ role: user.role }).from(user).where(eq(user.id, result.userId));
    expect(created?.role).toBe("admin");
    const [membership] = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .innerJoin(userGroups, eq(userGroups.id, groupMembers.groupId))
      .where(and(eq(userGroups.key, PLATFORM_ADMINISTRATORS_GROUP_KEY), eq(groupMembers.userId, result.userId)));
    expect(membership).toBeDefined();
  });

  it("does nothing more for the same administrator, and keeps the password", async () => {
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, emails[0]!));
    const [before] = await db.select({ password: account.password }).from(account).where(eq(account.userId, existing!.id));
    const result = await bootstrapAdministrator({ email: emails[0]!, name: "Premier", password: "Another-pass-2" });
    expect(result).toEqual({ outcome: "already-administrator", userId: existing!.id });
    const [after] = await db.select({ password: account.password }).from(account).where(eq(account.userId, existing!.id));
    expect(after?.password).toBe(before?.password);
  });

  it("refuses a second administrator", async () => {
    await expect(
      bootstrapAdministrator({ email: emails[1]!, name: "Second", password: PASSWORD }),
    ).rejects.toThrow(/existe déjà/);
    expect(await db.select().from(user).where(eq(user.email, emails[1]!))).toEqual([]);
  });

  it("never promotes an existing account", async () => {
    await db.update(user).set({ role: "contributor" }).where(eq(user.email, emails[0]!));
    try {
      await expect(
        bootstrapAdministrator({ email: emails[0]!, name: "Premier", password: PASSWORD }),
      ).rejects.toThrow(/ne modifie pas un compte existant/);
      const [account_] = await db.select({ role: user.role }).from(user).where(eq(user.email, emails[0]!));
      expect(account_?.role).toBe("contributor");
    } finally {
      await db.update(user).set({ role: "admin" }).where(eq(user.email, emails[0]!));
    }
  });

  it("keeps a policy edited since, when run again for the administrator", async () => {
    const [grant] = await db.select().from(permissionGrants).where(eq(permissionGrants.scope, "backlog")).limit(1);
    expect(grant).toBeDefined();
    await db.delete(permissionGrants).where(eq(permissionGrants.id, grant!.id));
    try {
      const result = await bootstrapAdministrator({ email: emails[0]!, name: "Premier", password: PASSWORD });
      expect(result.outcome).toBe("already-administrator");
      expect(await db.select().from(permissionGrants).where(eq(permissionGrants.id, grant!.id))).toEqual([]);
    } finally {
      await db.insert(permissionGrants).values(grant!).onConflictDoNothing();
    }
  });

  it("creates a single administrator when two runs race", async () => {
    // No administrator yet among this suite's accounts.
    await db.delete(user).where(inArray(user.email, [emails[0]!]));
    const results = await Promise.allSettled([
      bootstrapAdministrator({ email: emails[2]!, name: "Course A", password: PASSWORD }),
      bootstrapAdministrator({ email: emails[3]!, name: "Course B", password: PASSWORD }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ message: expect.stringMatching(/existe déjà/) }),
    });
    const admins = await db.select().from(user).where(and(eq(user.role, "admin"), inArray(user.email, emails)));
    expect(admins).toHaveLength(1);
  });

  it("validates the input before touching the database", async () => {
    await expect(
      bootstrapAdministrator({ email: "pas-un-email", name: "X", password: PASSWORD }),
    ).rejects.toBeInstanceOf(BootstrapAdminError);
    await expect(
      bootstrapAdministrator({ email: emails[1]!, name: "X", password: "court" }),
    ).rejects.toThrow(/8 caractères/);
  });
});

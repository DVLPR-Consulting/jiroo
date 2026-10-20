import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { account, user } from "@/lib/db/schema/auth";
import { groupMembers, userGroups } from "@/lib/db/schema/domain";
import { PLATFORM_ADMINISTRATORS_GROUP_KEY } from "@/lib/services/authorization-seed";

vi.mock("server-only", () => ({}));

// The installation's administrators, controlled per test: the shared test
// database already has some.
const administrators = vi.hoisted(() => ({ ids: new Set<string>() }));
vi.mock("@/lib/services/authorization-admin", () => ({
  platformAdministratorIds: async () => administrators.ids,
}));

const { bootstrapAdministrator, BootstrapAdminError } = await import("@/lib/services/bootstrap-admin");

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const run = randomUUID().slice(0, 8);
const emails = [`bootstrap-${run}@example.test`, `bootstrap-other-${run}@example.test`];
const PASSWORD = "Bootstrap-pass-1";

describeDb("bootstrapAdministrator (JIR-115)", () => {
  beforeEach(() => administrators.ids.clear());

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
    administrators.ids.add(existing!.id);
    const [before] = await db.select({ password: account.password }).from(account).where(eq(account.userId, existing!.id));
    const result = await bootstrapAdministrator({ email: emails[0]!, name: "Premier", password: "Another-pass-2" });
    expect(result).toEqual({ outcome: "already-administrator", userId: existing!.id });
    const [after] = await db.select({ password: account.password }).from(account).where(eq(account.userId, existing!.id));
    expect(after?.password).toBe(before?.password);
  });

  it("refuses a second administrator", async () => {
    administrators.ids.add("someone-else");
    await expect(
      bootstrapAdministrator({ email: emails[1]!, name: "Second", password: PASSWORD }),
    ).rejects.toThrow(/existe déjà/);
    expect(await db.select().from(user).where(eq(user.email, emails[1]!))).toEqual([]);
  });

  it("never promotes an existing account", async () => {
    // emails[0] exists, but is not counted as an administrator here.
    await expect(
      bootstrapAdministrator({ email: emails[0]!, name: "Premier", password: PASSWORD }),
    ).rejects.toThrow(/ne modifie pas un compte existant/);
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

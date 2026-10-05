import "dotenv/config";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { databasePool, db } from "@/lib/db";
import { user, verification } from "@/lib/db/schema/auth";
import { securityAuditEvents } from "@/lib/db/schema/domain";
import {
  changeOwnPasswordWithBudget,
  PASSWORD_CHANGE_FAILURE_LIMIT,
  PASSWORD_CHANGE_FAILURE_WINDOW_MS,
} from "@/lib/services/password-change";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const fixtureId = randomUUID();
const userIds: string[] = [];

async function newUser(label: string): Promise<string> {
  const id = `password-change-${label}-${fixtureId}`;
  await db.insert(user).values({
    id,
    name: `Changement ${label}`,
    email: `${id}@example.test`,
    twoFactorEnabled: true,
  });
  userIds.push(id);
  return id;
}

async function recordFailures(userId: string, count: number, ageMs = 0): Promise<void> {
  await db.insert(securityAuditEvents).values(
    Array.from({ length: count }, () => ({
      actorId: userId,
      actorLabel: "fixture",
      action: "user_password_change_failed",
      scope: "global" as const,
      targetType: "user",
      targetId: userId,
      requestCorrelationId: randomUUID(),
      createdAt: new Date(Date.now() - ageMs),
    })),
  );
}

async function events(userId: string, action: string) {
  return db
    .select()
    .from(securityAuditEvents)
    .where(and(eq(securityAuditEvents.targetId, userId), eq(securityAuditEvents.action, action)));
}

describeDb("changeOwnPasswordWithBudget", () => {
  beforeAll(() => {
    expect(PASSWORD_CHANGE_FAILURE_LIMIT).toBe(5);
    expect(PASSWORD_CHANGE_FAILURE_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  afterAll(async () => {
    await db.delete(securityAuditEvents).where(inArray(securityAuditEvents.targetId, userIds));
    await db.delete(user).where(inArray(user.id, userIds));
  });

  it("records a wrong current password without any secret", async () => {
    const userId = await newUser("wrong");

    await expect(
      changeOwnPasswordWithBudget(userId, async () => "wrong_password"),
    ).resolves.toBe("wrong_password");

    const failed = await events(userId, "user_password_change_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      actorId: userId,
      actorLabel: "Changement wrong",
      scope: "global",
      targetType: "user",
      targetId: userId,
      oldValue: null,
      newValue: null,
    });
  });

  it("refuses before calling Better Auth once the failure budget is spent", async () => {
    const userId = await newUser("limited");
    await recordFailures(userId, PASSWORD_CHANGE_FAILURE_LIMIT);
    const attempt = vi.fn(async () => "changed" as const);

    await expect(changeOwnPasswordWithBudget(userId, attempt)).resolves.toBe("rate_limited");
    expect(attempt).not.toHaveBeenCalled();
    expect(await events(userId, "user_password_change_failed")).toHaveLength(
      PASSWORD_CHANGE_FAILURE_LIMIT,
    );
  });

  it("only counts failures inside the window", async () => {
    const userId = await newUser("window");
    await recordFailures(userId, PASSWORD_CHANGE_FAILURE_LIMIT, PASSWORD_CHANGE_FAILURE_WINDOW_MS + 60_000);
    await recordFailures(userId, PASSWORD_CHANGE_FAILURE_LIMIT - 1);
    const attempt = vi.fn(async () => "wrong_password" as const);

    await expect(changeOwnPasswordWithBudget(userId, attempt)).resolves.toBe("wrong_password");
    await expect(changeOwnPasswordWithBudget(userId, attempt)).resolves.toBe("rate_limited");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent attempts so the budget cannot be overrun", async () => {
    const userId = await newUser("concurrent");
    await recordFailures(userId, PASSWORD_CHANGE_FAILURE_LIMIT - 1);
    const attempt = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return "wrong_password" as const;
    });

    const outcomes = await Promise.all([
      changeOwnPasswordWithBudget(userId, attempt),
      changeOwnPasswordWithBudget(userId, attempt),
      changeOwnPasswordWithBudget(userId, attempt),
    ]);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(outcomes.sort()).toEqual(["rate_limited", "rate_limited", "wrong_password"]);
  });

  it("never holds a pooled connection while Better Auth runs", async () => {
    // Better Auth shares this pool: an attempt blocked on a connection held by
    // the budget itself would freeze every request once the pool is full.
    const users = await Promise.all(
      Array.from({ length: (databasePool.options.max ?? 10) + 2 }, (_, index) => newUser(`pool-${index}`)),
    );
    const attempt = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await db.select({ id: user.id }).from(user).limit(1);
      return "failed" as const;
    };

    const outcomes = await Promise.all(
      users.map((userId) => changeOwnPasswordWithBudget(userId, attempt)),
    );
    expect(outcomes.every((outcome) => outcome === "failed")).toBe(true);
  }, 15_000);

  it("counts an attempt whose outcome was never recorded (crash-safe)", async () => {
    const userId = await newUser("reserved");
    await db.insert(securityAuditEvents).values(
      Array.from({ length: PASSWORD_CHANGE_FAILURE_LIMIT }, () => ({
        actorId: userId,
        actorLabel: "fixture",
        action: "user_password_change_attempted",
        scope: "global" as const,
        targetType: "user",
        targetId: userId,
        requestCorrelationId: randomUUID(),
      })),
    );

    await expect(changeOwnPasswordWithBudget(userId, async () => "changed")).resolves.toBe(
      "rate_limited",
    );
  });

  it("logs a successful change and closes pending sign-in challenges", async () => {
    const userId = await newUser("changed");
    const challenge = `2fa-${randomUUID()}`;
    await db.insert(verification).values([
      { id: randomUUID(), identifier: challenge, value: userId, expiresAt: new Date(Date.now() + 600_000) },
      { id: randomUUID(), identifier: `2fa-attempts-${challenge}`, value: "0", expiresAt: new Date(Date.now() + 600_000) },
    ]);

    await expect(changeOwnPasswordWithBudget(userId, async () => "changed")).resolves.toBe("changed");

    const changed = await events(userId, "user_password_changed");
    expect(changed).toHaveLength(1);
    expect(await events(userId, "user_password_change_attempted")).toHaveLength(0);
    expect(changed[0]).toMatchObject({ actorId: userId, targetId: userId, newValue: { pendingSignInsRevoked: 1 } });
    const left = await db
      .select({ id: verification.id })
      .from(verification)
      .where(like(verification.identifier, `%${challenge}`));
    expect(left).toHaveLength(0);
  });

  it("keeps the reservation counted when the attempt ends in an unexpected error", async () => {
    const userId = await newUser("unexpected");

    await expect(
      changeOwnPasswordWithBudget(userId, async () => {
        throw new Error("connection reset");
      }),
    ).rejects.toThrow("connection reset");
    // The password may or may not have changed: the attempt stays counted.
    expect(await events(userId, "user_password_change_attempted")).toHaveLength(1);
  });

  it("does not log other Better Auth failures as password guesses", async () => {
    const userId = await newUser("failed");

    await expect(changeOwnPasswordWithBudget(userId, async () => "failed")).resolves.toBe("failed");
    expect(await events(userId, "user_password_change_failed")).toHaveLength(0);
    expect(await events(userId, "user_password_change_attempted")).toHaveLength(0);
  });
});

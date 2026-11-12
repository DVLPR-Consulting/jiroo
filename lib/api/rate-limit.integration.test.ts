import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reserveApiRequest } from "@/lib/api/rate-limit";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { apiTokenRate } from "@/lib/db/schema/domain";
import { createApiToken } from "@/lib/services/api-tokens";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("api request budget (JIR-156)", () => {
  const owner = { id: `api-rate-owner-${randomUUID()}`, email: `${randomUUID()}@tokens.test`, name: "Budget" };
  let tokenId: string;

  beforeAll(async () => {
    await db.insert(user).values({ ...owner, emailVerified: true, twoFactorEnabled: true, role: "contributor" });
    tokenId = (await createApiToken({ name: "Budget", scope: "read", expiresInDays: null }, owner.id)).row.id;
  });

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, owner.id));
  });

  it("counts atomically per token and minute, refuses past the limit and starts the next minute afresh", async () => {
    const window = new Date("2030-01-01T10:00:30.000Z");
    let last = await reserveApiRequest(tokenId, window, 5);
    for (let index = 0; index < 3; index += 1) last = await reserveApiRequest(tokenId, window, 5);
    expect(last).toEqual({ allowed: true, count: 4, retryAfterSeconds: 30 });

    const pair = await Promise.all([
      reserveApiRequest(tokenId, window, 5),
      reserveApiRequest(tokenId, window, 5),
    ]);
    expect(pair.map((r) => r.count).sort((a, b) => a - b)).toEqual([5, 6]);
    expect(pair.find((r) => r.count === 5)!.allowed).toBe(true);
    expect(pair.find((r) => r.count === 6)!.allowed).toBe(false);
    expect((await reserveApiRequest(tokenId, window, 5)).allowed).toBe(false);

    expect(await reserveApiRequest(tokenId, new Date("2030-01-01T10:01:05.000Z"), 5)).toEqual({
      allowed: true,
      count: 1,
      retryAfterSeconds: 55,
    });
    const windows = await db.select().from(apiTokenRate).where(eq(apiTokenRate.tokenId, tokenId));
    expect(windows.map((row) => row.windowStart.toISOString())).toEqual(["2030-01-01T10:01:00.000Z"]);
  });

  it("disappears with its token", async () => {
    const { row } = await createApiToken({ name: "Éphémère", scope: "read", expiresInDays: null }, owner.id);
    await reserveApiRequest(row.id, new Date("2030-01-01T10:00:00.000Z"));
    await db.delete(user).where(eq(user.id, owner.id));
    expect(await db.select().from(apiTokenRate).where(eq(apiTokenRate.tokenId, row.id))).toEqual([]);
    await db.insert(user).values({ ...owner, emailVerified: true, twoFactorEnabled: true, role: "contributor" });
  });
});

import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/realtime/publish", () => ({ publishBacklogChange: vi.fn(), notifyUsers: vi.fn() }));

import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { items, securityAuditEvents } from "@/lib/db/schema/domain";
import { createApiToken } from "@/lib/services/api-tokens";
import {
  createReadVisibilityFixture,
  deleteReadVisibilityFixture,
  type ReadVisibilityFixture,
} from "@/lib/services/read-visibility.integration-fixture";
import { GET as detail } from "@/app/api/v1/items/[key]/route";
import { GET as list } from "@/app/api/v1/items/route";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

// Security audit (JIR-160): a platform administrator reading a backlog outside
// their ordinary grants through the API leaves the same bypass trace as in the UI.
describeDb("administrator bypass through the REST API", () => {
  let fixture: ReadVisibilityFixture;
  let adminToken: string;
  let memberToken: string;

  beforeAll(async () => {
    fixture = await createReadVisibilityFixture("Audit API");
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, fixture.platformAdmin));
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, fixture.actorA));
    // The fixture's keys carry a timestamp longer than an item number may be.
    const key = `${fixture.backlogA.key}-1`;
    await db.update(items).set({ key }).where(eq(items.id, fixture.liveA.id));
    fixture.liveA.key = key;
    adminToken = (await createApiToken({ name: "Admin", scope: "read", expiresInDays: 30 }, fixture.platformAdmin, { authVersion: 0 })).token;
    memberToken = (await createApiToken({ name: "Membre", scope: "read", expiresInDays: 30 }, fixture.actorA, { authVersion: 0 })).token;
  });

  afterAll(async () => {
    if (fixture) {
      await db.delete(securityAuditEvents).where(eq(securityAuditEvents.actorId, fixture.platformAdmin));
      await deleteReadVisibilityFixture(fixture);
    }
  });

  const get = (path: string, token: string) =>
    new Request(`http://localhost/api/v1/${path}`, { headers: { authorization: `Bearer ${token}` } });

  async function bypassEvents(backlogId: string) {
    return db
      .select({ action: securityAuditEvents.action, targetType: securityAuditEvents.targetType })
      .from(securityAuditEvents)
      .where(and(eq(securityAuditEvents.actorId, fixture.platformAdmin), eq(securityAuditEvents.backlogId, backlogId)));
  }

  it("records a bypass event when the administrator reads an item by key", async () => {
    const response = await detail(get(`items/${fixture.liveA.key}`, adminToken), { params: Promise.resolve({ key: fixture.liveA.key }) });
    expect(response.status).toBe(200);
    expect(await bypassEvents(fixture.backlogA.id)).toContainEqual({ action: "platform_administrator_bypass", targetType: "backlog" });
  });

  it("records a bypass event when the administrator lists a named backlog", async () => {
    const before = (await bypassEvents(fixture.backlogB.id)).length;
    const response = await list(get(`items?backlog=${fixture.backlogB.key}`, adminToken));
    expect(response.status).toBe(200);
    expect((await bypassEvents(fixture.backlogB.id)).length).toBe(before + 1);
  });

  it("records nothing for a member reading their own backlog", async () => {
    const response = await detail(get(`items/${fixture.liveA.key}`, memberToken), { params: Promise.resolve({ key: fixture.liveA.key }) });
    expect(response.status).toBe(200);
    const memberEvents = await db
      .select({ id: securityAuditEvents.id })
      .from(securityAuditEvents)
      .where(and(eq(securityAuditEvents.actorId, fixture.actorA), eq(securityAuditEvents.action, "platform_administrator_bypass")));
    expect(memberEvents).toEqual([]);
  });
});

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
// Transport is external; authorization, services, token auth and DB stay real.
vi.mock("@/lib/realtime/publish", () => ({ publishBacklogChange: vi.fn(), notifyUsers: vi.fn() }));
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { activities, backlogs, items, statuses } from "@/lib/db/schema/domain";
import { createApiToken } from "@/lib/services/api-tokens";
import { createBacklog } from "@/lib/services/backlogs";
import { GET as getMe } from "@/app/api/v1/me/route";
import { GET as listBacklogs } from "@/app/api/v1/backlogs/route";
import { GET as list, POST as create } from "@/app/api/v1/items/route";
import { GET as detail, PATCH as patch } from "@/app/api/v1/items/[key]/route";
import { POST as comment } from "@/app/api/v1/items/[key]/comments/route";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
describeDb("REST v1 with real tokens and permissions", () => {
 const actorId = `rest-${randomUUID()}`;
 const outsiderId = `rest-outsider-${randomUUID()}`;
 let token: string; let tokenId: string; let outsiderToken: string; let backlogId: string; let key: string;
 const request = (path: string, method = "GET", body?: unknown, bearer = token) => new Request(`http://localhost/api/v1/${path}`, { method, headers: { authorization: `Bearer ${bearer}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
 beforeAll(async () => {
  await db.insert(user).values([
   { id: actorId, name: "REST owner", email: `${randomUUID()}@rest.test`, emailVerified: true, twoFactorEnabled: true, role: "admin" },
   { id: outsiderId, name: "REST outsider", email: `${randomUUID()}@rest.test`, emailVerified: true, twoFactorEnabled: true, role: "contributor" },
  ]);
  const issued = await createApiToken({ name: "REST integration", scope: "write", expiresInDays: null }, actorId, { authVersion: 0 });
  token = issued.token; tokenId = issued.row.id;
  outsiderToken = (await createApiToken({ name: "Other", scope: "read", expiresInDays: null }, outsiderId, { authVersion: 0 })).token;
  const backlog = await createBacklog({ key: `R${randomUUID().replaceAll(/[^a-f]/g, "").slice(0, 5).toUpperCase()}`, name: "REST integration", color: "#475569" }, actorId);
  backlogId = backlog.id;
  const response = await create(request("items", "POST", { backlogKey: backlog.key, type: "composant", title: "REST component" }));
  expect(response.status).toBe(201);
  key = (await response.json()).item.key;
 });
 afterAll(async () => {
  if (backlogId) await db.delete(backlogs).where(eq(backlogs.id, backlogId));
  await db.delete(user).where(eq(user.id, outsiderId));
  await db.delete(user).where(eq(user.id, actorId));
 });
 it("reads only the public identity and token metadata", async () => {
  const response = await getMe(request("me"));
  expect(await response.json()).toEqual({ user: { id: actorId, name: "REST owner", email: expect.any(String) }, token: { id: tokenId, name: "REST integration", scope: "write", expiresAt: null } });
 });
 it("records status transitions as api with the authenticating token id", async () => {
  const [target] = await db.select().from(statuses).where(and(eq(statuses.backlogId, backlogId), eq(statuses.category, "done"))).limit(1);
  expect(target).toBeDefined();
  const response = await patch(request(`items/${key}`, "PATCH", { statusId: target!.id }), { params: Promise.resolve({ key }) });
  expect(response.status).toBe(200);
  const result = (await response.json()).item;
  expect(result).toMatchObject({ key, status: { id: target!.id, category: "done" }, backlog: { id: backlogId }, assignee: null, estimatePoints: null });
  expect(result.createdAt).toMatch(/Z$/); expect(result.closedAt).toMatch(/Z$/);
  expect(result).not.toHaveProperty("path");
  const rows = await db.select({ source: activities.source, tokenId: activities.tokenId }).from(activities).innerJoin(items, eq(activities.itemId, items.id)).where(and(eq(items.key, key), eq(activities.field, "status")));
  expect(rows).toEqual([{ source: "api", tokenId }]);
 });
 it("adds a comment and returns detail with named authors and actors", async () => {
  const response = await comment(request(`items/${key}/comments`, "POST", { body: "REST comment" }), { params: Promise.resolve({ key }) });
  expect(response.status).toBe(201);
  expect((await response.json()).comment).toMatchObject({ body: "REST comment", author: { id: actorId, name: "REST owner" }, updatedAt: null, deletedAt: null });
  const item = (await (await detail(request(`items/${key}`), { params: Promise.resolve({ key }) })).json()).item;
  expect(item.reporter).toEqual({ id: actorId, name: "REST owner" });
  expect(item.activities).toEqual(expect.arrayContaining([expect.objectContaining({ source: "api", actor: { id: actorId, name: "REST owner" } })]));
  expect(item.url).toBe(`/b/${key.split("-")[0]}?item=${key}`);
  expect(item.comments).toHaveLength(1);
 });
 it("masks unreadable items exactly like unknown items and filters lists", async () => {
  const forbidden = await detail(request(`items/${key}`, "GET", undefined, outsiderToken), { params: Promise.resolve({ key }) });
  const absent = await detail(request("items/UNKNOWN-1", "GET", undefined, outsiderToken), { params: Promise.resolve({ key: "UNKNOWN-1" }) });
  expect(forbidden.status).toBe(404); expect(absent.status).toBe(404);
  expect(await forbidden.json()).toEqual(await absent.json());
  const listing = await list(request(`items?backlog=${key.split("-")[0]}`, "GET", undefined, outsiderToken));
  expect(await listing.json()).toEqual({ items: [], nextCursor: null });
 });
 it("includes archived readable backlogs", async () => {
  const archivedAt = new Date("2026-01-01Z");
  await db.update(backlogs).set({ archivedAt }).where(eq(backlogs.id, backlogId));
  const response = await listBacklogs(request("backlogs"));
  expect((await response.json()).backlogs).toContainEqual(expect.objectContaining({ id: backlogId, archivedAt: archivedAt.toISOString() }));
 });
});

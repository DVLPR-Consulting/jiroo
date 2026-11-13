import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), budget: vi.fn(), me: vi.fn(), backlogs: vi.fn(), statuses: vi.fn(), summary: vi.fn(), detail: vi.fn(), resolve: vi.fn(), backlog: vi.fn(), search: vi.fn(), create: vi.fn(), update: vi.fn(), comment: vi.fn(), commentDto: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/authenticate", () => ({ authenticateBearer: m.auth, bearerChallenge: () => 'Bearer realm="jiroo"' }));
vi.mock("@/lib/api/rate-limit", () => ({ reserveApiRequest: m.budget }));
vi.mock("@/lib/services/api-tokens", () => ({ scopeAllows: (g: string, r: string) => g === "write" || r === "read" }));
vi.mock("@/lib/services/api-read", () => ({ getApiMe: m.me, listApiBacklogs: m.backlogs, listApiStatuses: m.statuses, getApiItemSummary: m.summary, getApiItemDetail: m.detail, resolveApiItem: m.resolve, resolveApiBacklog: m.backlog, getApiComment: m.commentDto }));
vi.mock("@/lib/services/item-search", () => ({ searchItemsForActor: m.search }));
vi.mock("@/lib/use-cases/items", () => ({ createItemUseCase: m.create, updateItemUseCase: m.update }));
vi.mock("@/lib/use-cases/comments", () => ({ addCommentUseCase: m.comment }));
import { GET as list, POST as create, DELETE as unsupported } from "@/app/api/v1/items/route";
import { GET as detail, PATCH as patch } from "@/app/api/v1/items/[key]/route";
import { POST as comment } from "@/app/api/v1/items/[key]/comments/route";
import { GET as me } from "@/app/api/v1/me/route";
import { GET as mine } from "@/app/api/v1/me/items/route";
import { GET as backlogs } from "@/app/api/v1/backlogs/route";
import { GET as statuses } from "@/app/api/v1/backlogs/[key]/statuses/route";
const actor = { actorId: "u", tokenId: "t", source: "api" };
const context = { params: Promise.resolve({ key: "TEST-1" }) };
const uuid = "00000000-0000-4000-8000-000000000001";
const item = { id: "i", key: "TEST-1", backlog: { id: "b", key: "TEST", name: "Test" }, type: "tache", kind: "feature", title: "Title", status: { id: uuid, name: "Todo", category: "todo" }, priority: 0, estimatePoints: 2.5, assignee: null, parentId: null, startDate: null, dueDate: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", closedAt: null };
const req = (body?: unknown, method = "GET", query = "") => new Request(`http://localhost/api/v1/items${query}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
describe("REST v1 routes", () => {
 beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ ok: true, principal: { actorId: "u", tokenId: "t", scope: "write" } });
  m.budget.mockResolvedValue({ allowed: true });
  m.summary.mockResolvedValue(item); m.detail.mockResolvedValue({ ...item, description: "text" });
  m.resolve.mockResolvedValue({ id: "i", backlogId: "b" }); m.backlog.mockResolvedValue({ backlogId: "b" });
  m.create.mockResolvedValue({ item: { id: "i", key: "TEST-1" } }); m.update.mockResolvedValue({ item: { id: "i", key: "TEST-1" } });
 });
 it("lists with cumulative filters and the unchanged opaque cursor", async () => {
  m.search.mockResolvedValue({ items: [item], nextCursor: "opaque" });
  const response = await list(req(undefined, "GET", `?backlog=test&status=${uuid}&assignee=me&type=tache&q=abc&limit=2&cursor=previous`));
  expect(await response.json()).toEqual({ items: [item], nextCursor: "opaque" });
  expect(m.search).toHaveBeenCalledWith("u", { backlogKey: "TEST", statusId: uuid, assignee: "me", type: "tache", query: "abc", limit: 2, cursor: "previous" });
 });
 it.each(["0", "101", "no", "1.5", ""])("rejects invalid limits %s", async (limit) => {
  const response = await list(req(undefined, "GET", `?limit=${limit}`));
  expect(response.status).toBe(400); expect((await response.json()).errors.length).toBeGreaterThan(0); expect(m.search).not.toHaveBeenCalled();
 });
 it("returns the detail DTO", async () => { expect(await (await detail(req(), context)).json()).toEqual({ item: { ...item, description: "text" } }); });
 it("makes missing and unreadable resources indistinguishable", async () => {
  const responses = [];
  for (const secret of ["unknown", "unreadable"]) { m.detail.mockRejectedValueOnce(Object.assign(new Error(secret), { name: "ResourceNotFoundError" })); const r = await detail(req(), context); expect(r.status).toBe(404); responses.push(await r.json()); }
  expect(responses[0]).toEqual(responses[1]);
 });
 it("creates through the use case and returns an explicit summary", async () => {
  const r = await create(req({ backlogKey: "test", type: "tache", title: "Title", parentKey: "TEST-2", labelIds: [uuid] }, "POST"));
  expect(r.status).toBe(201); expect(await r.json()).toEqual({ item });
  expect(m.create).toHaveBeenCalledWith(actor, { backlogId: "b", parentId: "i", type: "tache", title: "Title", labelIds: [uuid] });
 });
 it("transitions through the use case with token provenance", async () => {
  const r = await patch(req({ statusId: uuid }, "PATCH"), context);
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ item });
  expect(m.update).toHaveBeenCalledWith(actor, { id: "i", statusId: uuid });
 });
 it.each([{}, { reporterId: "u" }, { title: "x", labelIds: [] }])("rejects empty or non-whitelisted patches %s", async (body) => { expect((await patch(req(body, "PATCH"), context)).status).toBe(400); expect(m.update).not.toHaveBeenCalled(); });
 it("rejects malformed JSON", async () => {
  const r = await patch(new Request("http://localhost", { method: "PATCH", body: "{" }), context); expect(r.status).toBe(400);
 });
 it("returns domain conflicts", async () => { m.update.mockRejectedValueOnce(new Error("Hiérarchie invalide pour ce type.")); expect((await patch(req({ title: "x" }, "PATCH"), context)).status).toBe(409); });
 it.each(["PATCH", "POST"])("requires write scope for %s", async (method) => {
  m.auth.mockResolvedValue({ ok: true, principal: { actorId: "u", tokenId: "t", scope: "read" } });
  const r = method === "PATCH" ? await patch(req({ title: "x" }, method), context) : await create(req({ backlogKey: "TEST", type: "tache", title: "x" }, method));
  expect(r.status).toBe(403); expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
 });
 it("adds a comment through the use case", async () => {
  const dto = { id: "c", author: { id: "u", name: "User" }, body: "Hello", createdAt: item.createdAt, updatedAt: null, deletedAt: null };
  m.comment.mockResolvedValue({ comment: { id: "c" } }); m.commentDto.mockResolvedValue(dto);
  const r = await comment(req({ body: "Hello" }, "POST"), context);
  expect(r.status).toBe(201); expect(await r.json()).toEqual({ comment: dto }); expect(m.comment).toHaveBeenCalledWith(actor, { itemId: "i", body: "Hello", mentionIds: [] });
 });
 it("returns me, archived backlogs and statuses", async () => {
  const identity = { user: { id: "u", name: "User", email: "u@test" }, token: { id: "t", name: "Token", scope: "write", expiresAt: null } };
  m.me.mockResolvedValue(identity); m.backlogs.mockResolvedValue([{ id: "b", archivedAt: item.createdAt }]); m.statuses.mockResolvedValue([{ id: uuid, name: "Todo", category: "todo", color: "blue", order: 0 }]);
  expect(await (await me(req())).json()).toEqual(identity);
  expect(await (await backlogs(req())).json()).toEqual({ backlogs: [{ id: "b", archivedAt: item.createdAt }] });
  expect(await (await statuses(req(), { params: Promise.resolve({ key: "test" }) })).json()).toEqual({ statuses: [{ id: uuid, name: "Todo", category: "todo", color: "blue", order: 0 }] });
 });
 it("returns every assigned page rather than silently stopping at 100", async () => {
  m.search.mockResolvedValueOnce({ items: [item], nextCursor: "second" }).mockResolvedValueOnce({ items: [{ ...item, id: "j" }], nextCursor: null });
  expect(await (await mine(req())).json()).toEqual({ items: [item, { ...item, id: "j" }] });
  expect(m.search).toHaveBeenLastCalledWith("u", { assignee: "me", limit: 100, cursor: "second" });
 });
 it("uses a problem response with Allow for unsupported methods", async () => { const r = await unsupported(); expect(r.status).toBe(405); expect(r.headers.get("allow")).toContain("POST"); expect(r.headers.get("cache-control")).toBe("private, no-store"); });
});

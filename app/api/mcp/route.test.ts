import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  listBacklogsForUser: vi.fn(),
  reserveApiRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/authenticate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/authenticate")>()),
  authenticateBearer: mocks.authenticateBearer,
}));
vi.mock("@/lib/api/rate-limit", () => ({ reserveApiRequest: mocks.reserveApiRequest }));
vi.mock("@/lib/services/backlogs", () => ({
  getBacklogByKeyForUser: vi.fn(),
  listBacklogsForUser: mocks.listBacklogsForUser,
}));
vi.mock("@/lib/services/comments", () => ({ listComments: vi.fn() }));
vi.mock("@/lib/services/items", () => ({ getItemByKeyForBacklog: vi.fn(), listActivities: vi.fn(), listUsersByIds: vi.fn() }));
vi.mock("@/lib/services/statuses", () => ({ listStatusesForBacklog: vi.fn() }));
vi.mock("@/lib/services/item-search", () => ({ searchItemsForActor: vi.fn(), InvalidCursorError: class extends Error {} }));
vi.mock("@/lib/use-cases/comments", () => ({ addCommentUseCase: vi.fn() }));
vi.mock("@/lib/use-cases/items", () => ({ createItemUseCase: vi.fn(), updateItemUseCase: vi.fn() }));

import { POST } from "@/app/api/mcp/route";

const principal = { actorId: "user-1", tokenId: "token-1", scope: "read" as const };

function rpc(body: unknown, authorization?: string) {
  return new Request("https://jiroo.test/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function readJsonRpc(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  const data = text.split("\n").find((line) => line.startsWith("data:"));
  return JSON.parse(data ? data.slice(5) : text) as Record<string, unknown>;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticateBearer.mockResolvedValue({ ok: true, principal });
  mocks.reserveApiRequest.mockResolvedValue({ allowed: true, count: 1, retryAfterSeconds: 60 });
  mocks.listBacklogsForUser.mockResolvedValue([{ id: "b", key: "CASS", name: "Pôle civil", color: "#123456", archivedAt: null }]);
});

describe("POST /api/mcp", () => {
  it("challenges a request without a bearer token, without pointing at an OAuth server", async () => {
    mocks.authenticateBearer.mockResolvedValueOnce({ ok: false, reason: "missing" });
    const response = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="jiroo"');
    expect(response.headers.get("www-authenticate")).not.toContain("resource_metadata");
    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", error: { code: -32001 }, id: null });
    expect(mocks.listBacklogsForUser).not.toHaveBeenCalled();
  });

  it("rejects an unknown token with 401 and the invalid_token challenge", async () => {
    mocks.authenticateBearer.mockResolvedValueOnce({ ok: false, reason: "invalid" });
    const response = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "Bearer jiroo_pat_unknown"));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="jiroo", error="invalid_token"');
  });

  it("lists the tools and runs one for the token's owner", async () => {
    const listed = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "Bearer jiroo_pat_valid"));
    expect(listed.status).toBe(200);
    const list = (await readJsonRpc(listed)) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toContain("list_backlogs");

    const called = await POST(rpc(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_backlogs", arguments: {} } },
      "Bearer jiroo_pat_valid",
    ));
    expect(called.status).toBe(200);
    const result = (await readJsonRpc(called)) as { result: { structuredContent: unknown; isError?: boolean } };
    expect(result.result.isError).toBeUndefined();
    expect(result.result.structuredContent).toEqual({
      backlogs: [{ id: "b", key: "CASS", name: "Pôle civil", color: "#123456", archivedAt: null }],
    });
    expect(mocks.listBacklogsForUser).toHaveBeenCalledWith("user-1", { includeArchived: false });
    expect(mocks.reserveApiRequest).toHaveBeenCalledWith("token-1", expect.any(Date));
  });
});

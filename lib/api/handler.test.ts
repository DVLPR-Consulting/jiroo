import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), reserve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/authenticate", () => ({ authenticateBearer: mocks.authenticate, bearerChallenge: (reason: string) => reason === "missing" ? 'Bearer realm="jiroo"' : 'Bearer realm="jiroo", error="invalid_token"' }));
vi.mock("@/lib/api/rate-limit", () => ({ reserveApiRequest: mocks.reserve }));
vi.mock("@/lib/services/api-tokens", () => ({ scopeAllows: (granted: string, required: string) => granted === "write" || required === "read" }));
import { withApiAuth } from "./handler";
import { jsonOk } from "./http";
const principal = { actorId: "u", tokenId: "t", scope: "write" };
const request = () => new Request("http://localhost/api/v1/items");
describe("API authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ ok: true, principal });
    mocks.reserve.mockResolvedValue({ allowed: true, count: 1, retryAfterSeconds: 10 });
  });
  it.each(["missing", "invalid"])("returns 401 for %s bearer without spending budget", async (reason) => {
    mocks.authenticate.mockResolvedValue({ ok: false, reason });
    const handler = vi.fn();
    const response = await withApiAuth("read", handler)(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
  it("rejects a read token before any write, and still spends budget on the refusal", async () => {
    mocks.authenticate.mockResolvedValue({ ok: true, principal: { ...principal, scope: "read" } });
    const handler = vi.fn();
    const response = await withApiAuth("write", handler)(request());
    expect(response.status).toBe(403);
    expect((await response.json()).type).toContain("insufficient_scope");
    expect(mocks.reserve).toHaveBeenCalledWith("t");
    expect(handler).not.toHaveBeenCalled();
  });
  it("returns 429 and Retry-After without calling the handler", async () => {
    mocks.reserve.mockResolvedValue({ allowed: false, count: 301, retryAfterSeconds: 12 });
    const handler = vi.fn();
    const response = await withApiAuth("read", handler)(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(handler).not.toHaveBeenCalled();
  });
  it("passes the API actor and awaits dynamic params", async () => {
    const handler = vi.fn(async (_request, actor, params) => jsonOk({ actor, params }));
    const response = await withApiAuth<{ key: string }>("read", handler)(request(), { params: Promise.resolve({ key: "TEST-1" }) });
    expect(await response.json()).toEqual({ actor: { actorId: "u", tokenId: "t", source: "api" }, params: { key: "TEST-1" } });
    expect(mocks.reserve).toHaveBeenCalledWith("t");
  });
  it("maps failures from authentication and the handler", async () => {
    mocks.authenticate.mockRejectedValueOnce(new Error("database password"));
    expect((await withApiAuth("read", async () => jsonOk({}))(request())).status).toBe(500);
    const response = await withApiAuth("read", async () => { throw Object.assign(new Error("hidden"), { name: "ResourceNotFoundError" }); })(request());
    expect(response.status).toBe(404);
  });
});

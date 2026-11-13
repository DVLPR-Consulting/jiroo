import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { authInfoFor, principalFrom, registerJirooTools } from "@/lib/mcp/server";

const principal = { actorId: "user-1", tokenId: "token-1", scope: "write" as const };

describe("MCP auth info", () => {
  it("carries the principal in extra and the scopes, with the token's expiry in seconds", () => {
    const info = authInfoFor("jiroo_pat_x", principal, new Date("2027-01-01T00:00:00.000Z"));
    expect(info).toEqual({
      token: "jiroo_pat_x",
      clientId: "token-1",
      scopes: ["read", "write"],
      expiresAt: 1798761600,
      extra: { actorId: "user-1", tokenId: "token-1", scope: "write" },
    });
    expect(authInfoFor("t", { ...principal, scope: "read" }, null)).not.toHaveProperty("expiresAt");
    expect(principalFrom(info)).toEqual(principal);
  });

  it("reads no principal from a missing or malformed auth info", () => {
    expect(principalFrom(undefined)).toBeNull();
    expect(principalFrom({ token: "t", clientId: "c", scopes: [] })).toBeNull();
    expect(principalFrom({ token: "t", clientId: "c", scopes: [], extra: { actorId: "u", tokenId: "k", scope: "admin" } })).toBeNull();
  });

  it("registers every tool with its schema and read-only annotation", () => {
    const registerTool = vi.fn();
    registerJirooTools({ registerTool } as never);
    expect(registerTool).toHaveBeenCalledTimes(9);
    const [name, config] = registerTool.mock.calls[0]!;
    expect(name).toBe("list_backlogs");
    expect(config).toMatchObject({ title: "List backlogs", annotations: { readOnlyHint: true, destructiveHint: false } });
    expect(registerTool.mock.calls.find(([n]) => n === "add_comment")![1]).toMatchObject({ annotations: { readOnlyHint: false } });
  });

  it("answers an unauthenticated call with a refusal result", async () => {
    const registerTool = vi.fn();
    registerJirooTools({ registerTool } as never);
    const callback = registerTool.mock.calls[0]![2] as (args: unknown, ctx: unknown) => Promise<{ isError?: boolean }>;
    await expect(callback({}, { http: undefined })).resolves.toMatchObject({ isError: true });
  });
});

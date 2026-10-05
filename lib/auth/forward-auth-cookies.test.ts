import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set }) }));

import { forwardAuthCookies } from "@/lib/auth/forward-auth-cookies";

describe("forwardAuthCookies", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies every Set-Cookie emitted by Better Auth onto the Next.js response", async () => {
    const headers = new Headers();
    headers.append(
      "set-cookie",
      "better-auth.session_token=signed.token; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax",
    );
    headers.append("set-cookie", "better-auth.dont_remember=; Max-Age=0; Path=/");

    await forwardAuthCookies(headers);

    expect(mocks.set).toHaveBeenCalledWith(
      "better-auth.session_token",
      "signed.token",
      expect.objectContaining({ maxAge: 604800, path: "/", httpOnly: true, sameSite: "lax" }),
    );
    expect(mocks.set).toHaveBeenCalledWith(
      "better-auth.dont_remember",
      "",
      expect.objectContaining({ maxAge: 0, path: "/" }),
    );
  });

  it("keeps signed values and Expires dates intact", async () => {
    const headers = new Headers();
    headers.append(
      "set-cookie",
      "better-auth.session_token=abc.d%2Be%3D; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Path=/; HttpOnly",
    );
    headers.append("set-cookie", "other=1; Path=/");

    await forwardAuthCookies(headers);

    expect(mocks.set).toHaveBeenCalledWith(
      "better-auth.session_token",
      "abc.d+e=",
      expect.objectContaining({ expires: new Date("2031-01-01T00:00:00Z"), httpOnly: true }),
    );
    expect(mocks.set).toHaveBeenCalledWith("other", "1", expect.objectContaining({ path: "/" }));
  });

  it("does nothing without Set-Cookie", async () => {
    await forwardAuthCookies(new Headers());
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { cachedRead, withRequestCache } from "@/lib/auth/request-cache";

vi.mock("server-only", () => ({}));

describe("request cache", () => {
  it("reads once per key inside a scope, even when the reads overlap", async () => {
    const read = vi.fn(async (value: string) => `${value}!`);
    const results = await withRequestCache(() =>
      Promise.all([
        cachedRead("actor:1", () => read("a")),
        cachedRead("actor:1", () => read("a")),
        cachedRead("actor:2", () => read("b")),
      ]),
    );
    expect(results).toEqual(["a!", "a!", "b!"]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("never caches outside a scope nor across scopes", async () => {
    const read = vi.fn(async () => 1);
    await cachedRead("k", read);
    await cachedRead("k", read);
    await withRequestCache(() => cachedRead("k", read));
    await withRequestCache(() => cachedRead("k", read));
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("keeps the scopes of concurrent requests apart", async () => {
    const seen: string[] = [];
    await Promise.all([
      withRequestCache(async () => {
        await cachedRead("k", async () => seen.push("first"));
        await new Promise((resolve) => setTimeout(resolve, 5));
        await cachedRead("k", async () => seen.push("first again"));
      }),
      withRequestCache(async () => {
        await cachedRead("k", async () => seen.push("second"));
      }),
    ]);
    expect(seen).toEqual(["first", "second"]);
  });

  it("forgets a failed read so the next caller reads again", async () => {
    let calls = 0;
    const read = async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return "ok";
    };
    await withRequestCache(async () => {
      await expect(cachedRead("k", read)).rejects.toThrow("boom");
      await expect(cachedRead("k", read)).resolves.toBe("ok");
      await expect(cachedRead("k", read)).resolves.toBe("ok");
    });
    expect(calls).toBe(2);
  });
});

import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { withRetry } from "@/lib/services/items";

vi.mock("server-only", () => ({}));

describe("withRetry", () => {
  it("retries a PostgreSQL error wrapped by Drizzle", async () => {
    const cause = Object.assign(new Error("deadlock detected"), { code: "40P01" });
    const wrapped = new DrizzleQueryError("select 1", [], cause);
    const fn = vi.fn().mockRejectedValueOnce(wrapped).mockResolvedValueOnce("ok");
    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("preserves non-retryable wrapped errors", async () => {
    const wrapped = new DrizzleQueryError("select 1", [], Object.assign(new Error("invalid"), { code: "23502" }));
    const fn = vi.fn().mockRejectedValue(wrapped);
    await expect(withRetry(fn)).rejects.toBe(wrapped);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("retries on a retryable PG code then succeeds", async () => {
    const fn = vi.fn();
    fn.mockRejectedValueOnce({ code: "40P01" }).mockRejectedValueOnce({ code: "23505" }).mockResolvedValueOnce("ok");
    await expect(withRetry(fn, 3)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it("rethrows a non-retryable error immediately", async () => {
    const fn = vi.fn().mockRejectedValue({ code: "23502" }); // not_null_violation, not retryable
    await expect(withRetry(fn, 3)).rejects.toMatchObject({ code: "23502" });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("gives up after `tries` retryable failures", async () => {
    const fn = vi.fn().mockRejectedValue({ code: "40001" });
    await expect(withRetry(fn, 2)).rejects.toMatchObject({ code: "40001" });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

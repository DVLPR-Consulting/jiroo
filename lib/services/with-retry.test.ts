import { describe, expect, it, vi } from "vitest";
import { withRetry } from "@/lib/services/items";

describe("withRetry", () => {
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

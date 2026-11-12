import { describe, expect, it } from "vitest";
import { API_RATE_LIMIT_PER_MINUTE, retryAfterSeconds } from "@/lib/api/rate-limit";

describe("api rate limit", () => {
  it("allows 300 requests a minute", () => {
    expect(API_RATE_LIMIT_PER_MINUTE).toBe(300);
  });

  it("tells the client when the next minute opens", () => {
    expect(retryAfterSeconds(new Date("2026-11-12T21:00:00.000Z"))).toBe(60);
    expect(retryAfterSeconds(new Date("2026-11-12T21:00:30.000Z"))).toBe(30);
    expect(retryAfterSeconds(new Date("2026-11-12T21:00:59.400Z"))).toBe(1);
    expect(retryAfterSeconds(new Date("2026-11-12T21:00:59.999Z"))).toBe(1);
  });
});

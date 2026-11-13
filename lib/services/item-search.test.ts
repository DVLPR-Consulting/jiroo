import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { decodeCursor, encodeCursor } from "@/lib/services/item-search";

describe("item search cursor", () => {
  it("round-trips a creation instant and an id", () => {
    const cursor = { createdAt: new Date("2026-11-12T21:00:00.123Z"), id: "22222222-2222-4222-9222-222222222222" };
    const encoded = encodeCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it("refuses anything it did not produce", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from("2026-13-45T00:00:00Z|22222222-2222-4222-9222-222222222222").toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from("2026-11-12T21:00:00.000Z|drop table").toString("base64url"))).toBeNull();
  });
});

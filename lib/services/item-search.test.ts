import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { decodeCursor, encodeCursor } from "@/lib/services/item-search";

describe("item search cursor", () => {
  it("round-trips PostgreSQL's exact instant text and an id", () => {
    const cursor = { createdAt: "2026-11-12 21:00:00.123456+00", id: "22222222-2222-4222-9222-222222222222" };
    const encoded = encodeCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)).toEqual(cursor);
    expect(decodeCursor(encodeCursor({ ...cursor, createdAt: "2026-11-12 21:00:00+01:00" }))).not.toBeNull();
  });

  it("refuses anything it did not produce", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from("2026-11-12T21:00:00.000Z|22222222-2222-4222-9222-222222222222").toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from("2026-11-12 21:00:00+00|drop table").toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from("2026-11-12 21:00:00+00'; --|22222222-2222-4222-9222-222222222222").toString("base64url"))).toBeNull();
  });
});

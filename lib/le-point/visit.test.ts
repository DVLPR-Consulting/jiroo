import { describe, expect, it } from "vitest";
import { lastVisitBefore, recordVisit } from "@/lib/le-point/visit";

describe("le point visits", () => {
  it("knows no visit on a first visit or a broken cookie", () => {
    expect(lastVisitBefore(undefined, "2026-10-22")).toBeNull();
    expect(lastVisitBefore("garbage", "2026-10-22")).toBeNull();
    expect(recordVisit(undefined, "2026-10-22")).toBe(".2026-10-22");
  });

  it("returns the previous day of visit, even after a second visit today", () => {
    const first = recordVisit(".2026-10-20", "2026-10-22");
    expect(first).toBe("2026-10-20.2026-10-22");
    expect(lastVisitBefore(first, "2026-10-22")).toBe("2026-10-20");
    const again = recordVisit(first, "2026-10-22");
    expect(again).toBe(first);
    expect(lastVisitBefore(again, "2026-10-23")).toBe("2026-10-22");
  });

  it("ignores a day in the future", () => {
    expect(lastVisitBefore("2026-10-30.2026-11-02", "2026-10-22")).toBeNull();
    expect(recordVisit(".2026-11-02", "2026-10-22")).toBe(".2026-10-22");
  });
});

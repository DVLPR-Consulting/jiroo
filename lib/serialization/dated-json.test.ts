import { describe, expect, it } from "vitest";
import { parseDatedJson, stringifyDatedJson } from "@/lib/serialization/dated-json";

describe("dated JSON", () => {
  it("round-trips nested dates as Date instances", () => {
    const value = {
      detail: { createdAt: new Date("2026-10-01T08:30:00.000Z"), dueDate: null },
      activities: [{ id: "a1", createdAt: new Date("2026-10-02T09:00:00.000Z") }],
    };

    const parsed = parseDatedJson<typeof value>(stringifyDatedJson(value));

    expect(parsed.detail.createdAt).toBeInstanceOf(Date);
    expect(parsed.detail.createdAt.toISOString()).toBe("2026-10-01T08:30:00.000Z");
    expect(parsed.activities[0]?.createdAt).toEqual(new Date("2026-10-02T09:00:00.000Z"));
    expect(parsed.detail.dueDate).toBeNull();
  });

  it("leaves ISO-looking strings as strings", () => {
    const value = { title: "2026-10-01T08:30:00.000Z", url: "https://example.test" };

    expect(parseDatedJson(stringifyDatedJson(value))).toEqual(value);
  });

  it("keeps an object that merely has a date key alongside other keys", () => {
    const value = { $date: "not a tag", other: 1 };

    expect(parseDatedJson(stringifyDatedJson(value))).toEqual(value);
  });

  it("drops undefined properties like JSON does", () => {
    expect(parseDatedJson(stringifyDatedJson({ parent: undefined, key: "CASS-1" })))
      .toEqual({ key: "CASS-1" });
  });

  it("revives an invalid date as an invalid Date", () => {
    const parsed = parseDatedJson<{ at: Date }>(stringifyDatedJson({ at: new Date(Number.NaN) }));

    expect(parsed.at).toBeInstanceOf(Date);
    expect(Number.isNaN(parsed.at.getTime())).toBe(true);
  });
});

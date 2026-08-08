import { describe, expect, it } from "vitest";
import { parseReportUrlState } from "@/lib/reports/report-url";

describe("parseReportUrlState", () => {
  it("uses safe sprint-report defaults", () => {
    expect(parseReportUrlState({})).toEqual({
      report: "sprint",
      sprintId: null,
      limit: 7,
      itemPage: 1,
      eventPage: 1,
    });
  });

  it("accepts supported velocity limits and positive pages", () => {
    expect(parseReportUrlState({
      report: "velocity",
      limit: "12",
      itemPage: "3",
      eventPage: "4",
    })).toEqual({
      report: "velocity",
      sprintId: null,
      limit: 12,
      itemPage: 3,
      eventPage: 4,
    });
  });

  it("normalizes non-resource values but preserves the first raw sprint identifier", () => {
    expect(parseReportUrlState({
      report: "burndown",
      sprint: ["not-a-uuid", "ignored"],
      limit: "99",
      itemPage: "-1",
      eventPage: "2.5",
    })).toEqual({
      report: "sprint",
      sprintId: "not-a-uuid",
      limit: 7,
      itemPage: 1,
      eventPage: 1,
    });
  });
});

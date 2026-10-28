import { describe, expect, it } from "vitest";
import {
  countWorkingDays,
  easterSunday,
  frenchPublicHolidays,
  isWorkingDay,
  nextWorkingDay,
  previousWorkingDay,
  publicHoliday,
} from "@/lib/dates/working-days";

describe("the French working calendar", () => {
  it("places Easter and the holidays that follow it", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2024)).toBe("2024-03-31");
    const holidays = frenchPublicHolidays(2026);
    expect(holidays.get("2026-04-06")).toBe("Lundi de Pâques");
    expect(holidays.get("2026-05-14")).toBe("Ascension");
    expect(holidays.get("2026-05-25")).toBe("Lundi de Pentecôte");
    expect(holidays.size).toBe(11);
    expect(frenchPublicHolidays(2027).get("2027-05-06")).toBe("Ascension");
  });

  it("names a holiday, and only a holiday", () => {
    expect(publicHoliday("2026-11-11")).toBe("Armistice de 1918");
    expect(publicHoliday("2026-11-01")).toBe("Toussaint");
    expect(publicHoliday("2026-11-02")).toBeNull();
  });

  it("works Monday to Friday except on a holiday", () => {
    expect(isWorkingDay("2026-11-02")).toBe(true);
    expect(isWorkingDay("2026-11-07")).toBe(false); // Saturday
    expect(isWorkingDay("2026-11-01")).toBe(false); // Sunday, and Toussaint
    expect(isWorkingDay("2026-11-11")).toBe(false); // Wednesday, Armistice
    expect(isWorkingDay("2026-12-25")).toBe(false); // Friday, Noël
    expect(isWorkingDay("1969-12-27")).toBe(false); // a Saturday before 1970
    expect(isWorkingDay("1969-12-29")).toBe(true);
  });

  it("counts working days both ends included, holidays off", () => {
    expect(countWorkingDays("2026-11-09", "2026-11-13")).toBe(4);
    expect(countWorkingDays("2026-10-19", "2026-10-30")).toBe(10);
    expect(countWorkingDays("2026-11-07", "2026-11-08")).toBe(0);
    expect(countWorkingDays("2026-11-13", "2026-11-09")).toBe(0);
    expect(countWorkingDays("2026-05-01", "2026-05-31")).toBe(17); // 21 weekdays less 1 and 8 May, Ascension, Pentecost Monday
  });

  it("steps over weekends and holidays", () => {
    expect(nextWorkingDay("2026-11-10")).toBe("2026-11-12");
    expect(nextWorkingDay("2026-11-06")).toBe("2026-11-09");
    expect(previousWorkingDay("2026-11-12")).toBe("2026-11-10");
    expect(previousWorkingDay("2026-11-02")).toBe("2026-10-30");
  });
});

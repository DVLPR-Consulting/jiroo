import { describe, expect, it } from "vitest";
import { dueDay, dueStatus } from "@/lib/items/due-date";

describe("dueStatus", () => {
  it("presses in amber from two days before the due date to the day itself", () => {
    expect(dueStatus("2026-10-30", "2026-10-28")).toEqual({ tone: "soon", days: 2, title: "Échéance dans 2 j" });
    expect(dueStatus("2026-10-29", "2026-10-28")).toMatchObject({ tone: "soon", title: "Échéance dans 1 j" });
    expect(dueStatus("2026-10-28", "2026-10-28")).toEqual({ tone: "soon", days: 0, title: "Échéance aujourd’hui" });
  });

  it("stays grey three days ahead or more", () => {
    expect(dueStatus("2026-10-31", "2026-10-28")).toEqual({ tone: "later", days: 3, title: "Échéance dans 3 j" });
  });

  it("turns red once the due date is past", () => {
    expect(dueStatus("2026-10-21", "2026-10-28")).toEqual({ tone: "late", days: -7, title: "Échéance dépassée de 7 j" });
  });

  it("never presses a done ticket", () => {
    expect(dueStatus("2026-10-21", "2026-10-28", true)).toEqual({ tone: "later", days: -7, title: "Échéance" });
    expect(dueStatus("2026-10-28", "2026-10-28", true).tone).toBe("later");
  });

  it("reads a Date or a timestamp as its UTC calendar day", () => {
    expect(dueDay(new Date("2026-10-30T00:00:00.000Z"))).toBe("2026-10-30");
    expect(dueDay("2026-10-30T12:00:00.000Z")).toBe("2026-10-30");
    expect(dueStatus(new Date("2026-10-30T00:00:00.000Z"), "2026-10-28").days).toBe(2);
  });
});

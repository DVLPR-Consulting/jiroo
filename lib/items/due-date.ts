import { dayFromDate, daysBetween, isDay, type Day } from "@/lib/roadmap/days";

/** How pressing a due date is: past, within two days, or later. */
export type DueTone = "late" | "soon" | "later";

export type DueStatus = {
  tone: DueTone;
  /** Days from today to the due date; negative once it is past. */
  days: number;
  /** The tooltip of the due date lozenge. */
  title: string;
};

/** The calendar day of a due date, whether it comes as a day string or a Date. */
export function dueDay(dueDate: Date | string): Day {
  if (typeof dueDate === "string") return isDay(dueDate) ? dueDate : dayFromDate(new Date(dueDate));
  return dayFromDate(dueDate);
}

/**
 * The board card's reading of a due date on `today`: red once it is past and
 * the ticket is still open, amber within two days, grey otherwise. A done
 * ticket's due date never presses.
 */
export function dueStatus(dueDate: Date | string, today: Day, done = false): DueStatus {
  const days = daysBetween(today, dueDay(dueDate));
  if (done) return { tone: "later", days, title: "Échéance" };
  const tone: DueTone = days < 0 ? "late" : days <= 2 ? "soon" : "later";
  const title =
    days < 0
      ? `Échéance dépassée de ${-days} j`
      : days === 0
        ? "Échéance aujourd’hui"
        : `Échéance dans ${days} j`;
  return { tone, days, title };
}

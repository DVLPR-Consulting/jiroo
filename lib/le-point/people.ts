import { absentOn } from "@/lib/le-point/absences";
import type { LePointDataset, LePointTicket } from "@/lib/le-point/model";

const inSprint = (ticket: LePointTicket) => !ticket.external && ticket.inSprint === true;

/**
 * Who does the sprint's work: every known backlog member, or, without the
 * directory, the distinct holders of open sprint tickets. Someone whose only
 * open tickets sit outside the sprint is not counted.
 */
export function sprintPeople(data: LePointDataset): string[] {
  if (data.members?.length) return data.members.map((member) => member.id);
  const holders = data.tickets
    .filter((ticket) => inSprint(ticket) && ticket.category !== "done" && ticket.assignee !== null)
    .map((ticket) => ticket.assignee as string);
  return [...new Set(holders)];
}

/** Those of the sprint's people not away today. */
export function presentInSprint(data: LePointDataset): number {
  const absences = data.absences ?? [];
  return sprintPeople(data).filter((person) => !absentOn(absences, person, data.today)).length;
}

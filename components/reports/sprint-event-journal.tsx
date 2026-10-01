import { ReportPagination } from "@/components/reports/report-pagination";

export type SerializableSprintEvent = {
  id: string;
  sequence: string;
  eventType:
    | "sprint_started"
    | "sprint_completed"
    | "item_added"
    | "item_removed"
    | "estimate_changed"
    | "item_completed"
    | "item_reopened";
  occurredAt: string;
  actor: { id: string; name: string };
  itemId: string | null;
  itemKey: string | null;
  itemTitle: string | null;
  previousEstimate: number | null;
  nextEstimate: number | null;
  previousDone: boolean | null;
  nextDone: boolean | null;
  relatedSprint: { id: string | null; name: string } | null;
  removalReason: "manual" | "moved" | "deleted" | null;
};

export type SerializableEventPage = {
  page: number;
  pageSize: number;
  total: number;
  rows: SerializableSprintEvent[];
};

const points = (value: number | null) =>
  value === null
    ? "Non estimé"
    : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} pts`;

function eventSentence(event: SerializableSprintEvent) {
  const actor = event.actor.name;
  const key = event.itemKey ?? "l’élément";
  switch (event.eventType) {
    case "sprint_started":
      return `${actor} a démarré le sprint`;
    case "sprint_completed":
      return `${actor} a clôturé le sprint`;
    case "item_added":
      return `${actor} a ajouté ${key} au sprint avec ${points(event.nextEstimate)}`;
    case "item_removed":
      if (event.removalReason === "deleted") {
        return `${actor} a supprimé ${key} du sprint avec ${points(event.previousEstimate)}`;
      }
      return `${actor} a retiré ${key} vers ${event.relatedSprint?.name ?? "le Backlog"} avec ${points(event.previousEstimate)}`;
    case "estimate_changed":
      return `${actor} a modifié ${key} : ${points(event.previousEstimate)} → ${points(event.nextEstimate)}`;
    case "item_completed":
      return `${actor} a terminé ${key}`;
    case "item_reopened":
      return `${actor} a rouvert ${key}`;
  }
}

export function SprintEventJournal({
  backlogKey,
  sprintId,
  itemPage,
  events,
  report = "sprint",
}: {
  backlogKey: string;
  sprintId: string;
  itemPage: number;
  events: SerializableEventPage;
  /** Report tab the journal pagination keeps the reader on. */
  report?: "sprint" | "burndown";
}) {
  const dateTime = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const path = `/b/${backlogKey}/reports`;
  return (
    <section role="region" aria-labelledby="sprint-journal-title" className="space-y-3">
      <h2 id="sprint-journal-title" className="t-h2">Journal du sprint</h2>
      {events.rows.length === 0 ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">Aucun événement.</p>
      ) : (
        <ol className="divide-y rounded-xl border">
          {events.rows.map((event) => (
            <li key={event.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
              <span>{eventSentence(event)}</span>
              <time dateTime={event.occurredAt} className="text-muted-foreground">
                {dateTime.format(new Date(event.occurredAt))}
              </time>
            </li>
          ))}
        </ol>
      )}
      <ReportPagination
        ariaLabel="Pagination du journal"
        page={events.page}
        pageSize={events.pageSize}
        total={events.total}
        href={(eventPage) => `${path}?${new URLSearchParams({
          report,
          sprint: sprintId,
          itemPage: String(itemPage),
          eventPage: String(eventPage),
        }).toString()}`}
      />
    </section>
  );
}

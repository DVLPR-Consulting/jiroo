import type { activities as activitiesTable } from "@/lib/db/schema/domain";

type ActivityRow = typeof activitiesTable.$inferSelect;
type UserLite = { id: string; name: string };
type StatusLite = { id: string; name: string; color: string; category: string };

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

function phrase(
  activity: ActivityRow,
  statusName: (id: string | null) => string,
): string {
  const { action, field, oldValue, newValue } = activity;

  switch (action) {
    case "create":
      return "a créé l'item";
    case "status_change": {
      const from = statusName(oldValue);
      const to = statusName(newValue);
      return `a changé le statut de ${from} à ${to}`;
    }
    case "delete":
      return newValue != null ? "a supprimé l'item" : "a restauré l'item";
    case "comment":
      return "a commenté";
    case "update":
      switch (field) {
        case "title":
          return "a renommé l'item";
        case "description":
          return "a modifié la description";
        case "priority":
          return "a changé la priorité";
        case "assignee":
          return "a changé l'assignation";
        case "due_date":
          return "a changé l'échéance";
        case "labels":
          return "a modifié les labels";
        default:
          return "a modifié l'item";
      }
    default:
      return "a modifié l'item";
  }
}

export function ActivityLog({
  activities,
  users,
  statuses,
}: {
  activities: ActivityRow[];
  users: UserLite[];
  statuses: StatusLite[];
}) {
  if (activities.length === 0) {
    return <p className="t-sm text-muted-foreground">Aucune activité</p>;
  }

  const userById = new Map(users.map((u) => [u.id, u]));
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const statusName = (id: string | null) =>
    (id && statusById.get(id)?.name) || id || "—";

  return (
    <ul className="flex flex-col gap-3">
      {activities.map((a) => {
        const actorName = userById.get(a.actorId)?.name ?? a.actorId;
        return (
          <li key={a.id} className="flex flex-col gap-0.5 text-sm">
            <p>
              <span className="font-semibold">{actorName}</span>{" "}
              <span className="text-muted-foreground">{phrase(a, statusName)}</span>
            </p>
            <time className="text-xs text-muted-foreground" dateTime={new Date(a.at).toISOString()}>
              {dateFmt.format(new Date(a.at))}
            </time>
          </li>
        );
      })}
    </ul>
  );
}

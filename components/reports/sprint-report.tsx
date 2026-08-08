import Link from "next/link";
import { ReportPagination } from "@/components/reports/report-pagination";
import {
  SprintEventJournal,
  type SerializableEventPage,
} from "@/components/reports/sprint-event-journal";

type SerializableItem = {
  itemId: string | null;
  itemKey: string;
  itemTitle: string;
  itemType: "composant" | "epic" | "tache" | "soustache" | null;
  itemKind: "feature" | "bug" | null;
  firstJoinedAt: string;
  finalLeftAt: string | null;
  initialCommitment: boolean;
  addedAfterStart: boolean;
  removedAfterStart: boolean;
  estimateAtStart: number | null;
  estimateAtFinalParticipation: number | null;
  estimateAtCompletion: number | null;
  statusCategory: "todo" | "in_progress" | "done" | null;
  outcome: "completed" | "removed" | "carried_to_backlog" | "carried_to_sprint" | "incomplete";
  destinationSprint: { id: string | null; name: string } | null;
  section: "completed" | "incomplete" | "removed" | "carried";
};

type DetailedReport = {
  sprint: {
    id: string;
    name: string;
    goal: string | null;
    plannedStartAt: string | null;
    plannedEndAt: string | null;
    startedAt: string;
    completedAt: string | null;
  };
  metrics: {
    initialItemCount: number;
    committedPoints: number;
    initialUnestimatedCount: number;
    currentItemCount: number;
    currentScopePoints: number;
    currentUnestimatedCount: number;
    completedItemCount: number;
    completedPoints: number;
    grossPointsAdded: number;
    grossPointsRemoved: number;
    netEstimateDelta: number;
    scopeEventCount: number;
  };
  items: { page: number; pageSize: number; total: number; rows: SerializableItem[] };
  events: SerializableEventPage;
  sections: { completed: number; incomplete: number; removed: number; carried: number };
};

export type SerializableSprintReport =
  | ({ kind: "active"; statusLabel: "Données en cours" } & DetailedReport)
  | ({
      kind: "completed";
      statusLabel: "Historique figé";
      snapshotAt: string;
      finalDestinationSummary: {
        backlog: number;
        sprints: Array<{ id: string | null; name: string; count: number }>;
      };
    } & DetailedReport)
  | {
      kind: "legacy_unavailable";
      statusLabel: "Historique détaillé indisponible";
      sprint: {
        id: string;
        name: string;
        goal: string | null;
        state: "active" | "completed";
        startedAt: string;
        completedAt: string | null;
        hasSnapshot: boolean;
      };
    };

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const pointValue = (value: number | null) => value === null ? "Non estimé" : number.format(value);

function ItemRow({ backlogKey, item }: { backlogKey: string; item: SerializableItem }) {
  const identity = <>{item.itemKey} — {item.itemTitle}</>;
  return (
    <li className="space-y-1 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {item.itemId ? (
            <Link href={`/b/${backlogKey}?item=${encodeURIComponent(item.itemKey)}`} className="font-medium hover:underline">
              {identity}
            </Link>
          ) : (
            <p className="font-medium">{identity}</p>
          )}
          <p className="text-muted-foreground">
            {[item.itemKind, item.itemType, item.statusCategory ?? item.outcome].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span>{pointValue(item.estimateAtFinalParticipation)}{item.estimateAtFinalParticipation === null ? "" : " pts"}</span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {item.addedAfterStart ? <span>Ajouté après démarrage</span> : null}
        {item.removedAfterStart ? <span>Retiré après démarrage</span> : null}
        {item.initialCommitment && item.estimateAtStart !== item.estimateAtFinalParticipation ? (
          <span>{pointValue(item.estimateAtStart)} → {pointValue(item.estimateAtFinalParticipation)} pts</span>
        ) : null}
        {item.destinationSprint ? <span>Reporté vers {item.destinationSprint.name}</span> : null}
      </div>
    </li>
  );
}

const SECTION_LABELS = {
  completed: "Terminés",
  incomplete: "Non terminés",
  removed: "Retirés",
  carried: "Reportés",
} as const;

export function SprintReportView({
  backlogKey,
  report,
}: {
  backlogKey: string;
  report: SerializableSprintReport;
}) {
  const dateTime = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  if (report.kind === "legacy_unavailable") {
    return (
      <section className="space-y-3 rounded-xl border p-5">
        <h1 className="t-h1">{report.sprint.name}</h1>
        <p className="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium">
          {report.statusLabel}
        </p>
        {report.sprint.goal ? (
          <p className="text-sm text-muted-foreground">{report.sprint.goal}</p>
        ) : null}
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Démarré</dt>
            <dd>
              <time aria-label="Démarrage du sprint" dateTime={report.sprint.startedAt}>
                {dateTime.format(new Date(report.sprint.startedAt))}
              </time>
            </dd>
          </div>
          {report.sprint.completedAt ? (
            <div>
              <dt className="text-muted-foreground">Clôturé</dt>
              <dd>
                <time aria-label="Clôture du sprint" dateTime={report.sprint.completedAt}>
                  {dateTime.format(new Date(report.sprint.completedAt))}
                </time>
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="text-sm text-muted-foreground">
          Ce sprint précède l’historique fiable. Aucun total n’est reconstruit depuis les données actuelles.
        </p>
      </section>
    );
  }

  const path = `/b/${backlogKey}/reports`;
  const metrics = report.metrics;
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="t-h1">{report.sprint.name}</h1>
          <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{report.statusLabel}</span>
        </div>
        {report.sprint.goal ? <p className="text-sm text-muted-foreground">{report.sprint.goal}</p> : null}
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><dt className="text-muted-foreground">Démarré</dt><dd>{dateTime.format(new Date(report.sprint.startedAt))}</dd></div>
          {report.sprint.completedAt ? <div><dt className="text-muted-foreground">Clôturé</dt><dd>{dateTime.format(new Date(report.sprint.completedAt))}</dd></div> : null}
          {report.kind === "completed" ? (
            <div>
              <dt className="text-muted-foreground">Instantané</dt>
              <dd><time aria-label="Instantané du rapport" dateTime={report.snapshotAt}>{dateTime.format(new Date(report.snapshotAt))}</time></dd>
            </div>
          ) : null}
        </dl>
      </header>

      <section aria-label="Mesures du sprint" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <dl className="contents">
          <div className="rounded-xl border p-4"><dt className="font-medium">Engagement</dt><dd>{metrics.initialItemCount} éléments · {number.format(metrics.committedPoints)} pts · {metrics.initialUnestimatedCount} non estimé</dd></div>
          <div className="rounded-xl border p-4"><dt className="font-medium">Terminés</dt><dd>{metrics.completedItemCount} éléments · {number.format(metrics.completedPoints)} pts</dd></div>
          <div className="rounded-xl border p-4"><dt className="font-medium">{report.kind === "completed" ? "Périmètre final" : "Périmètre actuel"}</dt><dd>{metrics.currentItemCount} éléments · {number.format(metrics.currentScopePoints)} pts · {metrics.currentUnestimatedCount} non estimé</dd></div>
          <div className="rounded-xl border p-4"><dt className="font-medium">Évolution du périmètre</dt><dd>Ajoutés {number.format(metrics.grossPointsAdded)} pts · Retirés {number.format(metrics.grossPointsRemoved)} pts · Delta {number.format(metrics.netEstimateDelta)} pts · {metrics.scopeEventCount} événements</dd></div>
        </dl>
      </section>

      {report.kind === "active" && metrics.currentItemCount === 0 ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          Ce sprint actif ne contient encore aucun élément.
        </p>
      ) : report.kind === "active" &&
        metrics.currentUnestimatedCount === metrics.currentItemCount ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          Tous les éléments actuels de ce sprint sont non estimés.
        </p>
      ) : null}

      <section className="space-y-5" aria-labelledby="report-items-title">
        <h2 id="report-items-title" className="t-h2">Éléments du sprint</h2>
        {(Object.keys(SECTION_LABELS) as Array<keyof typeof SECTION_LABELS>).map((section) => {
          const total = report.sections[section];
          if (total === 0) return null;
          const label = `${SECTION_LABELS[section]} (${total})`;
          const rows = report.items.rows.filter((item) => item.section === section);
          return (
            <section key={section} role="region" aria-label={label} className="space-y-2">
              <h3 className="t-h3">{label}</h3>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun élément de cette catégorie sur cette page.</p>
              ) : (
                <ul className="divide-y rounded-xl border">{rows.map((item) => <ItemRow key={item.itemKey} backlogKey={backlogKey} item={item} />)}</ul>
              )}
            </section>
          );
        })}
        <ReportPagination
          ariaLabel="Pagination des éléments"
          page={report.items.page}
          pageSize={report.items.pageSize}
          total={report.items.total}
          href={(itemPage) => `${path}?${new URLSearchParams({
            report: "sprint",
            sprint: report.sprint.id,
            itemPage: String(itemPage),
            eventPage: String(report.events.page),
          }).toString()}`}
        />
      </section>

      <SprintEventJournal
        backlogKey={backlogKey}
        sprintId={report.sprint.id}
        itemPage={report.items.page}
        events={report.events}
      />
    </div>
  );
}

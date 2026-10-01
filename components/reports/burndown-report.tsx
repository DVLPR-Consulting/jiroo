import Link from "next/link";
import { ReportPagination } from "@/components/reports/report-pagination";
import { SprintEventJournal } from "@/components/reports/sprint-event-journal";
import type { BurndownInsufficientReason } from "@/lib/reports/burndown-calculations";
import type {
  SerializableBurndownPoint,
  SerializableBurndownReport,
  SerializableBurndownSprint,
} from "@/lib/reports/burndown-serialization";

export type { SerializableBurndownReport } from "@/lib/reports/burndown-serialization";

type DetailedReport = Exclude<SerializableBurndownReport, { kind: "legacy_unavailable" }>;

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const signed = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const dateTime = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const longDateTime = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const pts = (value: number) => `${number.format(value)} pts`;
const spokenDate = (iso: string) => `${longDateTime.format(new Date(iso))} UTC`;
const remainingWords = (value: number) =>
  `${number.format(value)} ${Math.abs(value) >= 2 ? "points restants" : "point restant"}`;

const INSUFFICIENT_REASON_COPY: Record<BurndownInsufficientReason, string> = {
  missing_target: "Date cible absente.",
  invalid_dates: "Dates du sprint incohérentes.",
  no_estimated_initial_work: "Aucun travail initial estimé.",
  just_started: "Le sprint vient de démarrer.",
  legacy_history: "Historique burndown indisponible.",
};

const CAUSE_LABELS: Record<SerializableBurndownPoint["cause"], string> = {
  start: "Démarrage du sprint",
  sprint_started: "Démarrage du sprint",
  sprint_completed: "Clôture du sprint",
  item_added: "Ajout",
  item_removed: "Retrait",
  estimate_changed: "Réestimation",
  item_completed: "Achèvement",
  item_reopened: "Réouverture",
};

const SCOPE_CHANGES = new Set<SerializableBurndownPoint["cause"]>([
  "item_added",
  "item_removed",
  "estimate_changed",
]);

function pointName(point: SerializableBurndownPoint) {
  const cause = CAUSE_LABELS[point.cause];
  return point.itemKey ? `${cause} de ${point.itemKey}` : cause;
}

function SprintIdentity({
  sprint,
  statusLabel,
}: {
  sprint: SerializableBurndownSprint;
  statusLabel: SerializableBurndownReport["statusLabel"];
}) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="t-h1">{sprint.name}</h1>
        <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{statusLabel}</span>
      </div>
      {sprint.goal ? <p className="text-sm text-muted-foreground">{sprint.goal}</p> : null}
      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Démarré</dt>
          <dd>
            <time aria-label="Démarrage du sprint" dateTime={sprint.startedAt}>
              {dateTime.format(new Date(sprint.startedAt))}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Date cible</dt>
          <dd>
            {sprint.plannedEndAt ? (
              <time aria-label="Date cible du sprint" dateTime={sprint.plannedEndAt}>
                {dateTime.format(new Date(sprint.plannedEndAt))}
              </time>
            ) : (
              "Aucune"
            )}
          </dd>
        </div>
        {sprint.completedAt ? (
          <div>
            <dt className="text-muted-foreground">Clôturé</dt>
            <dd>
              <time aria-label="Clôture du sprint" dateTime={sprint.completedAt}>
                {dateTime.format(new Date(sprint.completedAt))}
              </time>
            </dd>
          </div>
        ) : null}
      </dl>
    </header>
  );
}

const CHART = { width: 960, height: 320, left: 56, right: 24, top: 16, bottom: 40 };

function BurndownChart({ report }: { report: DetailedReport }) {
  const guideline = report.guideline.state === "available" ? report.guideline.points : null;
  const times = [
    ...report.displayPoints.map((point) => Date.parse(point.occurredAt)),
    ...(guideline ?? []).map((point) => Date.parse(point.occurredAt)),
  ];
  const t0 = Math.min(...times);
  const t1 = Math.max(t0 + 1, ...times);
  const yMax = Math.max(
    1,
    ...report.displayPoints.map((point) => point.remainingPoints),
    ...(guideline ?? []).map((point) => point.remainingPoints),
  );
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const x = (iso: string) => CHART.left + ((Date.parse(iso) - t0) / (t1 - t0)) * plotWidth;
  const y = (value: number) => CHART.top + (1 - value / yMax) * plotHeight;

  // Step line: remaining work holds its value until the next point.
  const actualPath = report.displayPoints
    .map((point, index) => index === 0
      ? `M ${x(point.occurredAt)} ${y(point.remainingPoints)}`
      : `H ${x(point.occurredAt)} V ${y(point.remainingPoints)}`)
    .join(" ");
  const guidelinePath = guideline
    ?.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.occurredAt)} ${y(point.remainingPoints)}`)
    .join(" ");

  const first = report.displayPoints[0]!;
  const last = report.displayPoints.at(-1)!;
  const actualLineLabel = `Travail restant réel, ligne continue : de ${remainingWords(first.remainingPoints)} le ${spokenDate(first.occurredAt)} à ${remainingWords(last.remainingPoints)} le ${spokenDate(last.occurredAt)}`;
  const guidelineLabel = guideline
    ? `Trajectoire idéale, ligne pointillée : de ${remainingWords(guideline[0]!.remainingPoints)} le ${spokenDate(guideline[0]!.occurredAt)} à ${remainingWords(guideline.at(-1)!.remainingPoints)} le ${spokenDate(guideline.at(-1)!.occurredAt)}`
    : null;

  // Synthetic display samples (no sequence, not the baseline) only shape the line.
  const markers = report.displayPoints
    .filter((point, index) => index === 0 || point.sequence !== null)
    .map((point, index) => ({
      key: `${index}-${point.occurredAt}-${point.sequence ?? "start"}`,
      x: x(point.occurredAt),
      y: y(point.remainingPoints),
      scopeChange: SCOPE_CHANGES.has(point.cause),
      accessibleLabel: `${pointName(point)}, ${spokenDate(point.occurredAt)} : ${remainingWords(point.remainingPoints)}`,
    }));
  const hasScopeChange = markers.some((marker) => marker.scopeChange);
  const hasPlainMarker = markers.some((marker) => !marker.scopeChange);

  return (
    <figure aria-labelledby="burndown-chart-title" className="space-y-3 rounded-xl border p-4">
      <figcaption id="burndown-chart-title" className="font-medium">
        Travail restant et trajectoire idéale
      </figcaption>
      <div data-testid="burndown-chart-scroll" className="max-w-full overflow-x-auto">
        <svg
          aria-labelledby="burndown-chart-title"
          focusable="false"
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          className="block h-auto w-full min-w-[640px] text-foreground"
        >
          <g aria-hidden="true" className="text-muted-foreground" fontSize="12" fill="currentColor">
            <line
              x1={CHART.left}
              x2={CHART.width - CHART.right}
              y1={y(0)}
              y2={y(0)}
              stroke="currentColor"
              strokeOpacity="0.4"
            />
            <text x={CHART.left - 8} y={y(yMax) + 4} textAnchor="end">{number.format(yMax)}</text>
            <text x={CHART.left - 8} y={y(0) + 4} textAnchor="end">0</text>
            <text x={CHART.left} y={CHART.height - 12}>{shortDate.format(new Date(t0))}</text>
            <text x={CHART.width - CHART.right} y={CHART.height - 12} textAnchor="end">
              {shortDate.format(new Date(t1))}
            </text>
          </g>
          <g role="list" aria-label="Points et lignes du burndown">
            <g role="listitem" aria-label={actualLineLabel}>
              <path d={actualPath} fill="none" stroke="currentColor" strokeWidth="2" />
            </g>
            {guidelinePath && guidelineLabel ? (
              <g role="listitem" aria-label={guidelineLabel} className="text-muted-foreground">
                <path
                  d={guidelinePath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
              </g>
            ) : null}
            {markers.map((marker) => (
              <g key={marker.key} role="listitem" aria-label={marker.accessibleLabel}>
                {marker.scopeChange ? (
                  <circle
                    cx={marker.x}
                    cy={marker.y}
                    r="5"
                    className="fill-background"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                ) : (
                  <circle cx={marker.x} cy={marker.y} r="3.5" fill="currentColor" />
                )}
              </g>
            ))}
          </g>
        </svg>
      </div>
      <ul aria-label="Légende du burndown" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <li className="flex items-center gap-2">
          <svg aria-hidden="true" width="24" height="8" className="text-foreground">
            <line x1="0" x2="24" y1="4" y2="4" stroke="currentColor" strokeWidth="2" />
          </svg>
          Ligne continue : travail restant réel
        </li>
        {guideline ? (
          <li className="flex items-center gap-2">
            <svg aria-hidden="true" width="24" height="8" className="text-muted-foreground">
              <line x1="0" x2="24" y1="4" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" />
            </svg>
            Ligne pointillée grise : trajectoire idéale
          </li>
        ) : null}
        {hasPlainMarker ? (
          <li className="flex items-center gap-2">
            <svg aria-hidden="true" width="12" height="12" className="text-foreground">
              <circle cx="6" cy="6" r="3.5" fill="currentColor" />
            </svg>
            Point plein : événement du sprint
          </li>
        ) : null}
        {hasScopeChange ? (
          <li className="flex items-center gap-2">
            <svg aria-hidden="true" width="14" height="14" className="text-foreground">
              <circle cx="7" cy="7" r="5" className="fill-background" stroke="currentColor" strokeWidth="2" />
            </svg>
            Cercle évidé : changement de périmètre
          </li>
        ) : null}
      </ul>
      {report.guideline.state === "unavailable" ? (
        <p className="text-sm text-muted-foreground">
          Trajectoire idéale indisponible : {INSUFFICIENT_REASON_COPY[report.guideline.reason]}
        </p>
      ) : null}
    </figure>
  );
}

function ExactValues({ backlogKey, report }: { backlogKey: string; report: DetailedReport }) {
  const path = `/b/${backlogKey}/reports`;
  const { baseline, eventPoints } = report;
  return (
    <section aria-labelledby="burndown-exact-title" className="space-y-3">
      <h2 id="burndown-exact-title" className="t-h2">Valeurs exactes</h2>
      <p id="burndown-baseline" className="text-sm">
        Restant au démarrage : <strong>{pts(baseline.remainingPoints)}</strong>
        {" · "}{baseline.unestimatedCount} non estimé{baseline.unestimatedCount > 1 ? "s" : ""}
        {" · "}
        <time dateTime={baseline.occurredAt}>{dateTime.format(new Date(baseline.occurredAt))}</time>
      </p>
      <div
        role="region"
        aria-labelledby="burndown-table-caption"
        tabIndex={0}
        className="max-w-full overflow-x-auto rounded-xl border focus-visible:outline-2"
      >
        <table aria-describedby="burndown-baseline" className="w-full min-w-[640px] text-left text-sm">
          <caption id="burndown-table-caption" className="sr-only">
            Valeurs exactes du burndown
          </caption>
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="p-3 font-medium">Date</th>
              <th scope="col" className="p-3 font-medium">Élément</th>
              <th scope="col" className="p-3 font-medium">Événement</th>
              <th scope="col" className="p-3 font-medium">Variation</th>
              <th scope="col" className="p-3 font-medium">Restant</th>
              <th scope="col" className="p-3 font-medium">Non estimés</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {eventPoints.rows.map((point) => {
              const identity = point.itemKey ? `${point.itemKey} — ${point.itemTitle ?? ""}` : null;
              return (
                <tr key={point.sequence ?? point.occurredAt}>
                  <td className="p-3 whitespace-nowrap">
                    <time dateTime={point.occurredAt}>{dateTime.format(new Date(point.occurredAt))}</time>
                  </td>
                  <td className="p-3">
                    {identity === null ? (
                      "—"
                    ) : point.itemId ? (
                      <Link
                        href={`/b/${backlogKey}?item=${encodeURIComponent(point.itemKey!)}`}
                        className="font-medium hover:underline"
                      >
                        {identity}
                      </Link>
                    ) : (
                      identity
                    )}
                  </td>
                  <td className="p-3">{CAUSE_LABELS[point.cause]}</td>
                  <td className="p-3 whitespace-nowrap">{signed.format(point.deltaPoints)} pts</td>
                  <td className="p-3 whitespace-nowrap">{pts(point.remainingPoints)}</td>
                  <td className="p-3">{point.unestimatedCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {eventPoints.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun événement après le démarrage.</p>
      ) : null}
      <ReportPagination
        ariaLabel="Pagination des valeurs exactes"
        page={eventPoints.page}
        pageSize={eventPoints.pageSize}
        total={eventPoints.total}
        href={(eventPage) => `${path}?${new URLSearchParams({
          report: "burndown",
          sprint: report.sprint.id,
          eventPage: String(eventPage),
        }).toString()}`}
      />
    </section>
  );
}

export function BurndownReportView({
  backlogKey,
  report,
}: {
  backlogKey: string;
  report: SerializableBurndownReport;
}) {
  const identity = <SprintIdentity sprint={report.sprint} statusLabel={report.statusLabel} />;
  if (report.kind === "legacy_unavailable") {
    return (
      <div className="space-y-4 rounded-xl border p-5">
        {identity}
        <p className="text-sm text-muted-foreground">
          Ce sprint précède l’historique fiable du burndown. Aucune courbe ni aucun total
          n’est reconstruit depuis les données actuelles.
        </p>
      </div>
    );
  }

  const { summary, trajectory, planningComparison: comparison } = report;
  return (
    <div className="space-y-8">
      {identity}

      <section aria-label="Mesures du burndown" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <dl className="contents">
          <div className="rounded-xl border p-4">
            <dt className="font-medium">Restant initial</dt>
            <dd>{pts(summary.initialRemainingPoints)}</dd>
          </div>
          <div className="rounded-xl border p-4">
            <dt className="font-medium">
              {report.kind === "completed" ? "Restant à la clôture" : "Restant actuel"}
            </dt>
            <dd>{pts(summary.remainingPoints)}</dd>
          </div>
          <div className="rounded-xl border p-4">
            <dt className="font-medium">Terminés</dt>
            <dd>{pts(summary.completedPoints)}</dd>
          </div>
          <div className="rounded-xl border p-4">
            <dt className="font-medium">Non estimés</dt>
            <dd>{summary.unestimatedCount}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="burndown-trajectory-title" className="space-y-2">
        <h2 id="burndown-trajectory-title" className="t-h2">Trajectoire</h2>
        <p className="font-medium">{trajectory.label}</p>
        {trajectory.insufficientReason ? (
          <p className="text-sm text-muted-foreground">
            {INSUFFICIENT_REASON_COPY[trajectory.insufficientReason]}
          </p>
        ) : report.kind === "active" ? (
          <p className="text-sm text-muted-foreground">
            Compare le travail restant actuel à une trajectoire idéale linéaire ; ce n’est pas
            une garantie de livraison.
          </p>
        ) : null}
        <p className="text-sm">
          {comparison.state === "ready"
            ? `Engagement ${pts(comparison.commitmentPoints)} · moyenne récente ${pts(comparison.averageCompletedPoints)} · écart ${signed.format(comparison.difference)} pts`
            : "Pas encore de vélocité comparable"}
        </p>
      </section>

      <BurndownChart report={report} />

      <ExactValues backlogKey={backlogKey} report={report} />

      <SprintEventJournal
        backlogKey={backlogKey}
        sprintId={report.sprint.id}
        itemPage={1}
        events={report.events}
        report="burndown"
      />
    </div>
  );
}

import Link from "next/link";
import { countLabel } from "@/lib/format/plural";

type SerializableVelocityReport = {
  state: "ready" | "empty";
  label: "Pas encore de vélocité" | null;
  limit: 7 | 12;
  bars: Array<{
    sprintId: string;
    sprintName: string;
    completedAt: string;
    committedPoints: number | null;
    completedPoints: number | null;
    includedInAverage: boolean;
    excludedReason: "no_point_data" | "history_unavailable" | null;
  }>;
  population: number;
  averageCompletedPoints: number | null;
};

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const exact = (value: number | null) => value === null ? "—" : number.format(value);
const spokenPoints = (value: number | null) =>
  value === null ? "— points" : countLabel(value, "point", "points", number.format);

export function VelocityReportView({
  backlogKey,
  report,
}: {
  backlogKey: string;
  report: SerializableVelocityReport;
}) {
  const path = `/b/${backlogKey}/reports`;
  const maximum = Math.max(
    1,
    report.averageCompletedPoints ?? 0,
    ...report.bars.flatMap((bar) => [bar.committedPoints ?? 0, bar.completedPoints ?? 0]),
  );
  const chartWidth = Math.max(480, report.bars.length * 96);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="t-h1">Vélocité</h1><p className="text-sm text-muted-foreground">Engagement et points terminés des sprints récents.</p></div>
        <nav aria-label="Nombre de sprints" className="flex gap-2 text-sm">
          {[7, 12].map((limit) => (
            <Link key={limit} href={`${path}?report=velocity&limit=${limit}`} aria-current={report.limit === limit ? "page" : undefined} className="rounded-full border px-2.5 py-1 aria-current:bg-muted">
              {limit} sprints
            </Link>
          ))}
        </nav>
      </header>
      {report.state === "empty" ? (
        <section className="space-y-2 rounded-xl border p-5">
          <h2 className="font-medium">{report.label}</h2>
          <p className="text-sm text-muted-foreground">
            La moyenne apparaîtra après un sprint figé contenant des données de points.
          </p>
        </section>
      ) : (
        <p className="font-medium">Moyenne des points terminés : {exact(report.averageCompletedPoints)} sur {countLabel(report.population, "sprint inclus", "sprints inclus")}</p>
      )}
      {report.bars.length > 0 ? <>
        <div className="overflow-x-auto rounded-xl border p-4">
        <svg role="group" aria-label="Graphique de vélocité" viewBox={`0 0 ${chartWidth} 240`} className="min-w-[480px]">
          {report.averageCompletedPoints !== null ? (
            <line x1="36" x2={chartWidth - 12} y1={200 - (report.averageCompletedPoints / maximum) * 160} y2={200 - (report.averageCompletedPoints / maximum) * 160} stroke="currentColor" strokeDasharray="4 4" />
          ) : null}
          {report.bars.map((bar, index) => {
            const x = 48 + index * 96;
            const committedHeight = ((bar.committedPoints ?? 0) / maximum) * 160;
            const completedHeight = ((bar.completedPoints ?? 0) / maximum) * 160;
            return (
              <g key={bar.sprintId} role="group" aria-label={`${bar.sprintName} — engagement ${spokenPoints(bar.committedPoints)}, terminé ${spokenPoints(bar.completedPoints)}`}>
                <rect x={x} y={200 - committedHeight} width="24" height={committedHeight} className="fill-muted-foreground" />
                <rect x={x + 28} y={200 - completedHeight} width="24" height={completedHeight} className="fill-primary" />
                <text x={x + 12} y={194 - committedHeight} textAnchor="middle" className="fill-foreground text-[10px]">{exact(bar.committedPoints)}</text>
                <text x={x + 40} y={194 - completedHeight} textAnchor="middle" className="fill-foreground text-[10px]">{exact(bar.completedPoints)}</text>
                <text x={x + 26} y="220" textAnchor="middle" className="fill-foreground text-[10px]">{bar.sprintName}</text>
              </g>
            );
          })}
        </svg>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Valeurs exactes de vélocité</caption>
          <thead><tr className="border-b text-left"><th>Sprint</th><th>Engagement</th><th>Terminé</th><th>Moyenne</th><th>Inclusion</th><th>Raison</th></tr></thead>
          <tbody>
            {report.bars.map((bar) => (
              <tr key={bar.sprintId} className="border-b">
                <th className="py-2 text-left font-medium"><Link href={`${path}?report=sprint&sprint=${bar.sprintId}`}>{bar.sprintName}</Link></th>
                <td>{exact(bar.committedPoints)}</td><td>{exact(bar.completedPoints)}</td><td>{exact(report.averageCompletedPoints)}</td>
                <td>{bar.includedInAverage ? "Incluse" : "Exclue"}</td>
                <td>{bar.excludedReason === "no_point_data" ? "Aucune donnée de points" : bar.excludedReason === "history_unavailable" ? "Historique détaillé indisponible" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </> : null}
    </div>
  );
}

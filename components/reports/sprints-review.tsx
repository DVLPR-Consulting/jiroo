import Link from "next/link";
import type { SprintsReview } from "@/lib/reports/bilan-calculations";

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const ratio = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const exact = (value: number | null) => value === null ? "—" : number.format(value);
const date = (day: string) => day.split("-").reverse().join("/");

/** Team-level figures only; closed ticket facts are frozen, presence is recalculated. */
export function SprintsReviewView({ backlogKey, report }: { backlogKey: string; report: SprintsReview }) {
  return (
    <section className="min-w-0 space-y-4">
      <header>
        <h1 className="t-h1">Bilan des sprints</h1>
        <p className="text-sm text-muted-foreground">L’engagement, les changements de périmètre et le travail terminé, sprint par sprint.</p>
      </header>
      {report.rows.length === 0 ? (
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Aucun sprint actif ou terminé.</p>
      ) : (
        <div role="region" aria-label="Bilan des sprints" tabIndex={0} className="overflow-x-auto rounded-xl border bg-card focus-visible:outline-2 focus-visible:outline-ring">
          <table className="w-full min-w-[960px] border-collapse text-sm tabular-nums [&_td]:px-3 [&_td]:py-3 [&_td]:text-right [&_td]:whitespace-nowrap">
            <caption className="sr-only">Bilan d’équipe : sprint actif puis sprints clos, du plus récent au plus ancien</caption>
            <thead className="text-muted-foreground">
              <tr className="border-b [&>th]:px-3 [&>th]:py-3 [&>th]:text-right [&>th]:font-medium">
                <th scope="col" className="w-48 min-w-40 text-left!">Sprint</th>
                <th scope="col">Présence</th>
                <th scope="col">Embarqués</th>
                <th scope="col">Ajoutés</th>
                <th scope="col">Retirés</th>
                <th scope="col">Terminés</th>
                <th scope="col">% terminés</th>
                <th scope="col">Points terminés</th>
                <th scope="col">Points par jour-personne</th>
                <th scope="col">Bugs</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.rows.map((row) => (
                <tr key={row.id} className={row.state === "active" ? "bg-muted/40" : undefined}>
                  <th scope="row" className="px-3 py-3 text-left font-medium">
                    <Link className="break-words hover:underline [overflow-wrap:anywhere]" href={`/b/${backlogKey}/reports?report=sprint&sprint=${row.id}`}>{row.name}</Link>
                    {row.state === "active" ? <span className="ml-2 inline-block rounded-full border px-2 py-0.5 text-xs font-normal">en cours</span> : null}
                    <span className="mt-1 block whitespace-nowrap text-xs font-normal text-muted-foreground">{date(row.start)} – {row.end ? date(row.end) : "fin inconnue"}</span>
                  </th>
                  <td>{row.presence === null ? "—" : `${exact(row.presence)} j-pers.`}</td>
                  <td>{exact(row.initial)}</td>
                  <td>{exact(row.added)}</td>
                  <td>{exact(row.removed)}</td>
                  <td>{exact(row.completed)}</td>
                  <td className={row.lowCompletion ? "font-medium text-destructive" : undefined}>{row.percentage === null ? "—" : `${exact(row.percentage)} %`}</td>
                  <td>{exact(row.completedPoints)}</td>
                  <td>{row.pointsPerPersonDay === null ? "—" : ratio.format(row.pointsPerPersonDay)}</td>
                  <td className={row.bugHeavy ? "font-medium text-destructive" : undefined}>{row.bugs === null || row.finalCount === null ? "—" : `${exact(row.bugs)} / ${exact(row.finalCount)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>Présence : jours ouvrés du sprint (lundi à vendredi hors jours fériés français, bornes incluses) × effectif assignable actuel, moins les absences déclarées, en demi-journées. Elle est recalculée, même pour les sprints clos. Sans accès à l’annuaire ou sans date de fin, elle reste inconnue.</p>
        <p>% terminés : tickets terminés sur le périmètre final (embarqués + ajoutés − retirés). Les ajouts et retraits comptent chaque mouvement du journal, y compris les réentrées. Bugs : tickets de nature « bug » sur le périmètre final.</p>
        <p>Rouge sous 60 % de terminés ou au-delà d’un tiers de bugs, seuils à discuter. Les chiffres des tickets sont figés à la clôture ; le sprint en cours reste provisoire. « — » indique une donnée inconnue ou un ratio sans dénominateur.</p>
        {report.limited ? <p>Ce bilan est limité aux 50 derniers sprints clos, plus le sprint actif.</p> : null}
      </div>
    </section>
  );
}

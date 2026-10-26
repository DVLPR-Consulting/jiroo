import Link from "next/link";
import { PageToolbar } from "@/components/shell/page-toolbar";
import { Button } from "@/components/ui/button";
import { countLabel } from "@/lib/format/plural";

type NavigationSprint = {
  id: string;
  name: string;
  state: "active" | "completed";
  hasSnapshot: boolean;
};

export function ReportNavigation({
  backlogKey,
  report,
  selectedSprintId,
  sprints,
  plannedCount,
}: {
  backlogKey: string;
  report: "sprint" | "velocity" | "burndown";
  selectedSprintId: string | null;
  sprints: NavigationSprint[];
  plannedCount: number;
}) {
  const path = `/b/${backlogKey}/reports`;
  // Sprint and Burndown present the same sprint: switching keeps it, pagination resets.
  const sprintQuery = selectedSprintId ? `&sprint=${selectedSprintId}` : "";
  return (
    <>
      {/* The tabs sit on the toolbar's rule, as the other pages' controls. */}
      <PageToolbar className="pb-0">
        <nav aria-label="Types de rapport" className="flex gap-2">
          <Link
            href={`${path}?report=sprint${sprintQuery}`}
            aria-current={report === "sprint" ? "page" : undefined}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm aria-current:border-primary aria-current:font-medium"
          >
            Rapport de sprint
          </Link>
          <Link
            href={`${path}?report=velocity&limit=7`}
            aria-current={report === "velocity" ? "page" : undefined}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm aria-current:border-primary aria-current:font-medium"
          >
            Vélocité
          </Link>
          <Link
            href={`${path}?report=burndown${sprintQuery}`}
            aria-current={report === "burndown" ? "page" : undefined}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm aria-current:border-primary aria-current:font-medium"
          >
            Burndown
          </Link>
        </nav>
      </PageToolbar>
      {report !== "velocity" ? (
        <div className="px-4 pt-4 sm:px-6">
          {sprints.length > 0 ? (
            <form
              aria-label="Choisir un sprint"
              action={path}
              method="get"
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="report" value={report} />
              <div className="grid gap-1">
                <label htmlFor="report-sprint" className="text-sm font-medium">Sprint</label>
                <select
                  id="report-sprint"
                  name="sprint"
                  defaultValue={selectedSprintId ?? sprints[0]?.id}
                  className="h-8 rounded-lg border bg-card px-2 text-sm"
                >
                  {sprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name}{sprint.state === "active" ? " — actif" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit">Afficher</Button>
            </form>
          ) : null}
          {sprints.length === 0 ? (
            <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              {plannedCount > 0
                ? `${countLabel(plannedCount, "sprint est planifié", "sprints sont planifiés")}, mais aucun n’a encore démarré.`
                : "Aucun sprint actif ou terminé."}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

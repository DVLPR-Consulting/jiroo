import Link from "next/link";
import { Button } from "@/components/ui/button";

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
  report: "sprint" | "velocity";
  selectedSprintId: string | null;
  sprints: NavigationSprint[];
  plannedCount: number;
}) {
  const path = `/b/${backlogKey}/reports`;
  return (
    <div className="space-y-4">
      <nav aria-label="Types de rapport" className="flex gap-2 border-b">
        <Link
          href={`${path}?report=sprint`}
          aria-current={report === "sprint" ? "page" : undefined}
          className="border-b-2 border-transparent px-3 py-2 text-sm aria-current:border-primary aria-current:font-medium"
        >
          Rapport de sprint
        </Link>
        <Link
          href={`${path}?report=velocity&limit=7`}
          aria-current={report === "velocity" ? "page" : undefined}
          className="border-b-2 border-transparent px-3 py-2 text-sm aria-current:border-primary aria-current:font-medium"
        >
          Vélocité
        </Link>
      </nav>
      {report === "sprint" && sprints.length > 0 ? (
        <form
          aria-label="Choisir un sprint"
          action={path}
          method="get"
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="report" value="sprint" />
          <div className="grid gap-1">
            <label htmlFor="report-sprint" className="text-sm font-medium">Sprint</label>
            <select
              id="report-sprint"
              name="sprint"
              defaultValue={selectedSprintId ?? sprints[0]?.id}
              className="h-8 rounded-lg border bg-background px-2 text-sm"
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
      {report === "sprint" && sprints.length === 0 ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          {plannedCount > 0
            ? `${plannedCount} ${plannedCount === 1 ? "sprint est planifié" : "sprints sont planifiés"}, mais aucun n’a encore démarré.`
            : "Aucun sprint actif ou terminé."}
        </p>
      ) : null}
    </div>
  );
}

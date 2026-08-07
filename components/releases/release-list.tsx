import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CreateReleaseDialog,
  EditReleaseDialog,
} from "@/components/releases/release-form-dialog";
import { ReleaseProgress } from "@/components/releases/release-progress";
import type { ReleaseCapabilities } from "@/lib/auth/capabilities";
import type { ReleaseSummary } from "@/lib/services/releases";
import type { StatusIdsByCategory } from "@/lib/services/statuses";

export type ReleasePersonOption = { id: string; name: string };

export function ReleaseList({
  backlog,
  releases,
  actor,
  driverOptions,
  canBrowseUsers,
  capabilities,
  statusIds,
}: {
  backlog: { id: string; key: string; name: string };
  releases: ReleaseSummary[];
  actor: ReleasePersonOption;
  driverOptions: ReleasePersonOption[];
  canBrowseUsers: boolean;
  capabilities: ReleaseCapabilities;
  statusIds: StatusIdsByCategory;
}) {
  if (releases.length === 0) {
    return (
      <EmptyState
        className="mx-auto py-20"
        icon={<PackageOpen className="size-5" />}
        title="Aucune version"
        description="Les versions permettent de planifier les livraisons et de suivre leur progression."
        action={
          capabilities.manage ? (
            <CreateReleaseDialog
              backlog={backlog}
              actor={actor}
              driverOptions={driverOptions}
              canBrowseUsers={canBrowseUsers}
            />
          ) : undefined
        }
      />
    );
  }

  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const formatDate = (value: string) => dateFormat.format(new Date(`${value}T00:00:00Z`));

  return (
    <div className="space-y-4">
      {capabilities.manage ? (
        <div className="flex justify-end">
          <CreateReleaseDialog
            backlog={backlog}
            actor={actor}
            driverOptions={driverOptions}
            canBrowseUsers={canBrowseUsers}
          />
        </div>
      ) : null}
      <ul className="space-y-3">
      {releases.map((release) => (
        <li key={release.id}>
          <article aria-label={release.name} className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <Link className="font-semibold hover:underline" href={`/b/${backlog.key}/releases/${release.id}`}>
                  {release.name}
                </Link>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border px-2 py-0.5 font-medium text-foreground">
                    {release.archived ? "Archivée" : release.released ? "Publiée" : "Non publiée"}
                  </span>
                  {release.overdue && !release.released ? (
                    <span className="rounded-full border border-destructive/40 px-2 py-0.5 text-destructive">En retard</span>
                  ) : null}
                  <span>Pilote : {release.driver?.name ?? "Non défini"}</span>
                </div>
              </div>
              {capabilities.manage ? (
                <EditReleaseDialog
                  backlog={backlog}
                  actor={actor}
                  driverOptions={driverOptions}
                  canBrowseUsers={canBrowseUsers}
                  release={release}
                />
              ) : null}
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div><dt className="text-muted-foreground">Début</dt><dd>{release.startDate ? formatDate(release.startDate) : "Non défini"}</dd></div>
              <div><dt className="text-muted-foreground">Date cible</dt><dd>{release.targetDate ? formatDate(release.targetDate) : "Non définie"}</dd></div>
              {release.effectiveReleaseDate ? <div><dt className="text-muted-foreground">Publication</dt><dd>{formatDate(release.effectiveReleaseDate)}</dd></div> : null}
            </dl>
            <ReleaseProgress
              backlogKey={backlog.key}
              releaseId={release.id}
              progress={release.progress}
              statusIds={statusIds}
            />
          </article>
        </li>
      ))}
      </ul>
    </div>
  );
}

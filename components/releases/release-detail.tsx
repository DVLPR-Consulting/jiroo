import Link from "next/link";
import { EditReleaseDialog } from "@/components/releases/release-form-dialog";
import { ReleaseLifecycleDialogs } from "@/components/releases/release-lifecycle-dialogs";
import { ReleaseProgress } from "@/components/releases/release-progress";
import type { ReleaseCapabilities } from "@/lib/auth/capabilities";
import type {
  PublicationSnapshotItem,
  ReleaseScopeItem,
  ReleaseSummary,
} from "@/lib/services/releases";
import type { StatusIdsByCategory } from "@/lib/services/statuses";

type Person = { id: string; name: string };
type Page<T> = { rows: T[]; total: number; page: number };
type SafeReleaseEvent = {
  id: string;
  publicationId: string | null;
  actorName: string;
  action: string;
  createdAt: string;
};
type SerializableRelease = ReleaseSummary & { createdAt: string; updatedAt: string };

const EVENT_LABELS: Record<string, string> = {
  release_created: "a créé la version",
  release_updated: "a modifié la version",
  release_published: "a publié la version",
  release_unreleased: "a annulé la publication",
  release_archived: "a archivé la version",
  release_unarchived: "a désarchivé la version",
};

function pointLabel(points: number | null) {
  if (points === null) return "Non estimé";
  return `${points} point${points > 1 ? "s" : ""}`;
}

function stateLabel(release: SerializableRelease) {
  if (release.archived) return "Archivée";
  if (release.released) return "Publiée";
  return "Non publiée";
}

function Pagination({
  page,
  total,
  pageParam,
  path,
  extra = {},
}: {
  page: number;
  total: number;
  pageParam: string;
  path: string;
  extra?: Record<string, string>;
}) {
  const lastPage = Math.max(1, Math.ceil(total / 20));
  if (lastPage === 1) return null;
  const href = (nextPage: number) => {
    const query = new URLSearchParams({ ...extra, [pageParam]: String(nextPage) });
    return `${path}?${query.toString()}`;
  };
  return (
    <nav aria-label={`Pagination ${pageParam}`} className="flex items-center gap-3 text-sm">
      {page > 1 ? <Link href={href(page - 1)}>Précédent</Link> : <span aria-disabled="true">Précédent</span>}
      <span>Page {page} sur {lastPage}</span>
      {page < lastPage ? <Link href={href(page + 1)}>Suivant</Link> : <span aria-disabled="true">Suivant</span>}
    </nav>
  );
}

export function ReleaseDetail({
  backlog,
  release,
  actor,
  driverOptions,
  canBrowseUsers,
  capabilities,
  statusIds,
  destinations,
  scope,
  events,
  snapshot,
  scopeFilters,
}: {
  backlog: { id: string; key: string; name: string };
  release: SerializableRelease;
  actor: Person;
  driverOptions: Person[];
  canBrowseUsers: boolean;
  capabilities: ReleaseCapabilities;
  statusIds: StatusIdsByCategory;
  destinations: Person[];
  scope: Page<ReleaseScopeItem>;
  events: Page<SafeReleaseEvent>;
  snapshot: (Page<PublicationSnapshotItem> & { publicationId: string }) | null;
  scopeFilters: {
    statusCategory: "todo" | "in_progress" | "done" | null;
    estimate: "estimated" | "unestimated" | null;
  };
}) {
  const path = `/b/${backlog.key}/releases/${release.id}`;
  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const formatDate = (value: string) => dateFormat.format(new Date(`${value}T00:00:00Z`));
  const snapshotState: Record<string, string> = snapshot
    ? {
        snapshot: snapshot.publicationId,
        snapshotPage: String(snapshot.page),
      }
    : {};
  const scopeFilterState: Record<string, string> = {
    ...(scopeFilters.statusCategory ? { scopeStatus: scopeFilters.statusCategory } : {}),
    ...(scopeFilters.estimate ? { scopeEstimate: scopeFilters.estimate } : {}),
  };
  const scopeHref = (
    statusCategory: typeof scopeFilters.statusCategory,
    estimate: typeof scopeFilters.estimate,
  ) => {
    const query = new URLSearchParams({
      ...(statusCategory ? { scopeStatus: statusCategory } : {}),
      ...(estimate ? { scopeEstimate: estimate } : {}),
      eventPage: String(events.page),
      ...snapshotState,
    });
    return `${path}?${query.toString()}`;
  };
  const incompleteCount = release.progress.todo + release.progress.inProgress;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
      <Link href={`/b/${backlog.key}/releases`} className="text-sm text-muted-foreground hover:text-foreground">
        ← Toutes les versions
      </Link>
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="t-h1">{release.name}</h1>
              <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                {stateLabel(release)}
              </span>
              {release.overdue && !release.released ? (
                <span className="rounded-full border border-destructive/40 px-2 py-0.5 text-xs text-destructive">
                  En retard
                </span>
              ) : null}
            </div>
            {release.description ? <p className="text-sm text-muted-foreground">{release.description}</p> : null}
          </div>
          {capabilities.manage ? (
            <div className="flex flex-wrap gap-2">
              <EditReleaseDialog
                backlog={backlog}
                actor={actor}
                driverOptions={driverOptions}
                canBrowseUsers={canBrowseUsers}
                release={release}
              />
              <ReleaseLifecycleDialogs
                backlog={backlog}
                release={release}
                destinations={destinations}
                canAssignItems={capabilities.assignItems}
              />
            </div>
          ) : null}
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><dt className="text-muted-foreground">Pilote</dt><dd>{release.driver?.name ?? "Non défini"}</dd></div>
          <div><dt className="text-muted-foreground">Début</dt><dd>{release.startDate ? formatDate(release.startDate) : "Non défini"}</dd></div>
          <div><dt className="text-muted-foreground">Date cible</dt><dd>{release.targetDate ? formatDate(release.targetDate) : "Non définie"}</dd></div>
          {release.effectiveReleaseDate ? (
            <div><dt className="text-muted-foreground">Publication</dt><dd>{formatDate(release.effectiveReleaseDate)}</dd></div>
          ) : null}
        </dl>
        <ReleaseProgress
          backlogKey={backlog.key}
          releaseId={release.id}
          progress={release.progress}
          statusIds={statusIds}
          detailHref={path}
        />
        {incompleteCount > 0 && !release.released ? (
          <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            {incompleteCount} éléments non terminés seront concernés au moment de la publication.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Terminé signifie que le statut appartient à la catégorie « Done » du workflow.
        </p>
      </header>

      <section role="region" aria-labelledby="current-scope-title" className="space-y-3">
        <h2 id="current-scope-title" className="t-h2">Périmètre actuel</h2>
        <p className="text-sm text-muted-foreground">
          Éléments actuellement associés à cette version.
        </p>
        <nav aria-label="Filtrer le périmètre" className="flex flex-wrap gap-2 text-sm">
          {([
            [null, "Tous les statuts"],
            ["todo", "À faire"],
            ["in_progress", "En cours"],
            ["done", "Terminés"],
          ] as const).map(([value, label]) => (
            <Link
              key={label}
              href={scopeHref(value, scopeFilters.estimate)}
              aria-current={scopeFilters.statusCategory === value ? "page" : undefined}
              className="rounded-full border px-2.5 py-1 aria-current:bg-muted"
            >
              {label}
            </Link>
          ))}
          {([
            [null, "Toutes les estimations"],
            ["estimated", "Estimés"],
            ["unestimated", "Non estimés"],
          ] as const).map(([value, label]) => (
            <Link
              key={label}
              href={scopeHref(scopeFilters.statusCategory, value)}
              aria-current={scopeFilters.estimate === value ? "page" : undefined}
              className="rounded-full border px-2.5 py-1 aria-current:bg-muted"
            >
              {label}
            </Link>
          ))}
        </nav>
        {scope.rows.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">Aucun élément associé.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {scope.rows.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <Link href={`/b/${backlog.key}?item=${item.key}`} className="font-medium hover:underline">
                    {item.key} — {item.title}
                  </Link>
                  <p className="text-muted-foreground">{item.status.name}</p>
                </div>
                <span>{pointLabel(item.estimatePoints)}</span>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={scope.page}
          total={scope.total}
          pageParam="scopePage"
          path={path}
          extra={{ eventPage: String(events.page), ...snapshotState, ...scopeFilterState }}
        />
      </section>

      <section role="region" aria-labelledby="snapshot-title" className="space-y-3">
        <h2 id="snapshot-title" className="t-h2">Instantané de publication</h2>
        <p className="text-sm text-muted-foreground">
          Copie immuable du périmètre et de son état au moment de la publication.
        </p>
        {snapshot === null ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">
            Aucun instantané de publication visible.
          </p>
        ) : snapshot.rows.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">
            Cet instantané ne contient aucun élément.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {snapshot.rows.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
                <div className="space-y-1">
                  <p className="font-medium">{item.itemKey} — {item.itemTitle}</p>
                  <p className="text-muted-foreground">{item.statusName}</p>
                  <p>{item.completed ? "Terminée à la publication" : "Non terminée à la publication"}</p>
                  <p>
                    {item.disposition === "moved"
                      ? `Déplacée vers ${item.destinationRelease?.name ?? "une autre version"}`
                      : "Conservée dans cette version"}
                  </p>
                </div>
                <span>{pointLabel(item.estimatePoints)}</span>
              </li>
            ))}
          </ul>
        )}
        {snapshot ? (
          <Pagination
            page={snapshot.page}
            total={snapshot.total}
            pageParam="snapshotPage"
            path={path}
            extra={{
              snapshot: snapshot.publicationId,
              scopePage: String(scope.page),
              eventPage: String(events.page),
              ...scopeFilterState,
            }}
          />
        ) : null}
      </section>

      <section role="region" aria-labelledby="history-title" className="space-y-3">
        <h2 id="history-title" className="t-h2">Historique</h2>
        {events.rows.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">Aucun événement.</p>
        ) : (
          <ol className="divide-y rounded-xl border">
            {events.rows.map((event) => (
              <li key={event.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                <div className="space-y-1">
                  <p>{event.actorName} {EVENT_LABELS[event.action] ?? "a modifié la version"}</p>
                  {event.publicationId ? (
                    <Link
                      className="text-xs underline-offset-2 hover:underline"
                      href={`${path}?${new URLSearchParams({
                        snapshot: event.publicationId,
                        scopePage: String(scope.page),
                        eventPage: String(events.page),
                        ...scopeFilterState,
                      }).toString()}`}
                    >
                      Voir l’instantané
                    </Link>
                  ) : null}
                </div>
                <time dateTime={event.createdAt} className="text-muted-foreground">
                  {dateTimeFormat.format(new Date(event.createdAt))}
                </time>
              </li>
            ))}
          </ol>
        )}
        <Pagination
          page={events.page}
          total={events.total}
          pageParam="eventPage"
          path={path}
          extra={{ scopePage: String(scope.page), ...snapshotState, ...scopeFilterState }}
        />
      </section>
    </div>
  );
}

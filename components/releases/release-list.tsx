"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, PackageOpen } from "lucide-react";
import { reorderReleaseAction } from "@/app/actions/releases";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CreateReleaseDialog,
  EditReleaseDialog,
} from "@/components/releases/release-form-dialog";
import { ReleaseProgress } from "@/components/releases/release-progress";
import { ReleaseLifecycleDialogs } from "@/components/releases/release-lifecycle-dialogs";
import { ReleaseMergeDeleteDialog } from "@/components/releases/release-merge-delete-dialog";
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
  showArchived,
}: {
  backlog: { id: string; key: string; name: string };
  releases: ReleaseSummary[];
  actor: ReleasePersonOption;
  driverOptions: ReleasePersonOption[];
  canBrowseUsers: boolean;
  capabilities: ReleaseCapabilities;
  statusIds: StatusIdsByCategory;
  showArchived: boolean;
}) {
  const archivedToggle = (
    <Link
      className="text-sm underline-offset-2 hover:underline"
      href={showArchived ? `/b/${backlog.key}/releases` : `/b/${backlog.key}/releases?archived=1`}
    >
      {showArchived ? "Masquer les versions archivées" : "Afficher les versions archivées"}
    </Link>
  );
  if (releases.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{archivedToggle}</div>
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
      </div>
    );
  }

  return (
    <OrderedReleaseList
      backlog={backlog}
      releases={releases}
      actor={actor}
      driverOptions={driverOptions}
      canBrowseUsers={canBrowseUsers}
      capabilities={capabilities}
      statusIds={statusIds}
      showArchived={showArchived}
      archivedToggle={archivedToggle}
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

type ListProps = Parameters<typeof ReleaseList>[0] & { archivedToggle: React.ReactNode };

/**
 * Manual order (Jira's single version sequence): drag handle, keyboard sensor and
 * Monter/Descendre, only for managers and only in the default view (archived
 * versions hidden). The order is optimistic and rolled back on failure.
 */
function OrderedReleaseList({
  backlog,
  releases,
  actor,
  driverOptions,
  canBrowseUsers,
  capabilities,
  statusIds,
  showArchived,
  archivedToggle,
}: ListProps) {
  const router = useRouter();
  const [ordering, setOrdering] = useState({ source: releases, rendered: releases });
  const [rankError, setRankError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const latestReleases = useRef(releases);
  useEffect(() => {
    latestReleases.current = releases;
  }, [releases]);
  // Adopt fresh server data (order, revisions) whenever the page re-renders.
  if (ordering.source !== releases) setOrdering({ source: releases, rendered: releases });
  const rendered = ordering.source === releases ? ordering.rendered : releases;
  const setRendered = (next: ReleaseSummary[]) =>
    setOrdering((current) => ({ ...current, rendered: next }));
  // Controls stay disabled until the refreshed revisions arrive (no stale move).
  const pending = saving || refreshing;
  const canReorder = capabilities.manage && !showArchived;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const targets = releases
    .filter((candidate) => !candidate.archived)
    .map(({ id, name, revision, released }) => ({ id, name, revision, released }));

  function move(releaseId: string, toIndex: number) {
    const fromIndex = rendered.findIndex((release) => release.id === releaseId);
    if (fromIndex < 0 || toIndex < 0 || toIndex >= rendered.length || toIndex === fromIndex) return;
    const moved = rendered[fromIndex]!;
    const next = arrayMove(rendered, fromIndex, toIndex);
    setRendered(next);
    setRankError(null);
    setSaving(true);
    reorderReleaseAction({
      backlogId: backlog.id,
      backlogKey: backlog.key,
      releaseId: moved.id,
      expectedRevision: moved.revision,
      beforeId: next[toIndex - 1]?.id ?? null,
      afterId: next[toIndex + 1]?.id ?? null,
    })
      .then((result) => {
        if (!result.ok) {
          // Roll back to the latest server order, never to an older snapshot.
          setRendered(latestReleases.current);
          setRankError(result.error);
          return;
        }
        setRendered(
          next.map((release) =>
            release.id === moved.id ? { ...release, revision: result.result.revision } : release,
          ),
        );
        startRefresh(() => router.refresh());
      })
      .catch(() => {
        setRendered(latestReleases.current);
        setRankError("Réordonnancement impossible.");
      })
      .finally(() => setSaving(false));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    move(String(active.id), rendered.findIndex((release) => release.id === String(over.id)));
  }

  const names = new Map(rendered.map((release) => [release.id, release.name]));
  const position = (id: string | number) => rendered.findIndex((release) => release.id === String(id)) + 1;

  return (
    <div className="space-y-4">
      {capabilities.manage ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {archivedToggle}
          <CreateReleaseDialog
            backlog={backlog}
            actor={actor}
            driverOptions={driverOptions}
            canBrowseUsers={canBrowseUsers}
          />
        </div>
      ) : <div className="flex justify-end">{archivedToggle}</div>}
      {capabilities.manage && showArchived ? (
        <p className="text-sm text-muted-foreground">
          Masquez les versions archivées pour modifier l’ordre des versions.
        </p>
      ) : null}
      <div aria-live="polite">
        {rankError ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
            {rankError}
          </p>
        ) : null}
      </div>
      <DndContext
        id={`release-order-${backlog.id}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={canReorder ? onDragEnd : undefined}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Appuyez sur espace pour saisir une version, utilisez les flèches verticales, puis espace pour déposer ou Échap pour annuler.",
          },
          announcements: {
            onDragStart: ({ active }) => `${names.get(String(active.id)) ?? "Version"} saisie.`,
            onDragOver: ({ active, over }) =>
              over ? `${names.get(String(active.id))}, position ${position(over.id)} sur ${rendered.length}.` : undefined,
            onDragEnd: ({ active, over }) =>
              over
                ? `${names.get(String(active.id))} déposée en position ${position(over.id)} sur ${rendered.length}.`
                : "Réordonnancement annulé.",
            onDragCancel: () => "Réordonnancement annulé.",
          },
        }}
      >
        <SortableContext items={rendered.map((release) => release.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-3">
            {rendered.map((release, index) => (
              <SortableReleaseCard
                key={release.id}
                backlog={backlog}
                release={release}
                releases={releases}
                actor={actor}
                driverOptions={driverOptions}
                canBrowseUsers={canBrowseUsers}
                capabilities={capabilities}
                statusIds={statusIds}
                targets={targets.filter((target) => target.id !== release.id)}
                reorder={
                  canReorder
                    ? {
                        disabled: pending,
                        isFirst: index === 0,
                        isLast: index === rendered.length - 1,
                        up: () => move(release.id, index - 1),
                        down: () => move(release.id, index + 1),
                      }
                    : null
                }
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableReleaseCard({
  backlog,
  release,
  releases,
  actor,
  driverOptions,
  canBrowseUsers,
  capabilities,
  statusIds,
  targets,
  reorder,
}: {
  backlog: ListProps["backlog"];
  release: ReleaseSummary;
  releases: ReleaseSummary[];
  actor: ReleasePersonOption;
  driverOptions: ReleasePersonOption[];
  canBrowseUsers: boolean;
  capabilities: ReleaseCapabilities;
  statusIds: StatusIdsByCategory;
  targets: Array<{ id: string; name: string; revision: number; released: boolean }>;
  reorder: null | {
    disabled: boolean;
    isFirst: boolean;
    isLast: boolean;
    up: () => void;
    down: () => void;
  };
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: release.id, disabled: !reorder || reorder.disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
    >
      <article aria-label={release.name} className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            {reorder ? (
              <button
                type="button"
                ref={setActivatorNodeRef}
                aria-label={`Réordonner ${release.name}`}
                className="mt-0.5 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...attributes}
                {...listeners}
              >
                <GripVertical aria-hidden className="size-4" />
              </button>
            ) : null}
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
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {reorder ? (
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={`Monter ${release.name}`}
                  disabled={reorder.disabled || reorder.isFirst}
                  onClick={reorder.up}
                >
                  <ArrowUp aria-hidden className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={`Descendre ${release.name}`}
                  disabled={reorder.disabled || reorder.isLast}
                  onClick={reorder.down}
                >
                  <ArrowDown aria-hidden className="size-4" />
                </Button>
              </div>
            ) : null}
            {capabilities.manage ? (
              <details className="rounded-lg border p-2">
                <summary className="cursor-pointer text-sm font-medium">
                  Actions pour {release.name}
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
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
                    destinations={releases
                      .filter((candidate) => candidate.id !== release.id && !candidate.archived && !candidate.released)
                      .map(({ id, name }) => ({ id, name }))}
                    canAssignItems={capabilities.assignItems}
                  />
                  <ReleaseMergeDeleteDialog mode="merge" backlog={backlog} release={release} targets={targets} />
                  <ReleaseMergeDeleteDialog mode="delete" backlog={backlog} release={release} targets={targets} />
                </div>
              </details>
            ) : null}
          </div>
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
          detailHref={`/b/${backlog.key}/releases/${release.id}`}
        />
        <p className="text-sm font-medium">
          {release.progress.todo + release.progress.inProgress}{" "}
          {release.progress.todo + release.progress.inProgress === 1
            ? "élément non terminé"
            : "éléments non terminés"}
        </p>
      </article>
    </li>
  );
}

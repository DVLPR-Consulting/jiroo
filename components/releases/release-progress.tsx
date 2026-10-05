import Link from "next/link";
import type { ReleaseProgress as ReleaseProgressDto } from "@/lib/services/releases";
import type { StatusIdsByCategory } from "@/lib/services/statuses";
import { countLabel, formatPoints } from "@/lib/format/plural";

const SEGMENTS = [
  { key: "todo", label: "À faire", color: "bg-slate-400" },
  { key: "inProgress", label: "En cours", color: "bg-amber-500" },
  { key: "done", label: "Terminés", color: "bg-emerald-600" },
] as const;

export function ReleaseProgress({
  backlogKey,
  releaseId,
  progress,
  statusIds,
  detailHref,
}: {
  backlogKey: string;
  releaseId: string;
  progress: ReleaseProgressDto;
  statusIds: StatusIdsByCategory;
  detailHref?: string;
}) {
  if (progress.total === 0) {
    return <p className="text-sm text-muted-foreground">Aucun élément associé</p>;
  }

  const baseHref = `/b/${backlogKey}?view=list&version=${releaseId}`;
  return (
    <div className="space-y-2" aria-label={`Progression de la version : ${progress.done} sur ${progress.total}`}>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {SEGMENTS.map(({ key, color }) => (
          <span
            key={key}
            className={color}
            style={{ width: `${(progress[key] / progress.total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {SEGMENTS.map(({ key, label }) => {
          const ids = statusIds[key];
          const labelWithCount = `${label} : ${progress[key]}`;
          return ids.length > 0 ? (
            <Link key={key} href={`${baseHref}&status=${ids.join(",")}`} className="underline-offset-2 hover:underline">
              {labelWithCount}
            </Link>
          ) : (
            <span key={key}>{labelWithCount}</span>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {detailHref ? (
          <Link className="underline-offset-2 hover:underline" href={detailHref}>
            {progress.done} terminés sur {progress.total}
          </Link>
        ) : <span>{progress.done} terminés sur {progress.total}</span>}
        {detailHref ? (
          <>
            <Link
              className="underline-offset-2 hover:underline"
              href={`${detailHref}?scopeStatus=done&scopeEstimate=estimated`}
            >
              {countLabel(progress.donePoints, "point terminé", "points terminés", formatPoints)}
            </Link>
            <span aria-hidden>/</span>
            <Link className="underline-offset-2 hover:underline" href={`${detailHref}?scopeEstimate=estimated`}>
              {countLabel(progress.totalPoints, "point estimé", "points estimés", formatPoints)}
            </Link>
          </>
        ) : <span>{formatPoints(progress.donePoints)} / {countLabel(progress.totalPoints, "point", "points", formatPoints)}</span>}
        {progress.unestimated > 0 ? (
          detailHref ? (
            <Link className="underline-offset-2 hover:underline" href={`${detailHref}?scopeEstimate=unestimated`}>
              {countLabel(progress.unestimated, "non estimé", "non estimés")}
            </Link>
          ) : <span>{countLabel(progress.unestimated, "non estimé", "non estimés")}</span>
        ) : null}
      </div>
    </div>
  );
}

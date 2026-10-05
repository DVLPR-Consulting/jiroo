"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteReleaseAction, mergeReleaseAction } from "@/app/actions/releases";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { countLabel } from "@/lib/format/plural";

const SELECT =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type MergeDeleteRelease = {
  id: string;
  name: string;
  revision: number;
  publicationCount: number;
  /** Every affected link, including links of trashed items. */
  removalScope: { revision: string; linkedCount: number; trashedCount: number };
};

/** Candidate targets: non-archived versions of the backlog, other than the source. */
export type MergeDeleteTarget = { id: string; name: string; revision: number; released: boolean };

type Disposition = "" | "transfer" | "remove";

export function ReleaseMergeDeleteDialog({
  mode,
  backlog,
  release,
  targets,
  afterSuccessHref,
  onRemoved,
}: {
  mode: "merge" | "delete";
  backlog: { id: string; key: string };
  release: MergeDeleteRelease;
  targets: MergeDeleteTarget[];
  /** Where to navigate after success (e.g. from the deleted version's own page). */
  afterSuccessHref?: string;
  /** Called once the version is gone, before the page refreshes (focus handling). */
  onRemoved?: (releaseId: string) => void;
}) {
  const router = useRouter();
  const prefix = useId();
  const merge = mode === "merge";
  const [open, setOpen] = useState(false);
  const initialPreview = () => ({
    scopeRevision: release.removalScope.revision,
    linkedCount: release.removalScope.linkedCount,
    trashedCount: release.removalScope.trashedCount,
  });
  const [preview, setPreview] = useState(initialPreview);
  const [stalePreview, setStalePreview] = useState<null | {
    scopeRevision: string;
    linkedCount: number;
    trashedCount: number;
  }>(null);
  const [disposition, setDisposition] = useState<Disposition>("");
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasLinks = preview.linkedCount > 0;
  const needsTarget = merge || disposition === "transfer";
  const target = targets.find((candidate) => candidate.id === targetId);
  const canSubmit =
    !stalePreview &&
    (merge ? Boolean(target) : !hasLinks || (disposition !== "" && (!needsTarget || Boolean(target))));
  const label = merge ? "Fusionner" : "Supprimer";
  const fallback = merge ? "Fusion impossible." : "Suppression impossible.";

  function reset() {
    setPreview(initialPreview());
    setStalePreview(null);
    setDisposition("");
    setTargetId("");
    setError(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = merge
          ? await mergeReleaseAction({
              backlogId: backlog.id,
              backlogKey: backlog.key,
              sourceReleaseId: release.id,
              expectedSourceRevision: release.revision,
              expectedScopeRevision: preview.scopeRevision,
              targetReleaseId: target!.id,
              expectedTargetRevision: target!.revision,
            })
          : await deleteReleaseAction({
              backlogId: backlog.id,
              backlogKey: backlog.key,
              releaseId: release.id,
              expectedRevision: release.revision,
              expectedScopeRevision: preview.scopeRevision,
              fixVersions: !hasLinks
                ? { disposition: "none" }
                : disposition === "transfer"
                  ? {
                      disposition: "transfer",
                      targetReleaseId: target!.id,
                      expectedTargetRevision: target!.revision,
                    }
                  : { disposition: "remove" },
            });
        if (!result.ok) {
          setError(result.error);
          if ("reason" in result && result.reason === "stale_scope") {
            setStalePreview({
              scopeRevision: result.currentScopeRevision,
              linkedCount: result.currentLinkedCount,
              trashedCount: result.currentTrashedCount,
            });
          }
          return;
        }
        setOpen(false);
        onRemoved?.(release.id);
        toast.success(merge ? `${release.name} fusionnée dans ${target!.name}.` : "Version supprimée.");
        if (afterSuccessHref) router.push(afterSuccessHref);
        else router.refresh();
      } catch {
        setError(fallback);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Keep the dialog open while a request is in flight.
        if (!next && pending) return;
        // Start from the latest server preview each time the dialog opens.
        reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={merge ? "outline" : "destructive"} aria-label={`${label} ${release.name}`}>
          {label}…<span className="sr-only"> {release.name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {label} {release.name}
          </DialogTitle>
          <DialogDescription>
            {merge
              ? `Les éléments de ${release.name} seront associés à la version choisie, puis ${release.name} sera supprimée.`
              : "La version sera supprimée définitivement."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div aria-live="polite">
            {error ? (
              <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <ul className="space-y-1 text-sm">
            <li className="font-medium">
              {hasLinks
                ? `${countLabel(preview.linkedCount, "élément lié", "éléments liés")}${
                    preview.trashedCount > 0 ? `, dont ${preview.trashedCount} dans la corbeille` : ""
                  }`
                : "Aucun élément lié"}
            </li>
            {release.publicationCount > 0 ? (
              <li className="text-muted-foreground">
                {countLabel(release.publicationCount, "publication conservée", "publications conservées")}{" "}
                dans l’historique (avec son nom), mais plus consultables depuis cette version.
              </li>
            ) : null}
          </ul>
          {!merge && hasLinks ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Fix versions des éléments liés</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${prefix}-disposition`}
                  value="transfer"
                  checked={disposition === "transfer"}
                  onChange={() => setDisposition("transfer")}
                />
                Transférer vers une autre version
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${prefix}-disposition`}
                  value="remove"
                  checked={disposition === "remove"}
                  onChange={() => setDisposition("remove")}
                />
                Retirer la version des éléments
              </label>
            </fieldset>
          ) : null}
          {needsTarget && (merge || hasLinks) ? (
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-target`}>Version de destination</Label>
              {targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune autre version disponible.</p>
              ) : null}
              <select
                id={`${prefix}-target`}
                className={SELECT}
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
              >
                <option value="">Sélectionner une version</option>
                {targets.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
              {target?.released ? (
                <p className="text-sm text-muted-foreground">
                  {target.name} est publiée : le périmètre actuel de {target.name} changera, ses
                  instantanés de publication restent inchangés.
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            {stalePreview ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPreview(stalePreview);
                  setStalePreview(null);
                  setDisposition("");
                  setError(null);
                  router.refresh();
                }}
              >
                Examiner l’impact actualisé
              </Button>
            ) : null}
            <Button
              type="submit"
              variant={merge ? "default" : "destructive"}
              disabled={pending || !canSubmit}
              aria-busy={pending || undefined}
            >
              {pending ? "Traitement…" : label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiveReleaseAction,
  publishReleaseAction,
  unarchiveReleaseAction,
  unreleaseReleaseAction,
} from "@/app/actions/releases";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { countLabel } from "@/lib/format/plural";

const SELECT =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Backlog = { id: string; key: string };
type LifecycleRelease = {
  id: string;
  name: string;
  revision: number;
  publicationScopeRevision: string;
  released: boolean;
  archived: boolean;
  progress: { todo: number; inProgress: number };
};
type Destination = { id: string; name: string };
type RevisionAction = "archive" | "unarchive" | "unrelease";

function PublishDialog({
  backlog,
  release,
  destinations,
  canAssignItems,
}: {
  backlog: Backlog;
  release: LifecycleRelease;
  destinations: Destination[];
  canAssignItems: boolean;
}) {
  const router = useRouter();
  const prefix = useId();
  const incompleteCount = release.progress.todo + release.progress.inProgress;
  const defaultDisposition = incompleteCount === 0 ? "keep" : "";
  const [open, setOpen] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [disposition, setDisposition] = useState<"" | "keep" | "move">(defaultDisposition);
  const [destinationReleaseId, setDestinationReleaseId] = useState("");
  const [preview, setPreview] = useState({
    scopeRevision: release.publicationScopeRevision,
    incompleteCount,
  });
  const [stalePreview, setStalePreview] = useState<null | {
    scopeRevision: string;
    incompleteCount: number;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setEffectiveDate("");
    setDisposition(defaultDisposition);
    setDestinationReleaseId("");
    setPreview({ scopeRevision: release.publicationScopeRevision, incompleteCount });
    setStalePreview(null);
    setError(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!effectiveDate || !disposition || (disposition === "move" && !destinationReleaseId)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await publishReleaseAction({
          backlogId: backlog.id,
          backlogKey: backlog.key,
          releaseId: release.id,
          expectedRevision: release.revision,
          expectedScopeRevision: preview.scopeRevision,
          effectiveDate,
          incompleteDisposition: disposition,
          ...(disposition === "move" ? { destinationReleaseId } : {}),
        });
        if (!result.ok) {
          setError(result.error);
          if ("reason" in result && result.reason === "stale_scope") {
            setStalePreview({
              scopeRevision: result.currentScopeRevision,
              incompleteCount: result.currentIncompleteCount,
            });
          }
          return;
        }
        reset();
        setOpen(false);
        toast.success("Release publiée.");
        router.refresh();
      } catch {
        setError("Publication impossible.");
      }
    });
  }

  const canSubmit = Boolean(
    effectiveDate
      && disposition
      && (disposition !== "move" || destinationReleaseId)
      && !stalePreview,
  );

  const previewIncompleteCount = preview.incompleteCount;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" aria-label={`Publier ${release.name}`}>
          Publier<span className="sr-only"> {release.name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publier {release.name}</DialogTitle>
          <DialogDescription>
            {previewIncompleteCount === 0
              ? "Aucun élément non terminé : le périmètre sera conservé."
              : `Choisissez le traitement de ${countLabel(previewIncompleteCount, "élément non terminé", "éléments non terminés")}.`}
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
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-effective-date`}>Date de publication</Label>
            <Input
              id={`${prefix}-effective-date`}
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
            />
          </div>
          {previewIncompleteCount > 0 ? <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Éléments non terminés</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${prefix}-disposition`}
                value="keep"
                checked={disposition === "keep"}
                onChange={() => setDisposition("keep")}
              />
              Conserver dans cette version
              <span className="text-muted-foreground">Ils resteront associés après publication.</span>
            </label>
            {canAssignItems ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${prefix}-disposition`}
                  value="move"
                  checked={disposition === "move"}
                  onChange={() => setDisposition("move")}
                />
                Déplacer vers une autre version
                <span className="text-muted-foreground">Ils quitteront cette release.</span>
              </label>
            ) : null}
          </fieldset> : null}
          <p className="text-sm text-muted-foreground">
            Terminé signifie que le statut appartient à la catégorie « Done » du workflow.
          </p>
          {previewIncompleteCount > 0 && canAssignItems && disposition === "move" ? (
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-destination`}>Version de destination</Label>
              <select
                id={`${prefix}-destination`}
                className={SELECT}
                value={destinationReleaseId}
                onChange={(event) => setDestinationReleaseId(event.target.value)}
              >
                <option value="">Sélectionner une version</option>
                {destinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>{destination.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          <DialogFooter>
            {stalePreview ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPreview(stalePreview);
                  setDisposition(stalePreview.incompleteCount === 0 ? "keep" : "");
                  setDestinationReleaseId("");
                  setStalePreview(null);
                  setError(null);
                  router.refresh();
                }}
              >
                Examiner le périmètre actualisé
              </Button>
            ) : null}
            <Button type="submit" disabled={pending || !canSubmit} aria-busy={pending || undefined}>
              {pending ? "Publication…" : "Publier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const REVISION_COPY: Record<RevisionAction, {
  trigger: string;
  title: string;
  description: string;
  confirm: string;
  fallback: string;
  success: string;
}> = {
  archive: {
    trigger: "Archiver",
    title: "Archiver",
    description: "La version restera consultable et pourra être désarchivée.",
    confirm: "Confirmer l’archivage",
    fallback: "Archivage impossible.",
    success: "Release archivée.",
  },
  unarchive: {
    trigger: "Désarchiver",
    title: "Désarchiver",
    description: "La version redeviendra active.",
    confirm: "Confirmer le désarchivage",
    fallback: "Désarchivage impossible.",
    success: "Release désarchivée.",
  },
  unrelease: {
    trigger: "Annuler la publication",
    title: "Annuler la publication",
    description: "L’instantané publié reste dans l’historique de la version.",
    confirm: "Confirmer l’annulation",
    fallback: "Dépublication impossible.",
    success: "Publication annulée.",
  },
};

function RevisionActionDialog({
  action,
  backlog,
  release,
}: {
  action: RevisionAction;
  backlog: Backlog;
  release: LifecycleRelease;
}) {
  const router = useRouter();
  const copy = REVISION_COPY[action];
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const input = {
        backlogId: backlog.id,
        backlogKey: backlog.key,
        releaseId: release.id,
        expectedRevision: release.revision,
      };
      try {
        const result = action === "archive"
          ? await archiveReleaseAction(input)
          : action === "unarchive"
            ? await unarchiveReleaseAction(input)
            : await unreleaseReleaseAction(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        toast.success(copy.success);
        router.refresh();
      } catch {
        setError(copy.fallback);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={action === "archive" ? "destructive" : "outline"}
          aria-label={`${copy.trigger} ${release.name}`}
        >
          {copy.trigger}<span className="sr-only"> {release.name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title} {release.name}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div aria-live="polite">
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant={action === "archive" ? "destructive" : "default"}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={submit}
          >
            {pending ? "Traitement…" : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReleaseLifecycleDialogs({
  backlog,
  release,
  destinations,
  canAssignItems,
}: {
  backlog: Backlog;
  release: LifecycleRelease;
  destinations: Destination[];
  canAssignItems: boolean;
}) {
  if (release.archived) {
    return <RevisionActionDialog action="unarchive" backlog={backlog} release={release} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {release.released ? (
        <RevisionActionDialog action="unrelease" backlog={backlog} release={release} />
      ) : (
        <PublishDialog
          backlog={backlog}
          release={release}
          destinations={destinations}
          canAssignItems={canAssignItems}
        />
      )}
      <RevisionActionDialog action="archive" backlog={backlog} release={release} />
    </div>
  );
}

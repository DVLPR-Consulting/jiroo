"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeSprintAction,
  startSprintAction,
} from "@/app/actions/sprints";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
import {
  hasBadInput,
  readDateEntry,
  SprintDateFields,
} from "@/components/sprints/sprint-date-fields";
import {
  resolveSprintDates,
  startSprintDateDefaults,
  type SprintDateErrors,
} from "@/lib/items/sprint-dates";
import type { SprintMetrics, SprintSummary } from "@/lib/items/sprint-planning";
import { countLabel, formatPoints, pointsLabel } from "@/lib/format/plural";

const TEXTAREA =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type StartSprintDialogProps = {
  backlogId: string;
  backlogKey: string;
  sprint: SprintSummary;
  metrics: SprintMetrics;
};

type CompleteSprintDialogProps = StartSprintDialogProps & {
  plannedSprints: Array<{ id: string; name: string }>;
  completedMetrics: SprintMetrics;
  incompleteMetrics: SprintMetrics;
};

function MetricsSummary({ metrics }: { metrics: SprintMetrics }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <span>{countLabel(metrics.itemCount, "tâche", "tâches")}</span>
      <span>
        {metrics.capacityPoints === null
          ? pointsLabel(metrics.estimatedPoints)
          : `${formatPoints(metrics.estimatedPoints)} / ${pointsLabel(metrics.capacityPoints)}`}
      </span>
      {metrics.unestimatedCount > 0 && (
        <span>
          {countLabel(metrics.unestimatedCount, "non estimée", "non estimées")}
        </span>
      )}
    </div>
  );
}

export function StartSprintDialog({
  backlogId,
  backlogKey,
  sprint,
  metrics,
}: StartSprintDialogProps) {
  const router = useRouter();
  const prefix = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal ?? "");
  // Prefilled like Jira on every opening (see reset): planned dates, else
  // now and two weeks later. Nothing is computed before the first opening.
  const [start, setStart] = useState({ date: "", time: "" });
  const [end, setEnd] = useState({ date: "", time: "" });
  const [capacity, setCapacity] = useState(
    sprint.capacityPoints === null ? "" : String(sprint.capacityPoints),
  );
  const [error, setError] = useState<string | null>(null);
  const [dateErrors, setDateErrors] = useState<SprintDateErrors>({});
  const [capacityError, setCapacityError] = useState<string | null>(null);

  function reset() {
    const defaults = startSprintDateDefaults(sprint.plannedStartAt, sprint.plannedEndAt, new Date());
    setName(sprint.name);
    setGoal(sprint.goal ?? "");
    setStart(defaults.start);
    setEnd(defaults.end);
    setCapacity(sprint.capacityPoints === null ? "" : String(sprint.capacityPoints));
    setError(null);
    setDateErrors({});
    setCapacityError(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDateErrors({});
    setCapacityError(null);
    // The form is `noValidate`: dates and capacity are checked here so each
    // field gets a French message instead of the browser's bubble (JIR-87).
    const form = event.currentTarget as HTMLFormElement;
    const dates = resolveSprintDates({
      start: readDateEntry(form, "start", start),
      end: readDateEntry(form, "end", end),
      required: true,
    });
    const capacityInvalid = hasBadInput(form, "capacity");
    if (!dates.ok || capacityInvalid) {
      if (!dates.ok) setDateErrors(dates.errors);
      if (capacityInvalid) setCapacityError("Capacité invalide.");
      return;
    }
    const { startAt, endAt } = dates;
    if (!startAt || !endAt) return;
    startTransition(async () => {
      try {
        const result = await startSprintAction({
          backlogKey,
          backlogId,
          id: sprint.id,
          name,
          goal: goal.trim() || null,
          startAt,
          endAt,
          capacityPoints: capacity === "" ? null : Number(capacity),
        });
        if (!result.ok) {
          setError(result.error);
          if ("fieldErrors" in result) {
            setDateErrors({
              start: result.fieldErrors?.startAt?.[0],
              end: result.fieldErrors?.endAt?.[0],
            });
          }
          return;
        }
        setOpen(false);
        router.push(`/b/${backlogKey}?view=board`);
      } catch {
        setError("Démarrage impossible.");
      }
    });
  }

  const selectedCapacity = capacity === "" ? null : Number(capacity);
  const overCapacityPoints =
    selectedCapacity === null
      ? 0
      : Math.round(
          Math.max(0, metrics.estimatedPoints - selectedCapacity) * 100,
        ) / 100;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Keep the dialog open while a request is in flight (JIR-57).
        if (!next && pending) return;
        // Resync from the current props on every open: the sprint may have
        // been renamed or re-planned since mount (JIR-54).
        if (next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          Démarrer le sprint{" "}<span className="sr-only">{sprint.name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Démarrer {sprint.name}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" noValidate onSubmit={submit}>
          <div className="rounded-lg bg-muted p-3">
            <MetricsSummary metrics={{ ...metrics, capacityPoints: selectedCapacity }} />
          </div>
          {overCapacityPoints > 0 && (
            <p className="rounded-lg bg-amber-500/10 p-2 text-sm text-amber-800 dark:text-amber-300" role="alert">
              {`Dépassement de ${pointsLabel(overCapacityPoints)}. Vous pouvez tout de même démarrer.`}
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-name`}>Nom</Label>
            <Input id={`${prefix}-name`} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-goal`}>Objectif</Label>
            <textarea id={`${prefix}-goal`} className={TEXTAREA} value={goal} onChange={(event) => setGoal(event.target.value)} />
          </div>
          <SprintDateFields
            prefix={prefix}
            startLabel="Début"
            endLabel="Fin"
            start={start}
            end={end}
            errors={dateErrors}
            onStartChange={(value) => {
              setStart(value);
              setDateErrors((current) => ({ ...current, start: undefined }));
            }}
            onEndChange={(value) => {
              setEnd(value);
              setDateErrors((current) => ({ ...current, end: undefined }));
            }}
          />
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-capacity`}>Capacité (points)</Label>
            <Input
              id={`${prefix}-capacity`}
              name="capacity"
              type="number"
              min="0"
              max="999.99"
              step="0.01"
              value={capacity}
              aria-invalid={capacityError ? true : undefined}
              aria-describedby={capacityError ? `${prefix}-capacity-error` : undefined}
              onChange={(event) => setCapacity(event.target.value)}
            />
            {capacityError && (
              <p id={`${prefix}-capacity-error`} className="text-sm text-destructive">
                {capacityError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Démarrage…" : "Confirmer le démarrage"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteSprintDialog({
  backlogId,
  backlogKey,
  sprint,
  plannedSprints,
  completedMetrics,
  incompleteMetrics,
}: CompleteSprintDialogProps) {
  const router = useRouter();
  const prefix = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [destination, setDestination] = useState("backlog");
  const [newSprintName, setNewSprintName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [itemKeys, setItemKeys] = useState<string[]>([]);

  function reset() {
    setDestination("backlog");
    setNewSprintName("");
    setError(null);
    setItemKeys([]);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setItemKeys([]);
    startTransition(async () => {
      try {
        const destinationInput = destination === "backlog"
          ? ({ type: "backlog" } as const)
          : destination === "new"
            ? ({ type: "new_sprint", name: newSprintName } as const)
            : ({ type: "existing_sprint", sprintId: destination.slice("existing:".length) } as const);
        const result = await completeSprintAction({
          backlogKey,
          backlogId,
          id: sprint.id,
          destination: destinationInput,
        });
        if (!result.ok) {
          setError(result.error);
          if ("itemKeys" in result) setItemKeys(result.itemKeys ?? []);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch {
        setError("Impossible de terminer le sprint.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Keep the dialog open while a request is in flight (JIR-57).
        if (!next && pending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          Terminer le sprint{" "}<span className="sr-only">{sprint.name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Terminer {sprint.name}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted p-3">
              <p className="font-medium">Terminées</p>
              <p>{countLabel(completedMetrics.itemCount, "tâche", "tâches")} · {pointsLabel(completedMetrics.estimatedPoints)}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="font-medium">Incomplètes</p>
              <p>{countLabel(incompleteMetrics.itemCount, "tâche", "tâches")} · {pointsLabel(incompleteMetrics.estimatedPoints)}</p>
            </div>
          </div>
          {sprint.goal && <p className="text-sm text-muted-foreground">Objectif : {sprint.goal}</p>}
          {error && (
            <div className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive" role="alert">
              <p>{error}</p>
              {itemKeys.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {itemKeys.map((key) => <li key={key}>{key}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-destination`}>Destination des tâches incomplètes</Label>
            <SelectField
              id={`${prefix}-destination`}
              value={destination}
              onValueChange={setDestination}
              options={[
                { value: "backlog", label: "Backlog" },
                ...plannedSprints.map((planned) => ({
                  value: `existing:${planned.id}`,
                  label: planned.name,
                })),
                { value: "new", label: "Nouveau sprint" },
              ]}
            />
          </div>
          {destination === "new" && (
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-new-name`}>Nom du nouveau sprint</Label>
              <Input id={`${prefix}-new-name`} value={newSprintName} onChange={(event) => setNewSprintName(event.target.value)} maxLength={120} />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending || (destination === "new" && !newSprintName.trim())}>
              {pending ? "Fin du sprint…" : "Terminer le sprint"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

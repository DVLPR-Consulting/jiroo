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
import type { SprintMetrics, SprintSummary } from "@/lib/items/sprint-planning";
import { countLabel, formatPoints, pointsLabel } from "@/lib/format/plural";

const FIELD =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
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

function toLocalDateTime(value: Date | null): string {
  if (!value) return "";
  const part = (number: number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${part(value.getMonth() + 1)}-${part(value.getDate())}T${part(value.getHours())}:${part(value.getMinutes())}`;
}

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
  const [startAt, setStartAt] = useState(toLocalDateTime(sprint.plannedStartAt));
  const [endAt, setEndAt] = useState(toLocalDateTime(sprint.plannedEndAt));
  const [capacity, setCapacity] = useState(
    sprint.capacityPoints === null ? "" : String(sprint.capacityPoints),
  );
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName(sprint.name);
    setGoal(sprint.goal ?? "");
    setStartAt(toLocalDateTime(sprint.plannedStartAt));
    setEndAt(toLocalDateTime(sprint.plannedEndAt));
    setCapacity(sprint.capacityPoints === null ? "" : String(sprint.capacityPoints));
    setError(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await startSprintAction({
          backlogKey,
          backlogId,
          id: sprint.id,
          name,
          goal: goal.trim() || null,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          capacityPoints: capacity === "" ? null : Number(capacity),
        });
        if (!result.ok) {
          setError(result.error);
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
        <form className="space-y-4" onSubmit={submit}>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-start`}>Début</Label>
              <Input id={`${prefix}-start`} type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-end`}>Fin</Label>
              <Input id={`${prefix}-end`} type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-capacity`}>Capacité (points)</Label>
            <Input id={`${prefix}-capacity`} type="number" min="0" max="999.99" step="0.01" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim() || !startAt || !endAt}>
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
        setError("Clôture impossible.");
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
          <DialogTitle>Clôturer {sprint.name}</DialogTitle>
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
            <select id={`${prefix}-destination`} className={FIELD} value={destination} onChange={(event) => setDestination(event.target.value)}>
              <option value="backlog">Backlog</option>
              {plannedSprints.map((planned) => (
                <option key={planned.id} value={`existing:${planned.id}`}>{planned.name}</option>
              ))}
              <option value="new">Nouveau sprint</option>
            </select>
          </div>
          {destination === "new" && (
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-new-name`}>Nom du nouveau sprint</Label>
              <Input id={`${prefix}-new-name`} value={newSprintName} onChange={(event) => setNewSprintName(event.target.value)} maxLength={120} />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending || (destination === "new" && !newSprintName.trim())}>
              {pending ? "Clôture…" : "Confirmer la clôture"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

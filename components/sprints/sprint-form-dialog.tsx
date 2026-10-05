"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  createSprintAction,
  updateSprintAction,
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

const TEXTAREA =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export type SprintFormSummary = {
  id: string;
  name: string;
  goal: string | null;
  state: "planned" | "active" | "completed";
  plannedStartAt: string | Date | null;
  plannedEndAt: string | Date | null;
  capacityPoints: number | null;
};

function toLocalDateTime(value: string | Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function CreateSprintButton({
  backlogId,
  backlogKey,
}: {
  backlogId: string;
  backlogKey: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createSprintAction({ backlogId, backlogKey });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" onClick={create} disabled={pending}>
        <Plus className="size-4" />
        {pending ? "Création…" : "Créer un sprint"}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function EditSprintDialog({
  backlogId,
  backlogKey,
  sprint,
  trigger,
}: {
  backlogId: string;
  backlogKey: string;
  sprint: SprintFormSummary;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const prefix = useId();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal ?? "");
  const [plannedStartAt, setPlannedStartAt] = useState(
    toLocalDateTime(sprint.plannedStartAt),
  );
  const [plannedEndAt, setPlannedEndAt] = useState(
    toLocalDateTime(sprint.plannedEndAt),
  );
  const [capacity, setCapacity] = useState(
    sprint.capacityPoints === null ? "" : String(sprint.capacityPoints),
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const completed = sprint.state === "completed";

  function reset() {
    setName(sprint.name);
    setGoal(sprint.goal ?? "");
    setPlannedStartAt(toLocalDateTime(sprint.plannedStartAt));
    setPlannedEndAt(toLocalDateTime(sprint.plannedEndAt));
    setCapacity(sprint.capacityPoints === null ? "" : String(sprint.capacityPoints));
    setError(null);
    setFieldErrors({});
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateSprintAction({
        backlogKey,
        backlogId,
        id: sprint.id,
        name,
        goal: goal.trim() || null,
        ...(completed
          ? {}
          : {
              plannedStartAt: toIso(plannedStartAt),
              plannedEndAt: toIso(plannedEndAt),
              capacityPoints: capacity === "" ? null : Number(capacity),
            }),
      });
      if (!result.ok) {
        setError(result.error);
        if ("fieldErrors" in result) setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const nameError = fieldErrors.name?.[0];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Resync from the current props on every open: the sprint may have
        // been renamed or re-planned since mount (JIR-54).
        if (next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="ghost" size="sm">
            Modifier <span className="sr-only">{sprint.name}</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Modifier {sprint.name}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {error && (
            <p className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {completed && (
            <p className="text-sm text-muted-foreground">
              Ce sprint terminé permet uniquement de modifier son nom et son objectif.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-name`}>Nom</Label>
            <Input
              id={`${prefix}-name`}
              value={name}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${prefix}-name-error` : undefined}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              autoFocus
            />
            {nameError && (
              <p id={`${prefix}-name-error`} className="text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-goal`}>Objectif</Label>
            <textarea
              id={`${prefix}-goal`}
              className={TEXTAREA}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              maxLength={2_000}
            />
          </div>
          {!completed && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor={`${prefix}-start`}>Début prévu</Label>
                  <Input
                    id={`${prefix}-start`}
                    type="datetime-local"
                    value={plannedStartAt}
                    onChange={(event) => setPlannedStartAt(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${prefix}-end`}>Fin prévue</Label>
                  <Input
                    id={`${prefix}-end`}
                    type="datetime-local"
                    value={plannedEndAt}
                    onChange={(event) => setPlannedEndAt(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${prefix}-capacity`}>Capacité (points)</Label>
                <Input
                  id={`${prefix}-capacity`}
                  type="number"
                  min="0"
                  max="999.99"
                  step="0.01"
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                />
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

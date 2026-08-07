"use client";

import {
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  createReleaseAction,
  updateReleaseAction,
} from "@/app/actions/releases";
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
import { toast } from "@/lib/toast";
import type { ReleaseSummary } from "@/lib/services/releases";
import type { ReleasePersonOption } from "@/components/releases/release-list";

const TEXTAREA =
  "min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const SELECT =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Backlog = { id: string; key: string; name: string };
type SharedProps = {
  backlog: Backlog;
  actor: ReleasePersonOption;
  driverOptions: ReleasePersonOption[];
  canBrowseUsers: boolean;
};

type FieldsProps = SharedProps & {
  allowEmptyDriver: boolean;
  prefix: string;
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  startDate: string;
  setStartDate: (value: string) => void;
  targetDate: string;
  setTargetDate: (value: string) => void;
  driverId: string;
  setDriverId: (value: string) => void;
  fixedDriverName: string;
  targetDateRef: React.RefObject<HTMLInputElement | null>;
  nameRef: React.RefObject<HTMLInputElement | null>;
  fieldErrors: Partial<Record<"name" | "targetDate", string[]>>;
};

function ReleaseFields({
  allowEmptyDriver,
  actor,
  canBrowseUsers,
  description,
  driverId,
  driverOptions,
  fixedDriverName,
  name,
  prefix,
  setDescription,
  setDriverId,
  setName,
  setStartDate,
  setTargetDate,
  startDate,
  targetDate,
  targetDateRef,
  nameRef,
  fieldErrors,
}: FieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-name`}>Nom</Label>
        <Input
          ref={nameRef}
          id={`${prefix}-name`}
          required
          autoFocus
          maxLength={255}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? `${prefix}-name-error` : undefined}
        />
        {fieldErrors.name ? (
          <p id={`${prefix}-name-error`} className="text-sm text-destructive">
            {fieldErrors.name[0]}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-description`}>Description</Label>
        <textarea
          id={`${prefix}-description`}
          className={TEXTAREA}
          maxLength={20_000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-start`}>Date de début</Label>
          <Input
            id={`${prefix}-start`}
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-target`}>Date cible</Label>
          <Input
            ref={targetDateRef}
            id={`${prefix}-target`}
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            aria-invalid={fieldErrors.targetDate ? true : undefined}
            aria-describedby={fieldErrors.targetDate ? `${prefix}-target-error` : undefined}
          />
          {fieldErrors.targetDate ? (
            <p id={`${prefix}-target-error`} className="text-sm text-destructive">
              {fieldErrors.targetDate[0]}
            </p>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-driver`}>Pilote</Label>
        {canBrowseUsers ? (
          <select
            id={`${prefix}-driver`}
            className={SELECT}
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
          >
            {allowEmptyDriver ? <option value="">Aucun pilote</option> : null}
            {driverOptions.map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.name}</option>
            ))}
          </select>
        ) : (
          <output id={`${prefix}-driver`} className="block rounded-lg border bg-muted px-3 py-2 text-sm">
            {fixedDriverName || actor.name}
          </output>
        )}
      </div>
    </>
  );
}

function invalidDateOrder(startDate: string, targetDate: string) {
  return Boolean(startDate && targetDate && targetDate < startDate);
}

function releaseFieldErrors(result: { fieldErrors?: unknown }) {
  const raw = result.fieldErrors as Record<string, string[] | undefined> | undefined;
  return {
    ...(raw?.name ? { name: raw.name } : {}),
    ...(raw?.targetDate ? { targetDate: raw.targetDate } : {}),
  };
}

export function CreateReleaseDialog({
  backlog,
  actor,
  driverOptions,
  canBrowseUsers,
  trigger,
}: SharedProps & { trigger?: ReactNode }) {
  const router = useRouter();
  const prefix = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const targetDateRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [driverId, setDriverId] = useState(actor.id);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"name" | "targetDate", string[]>>>({});

  function reset() {
    setName("");
    setDescription("");
    setStartDate("");
    setTargetDate("");
    setDriverId(actor.id);
    setError(null);
    setFieldErrors({});
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalidDateOrder(startDate, targetDate)) {
      setError("La date cible doit suivre la date de début.");
      setFieldErrors({ targetDate: ["La date cible doit suivre la date de début."] });
      targetDateRef.current?.focus();
      return;
    }
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      try {
        const result = await createReleaseAction({
          backlogId: backlog.id,
          backlogKey: backlog.key,
          name,
          description: description.trim() || null,
          startDate: startDate || null,
          targetDate: targetDate || null,
          driverId: canBrowseUsers ? driverId : actor.id,
        });
        if (!result.ok) {
          setError(result.error);
          const nextFieldErrors = releaseFieldErrors(result);
          setFieldErrors(nextFieldErrors);
          if (nextFieldErrors.name) nameRef.current?.focus();
          else if (nextFieldErrors.targetDate) targetDateRef.current?.focus();
          return;
        }
        reset();
        setOpen(false);
        toast.success("Release créée.");
        router.refresh();
      } catch {
        setError("Création de release impossible.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? <Button type="button">Créer une version</Button>}
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Créer une version</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div aria-live="polite">
            {error ? <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null}
          </div>
          <ReleaseFields
            allowEmptyDriver={false}
            backlog={backlog}
            actor={actor}
            driverOptions={driverOptions}
            canBrowseUsers={canBrowseUsers}
            prefix={prefix}
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            startDate={startDate}
            setStartDate={setStartDate}
            targetDate={targetDate}
            setTargetDate={setTargetDate}
            driverId={driverId}
            setDriverId={setDriverId}
            fixedDriverName={actor.name}
            targetDateRef={targetDateRef}
            nameRef={nameRef}
            fieldErrors={fieldErrors}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()} aria-busy={pending || undefined}>
              {pending ? "Création…" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type EditReleaseDialogProps = SharedProps & {
  release: ReleaseSummary;
  trigger?: ReactNode;
};

function EditReleaseDialogState({
  backlog,
  actor,
  driverOptions,
  canBrowseUsers,
  release,
  trigger,
}: EditReleaseDialogProps) {
  const router = useRouter();
  const prefix = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const targetDateRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(release.name);
  const [description, setDescription] = useState(release.description ?? "");
  const [startDate, setStartDate] = useState(release.startDate ?? "");
  const [targetDate, setTargetDate] = useState(release.targetDate ?? "");
  const [driverId, setDriverId] = useState(release.driver?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"name" | "targetDate", string[]>>>({});
  const stale = error?.includes("a changé") === true;

  function reset() {
    setName(release.name);
    setDescription(release.description ?? "");
    setStartDate(release.startDate ?? "");
    setTargetDate(release.targetDate ?? "");
    setDriverId(release.driver?.id ?? "");
    setError(null);
    setFieldErrors({});
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalidDateOrder(startDate, targetDate)) {
      setError("La date cible doit suivre la date de début.");
      setFieldErrors({ targetDate: ["La date cible doit suivre la date de début."] });
      targetDateRef.current?.focus();
      return;
    }
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      try {
        const result = await updateReleaseAction({
          backlogId: backlog.id,
          backlogKey: backlog.key,
          releaseId: release.id,
          expectedRevision: release.revision,
          name,
          description: description.trim() || null,
          startDate: startDate || null,
          targetDate: targetDate || null,
          ...(canBrowseUsers ? { driverId: driverId || null } : {}),
        });
        if (!result.ok) {
          setError(result.error);
          const nextFieldErrors = releaseFieldErrors(result);
          setFieldErrors(nextFieldErrors);
          if (nextFieldErrors.name) nameRef.current?.focus();
          else if (nextFieldErrors.targetDate) targetDateRef.current?.focus();
          return;
        }
        reset();
        setOpen(false);
        toast.success("Release mise à jour.");
        router.refresh();
      } catch {
        setError("Mise à jour de release impossible.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? <Button type="button" variant="outline" size="sm">Modifier <span className="sr-only">{release.name}</span></Button>}
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Modifier {release.name}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div aria-live="polite">
            {error ? <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null}
          </div>
          <ReleaseFields
            allowEmptyDriver
            backlog={backlog}
            actor={actor}
            driverOptions={driverOptions}
            canBrowseUsers={canBrowseUsers}
            prefix={prefix}
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            startDate={startDate}
            setStartDate={setStartDate}
            targetDate={targetDate}
            setTargetDate={setTargetDate}
            driverId={driverId}
            setDriverId={setDriverId}
            fixedDriverName={release.driver?.name ?? actor.name}
            targetDateRef={targetDateRef}
            nameRef={nameRef}
            fieldErrors={fieldErrors}
          />
          <DialogFooter>
            {stale ? (
              <Button type="button" variant="outline" onClick={() => { reset(); setOpen(false); router.refresh(); }}>
                Recharger la version
              </Button>
            ) : null}
            <Button type="submit" disabled={pending || !name.trim()} aria-busy={pending || undefined}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditReleaseDialog(props: EditReleaseDialogProps) {
  return (
    <EditReleaseDialogState
      key={`${props.release.id}:${props.release.revision}`}
      {...props}
    />
  );
}

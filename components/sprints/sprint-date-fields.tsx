"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SPRINT_DATE_MESSAGES,
  type DateTimeEntry,
  type DateTimeParts,
  type SprintDateErrors,
} from "@/lib/items/sprint-dates";
import { capacityPointsSchema } from "@/lib/validation/sprint";

type Bound = "start" | "end";

/**
 * Field values plus the browser's partial-entry flags: a half-typed date or
 * time input reports an empty value, so only `validity.badInput` tells it
 * apart from an empty field. Read at submit, since forms use `noValidate`.
 */
export function readDateEntry(
  form: HTMLFormElement,
  bound: Bound,
  parts: DateTimeParts,
): DateTimeEntry {
  const badInput = (name: string) => {
    const input = form.elements.namedItem(name);
    return input instanceof HTMLInputElement && input.validity.badInput;
  };
  return {
    ...parts,
    dateIncomplete: badInput(`${bound}-date`),
    timeIncomplete: badInput(`${bound}-time`),
  };
}

/** True when a native number input holds text the browser cannot parse. */
function hasBadInput(form: HTMLFormElement, name: string): boolean {
  const input = form.elements.namedItem(name);
  return input instanceof HTMLInputElement && input.validity.badInput;
}

/**
 * Client check of the capacity field, with the server schema's messages:
 * `noValidate` turns off the native min / max / step constraints.
 */
export function capacityInputError(form: HTMLFormElement, value: string): string | null {
  if (hasBadInput(form, "capacity")) return "Capacité invalide.";
  if (value === "") return null;
  const parsed = capacityPointsSchema.safeParse(Number(value));
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Capacité invalide.");
}

/**
 * Moves focus to the first invalid field, as native validation did, so the
 * field's label and its error (via aria-describedby) are read out once.
 */
export function focusFirstInvalid(
  form: HTMLFormElement,
  errors: SprintDateErrors & { name?: string | null; capacity?: string | null },
) {
  const datePart = (bound: Bound, message: string) =>
    message === SPRINT_DATE_MESSAGES.invalidTime ? `${bound}-time` : `${bound}-date`;
  const target = errors.name
    ? "name"
    : errors.start
      ? datePart("start", errors.start)
      : errors.end
        ? datePart("end", errors.end)
        : errors.capacity
          ? "capacity"
          : null;
  if (!target) return;
  const input = form.elements.namedItem(target);
  if (input instanceof HTMLElement) input.focus();
}

function DateField({
  prefix,
  bound,
  label,
  timeLabel,
  value,
  error,
  hintId,
  onChange,
}: {
  prefix: string;
  bound: Bound;
  label: string;
  timeLabel: string;
  value: DateTimeParts;
  error?: string;
  hintId: string;
  onChange: (value: DateTimeParts) => void;
}) {
  const errorId = `${prefix}-${bound}-error`;
  const describedBy = error ? `${errorId} ${hintId}` : hintId;
  return (
    <div className="space-y-2">
      <Label htmlFor={`${prefix}-${bound}`}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={`${prefix}-${bound}`}
          name={`${bound}-date`}
          type="date"
          value={value.date}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange({ ...value, date: event.target.value })}
        />
        <Input
          id={`${prefix}-${bound}-time`}
          name={`${bound}-time`}
          type="time"
          className="w-28 shrink-0"
          aria-label={timeLabel}
          value={value.time}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange({ ...value, time: event.target.value })}
        />
      </div>
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Start and end of a sprint as a date plus an optional time each (JIR-87):
 * a day alone is enough, the time defaults to 09:00 / 18:00.
 */
export function SprintDateFields({
  prefix,
  startLabel,
  endLabel,
  start,
  end,
  errors,
  onStartChange,
  onEndChange,
}: {
  prefix: string;
  startLabel: string;
  endLabel: string;
  start: DateTimeParts;
  end: DateTimeParts;
  errors: SprintDateErrors;
  onStartChange: (value: DateTimeParts) => void;
  onEndChange: (value: DateTimeParts) => void;
}) {
  const hintId = `${prefix}-dates-hint`;
  return (
    <div className="space-y-3">
      <DateField
        prefix={prefix}
        bound="start"
        label={startLabel}
        timeLabel="Heure de début"
        value={start}
        error={errors.start}
        hintId={hintId}
        onChange={onStartChange}
      />
      <DateField
        prefix={prefix}
        bound="end"
        label={endLabel}
        timeLabel="Heure de fin"
        value={end}
        error={errors.end}
        hintId={hintId}
        onChange={onEndChange}
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        Heure facultative : 9 h pour le début et 18 h pour la fin par défaut.
      </p>
    </div>
  );
}
